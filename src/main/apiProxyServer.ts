import { createServer, IncomingMessage, ServerResponse } from 'http'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { SettingsStore, type FallbackConfig } from './settingsStore'
import WebSocket from 'ws'

const PROXY_PORT = 9527

// [2026-04-30] Fallback cooldown: after primary fails, use first enabled fallback for 5 minutes
const FALLBACK_COOLDOWN_MS = 5 * 60 * 1000
let primaryFailedAt: number | null = null
let cooldownFallbackIndex: number | null = null // which fallback is being used during cooldown

type ProxyState = {
  server: ReturnType<typeof createServer> | null
  wsServer: WebSocket.Server | null
  running: boolean
}

const state: ProxyState = { server: null, wsServer: null, running: false }

// [2026-04-30] Get enabled fallbacks from profile
function getEnabledFallbacks(profile: { fallbacks?: FallbackConfig[] }): FallbackConfig[] {
  return (profile.fallbacks ?? []).filter(f => f.enabled && f.baseUrl)
}

// [2026-04-30] Apply fallback model override to request body
function applyModelOverride(body: Buffer, model?: string): Buffer {
  if (!model || body.length === 0) return body
  try {
    const json = JSON.parse(body.toString())
    if (json.model) {
      json.model = model
      return Buffer.from(JSON.stringify(json))
    }
  } catch { /* keep original body */ }
  return body
}

function forwardRequest(
  targetBaseUrl: string,
  authToken: string,
  format: 'anthropic' | 'openai' | undefined, // [2026-04-30] OpenAI 兼容格式
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  fallbackIndex: number, // -1 = primary, 0+ = fallback index
  originalBaseUrl: string
): void {
  // Preserve original request path when switching to fallback
  let requestPath = req.url ?? '/'
  if (originalBaseUrl !== targetBaseUrl) {
    const originalBasePath = new URL(originalBaseUrl).pathname
    if (requestPath.startsWith(originalBasePath)) {
      requestPath = requestPath.slice(originalBasePath.length)
    }
  }
  const targetUrl = new URL(targetBaseUrl)
  const fullPath = targetUrl.pathname + requestPath

  const isHttps = targetUrl.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue
    if (key.toLowerCase() === 'authorization') continue
    if (key.toLowerCase() === 'x-api-key') continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value[0]
  }
  headers['host'] = targetUrl.host
  // [2026-04-30] OpenAI 兼容格式使用 Authorization: Bearer
  if (format === 'openai') {
    headers['authorization'] = `Bearer ${authToken}`
  } else {
    headers['x-api-key'] = authToken
  }

  const proxyReq = requestFn(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: fullPath,
      method: req.method,
      headers,
      timeout: 60000
    },
    (proxyRes) => {
      const statusCode = proxyRes.statusCode ?? 200
      if (statusCode >= 400) {
        // Try next fallback
        const settings = new SettingsStore().get()
        const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
        if (!profile) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No active profile' }))
          return
        }

        const fallbacks = getEnabledFallbacks(profile)
        const nextFallbackIndex = fallbackIndex + 1

        if (nextFallbackIndex < fallbacks.length) {
          // Try next fallback
          const nextFallback = fallbacks[nextFallbackIndex]
          console.log(`[API Proxy] Level ${fallbackIndex === -1 ? 'primary' : `#${fallbackIndex + 1}`} failed (${statusCode}), trying #${nextFallbackIndex + 1}: ${nextFallback.name}`)
          proxyRes.resume()
          primaryFailedAt = Date.now()
          cooldownFallbackIndex = nextFallbackIndex
          forwardRequest(
            nextFallback.baseUrl,
            nextFallback.authToken,
            nextFallback.format,
            req,
            res,
            applyModelOverride(body, nextFallback.model),
            nextFallbackIndex,
            originalBaseUrl
          )
        } else if (fallbackIndex === -1) {
          // Primary failed, no fallbacks
          console.log(`[API Proxy] Primary failed (${statusCode}), no enabled fallbacks`)
          proxyRes.resume()
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Primary returned ${statusCode}, no enabled fallbacks` }))
        } else {
          // All fallbacks exhausted
          console.log(`[API Proxy] All ${fallbacks.length} fallbacks exhausted, last status: ${statusCode}`)
          proxyRes.resume()
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `All fallbacks failed, last status: ${statusCode}` }))
        }
        return
      }

      // Success — clear cooldown if this was primary
      if (fallbackIndex === -1) {
        primaryFailedAt = null
        cooldownFallbackIndex = null
      }
      res.writeHead(statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (err) => {
    console.error(`[API Proxy] Level ${fallbackIndex === -1 ? 'primary' : `#${fallbackIndex + 1}`} error:`, err.message)
    const settings = new SettingsStore().get()
    const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
    if (!profile) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No active profile' }))
      return
    }

    const fallbacks = getEnabledFallbacks(profile)
    const nextFallbackIndex = fallbackIndex + 1

    if (nextFallbackIndex < fallbacks.length) {
      const nextFallback = fallbacks[nextFallbackIndex]
      console.log(`[API Proxy] Trying #${nextFallbackIndex + 1}: ${nextFallback.name}`)
      primaryFailedAt = Date.now()
      cooldownFallbackIndex = nextFallbackIndex
      forwardRequest(
        nextFallback.baseUrl,
        nextFallback.authToken,
        req,
        res,
        applyModelOverride(body, nextFallback.model),
        nextFallbackIndex,
        originalBaseUrl
      )
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    console.log(`[API Proxy] Level ${fallbackIndex === -1 ? 'primary' : `#${fallbackIndex + 1}`} timeout`)
    const settings = new SettingsStore().get()
    const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
    if (!profile) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No active profile' }))
      return
    }

    const fallbacks = getEnabledFallbacks(profile)
    const nextFallbackIndex = fallbackIndex + 1

    if (nextFallbackIndex < fallbacks.length) {
      const nextFallback = fallbacks[nextFallbackIndex]
      console.log(`[API Proxy] Trying #${nextFallbackIndex + 1}: ${nextFallback.name}`)
      primaryFailedAt = Date.now()
      cooldownFallbackIndex = nextFallbackIndex
      forwardRequest(
        nextFallback.baseUrl,
        nextFallback.authToken,
        req,
        res,
        applyModelOverride(body, nextFallback.model),
        nextFallbackIndex,
        originalBaseUrl
      )
    } else {
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'All levels timeout' }))
    }
  })

  proxyReq.write(body)
  proxyReq.end()
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const settings = new SettingsStore().get()
    const profile = settings.profiles.find(p => p.id === settings.activeProfileId)

    if (!profile) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No active profile' }))
      return
    }

    const fallbacks = getEnabledFallbacks(profile)

    // Check cooldown: if primary failed recently, use the fallback that succeeded
    const inCooldown = primaryFailedAt && (Date.now() - primaryFailedAt < FALLBACK_COOLDOWN_MS)
    if (inCooldown && cooldownFallbackIndex !== null && cooldownFallbackIndex < fallbacks.length) {
      const cooldownFallback = fallbacks[cooldownFallbackIndex]
      console.log(`[API Proxy] In cooldown, using #${cooldownFallbackIndex + 1}: ${cooldownFallback.name}`)
      forwardRequest(
        cooldownFallback.baseUrl,
        cooldownFallback.authToken,
        cooldownFallback.format,
        req,
        res,
        applyModelOverride(body, cooldownFallback.model),
        cooldownFallbackIndex,
        profile.baseUrl
      )
    } else {
      console.log('[API Proxy] Forwarding to primary:', profile.baseUrl)
      forwardRequest(profile.baseUrl, profile.authToken, profile.format, req, res, body, -1, profile.baseUrl)
    }
  })
  req.on('error', (err) => {
    console.error('[API Proxy] Request read error:', err.message)
    res.writeHead(400)
    res.end()
  })
}

function handleWebSocket(wsClient: WebSocket, req: IncomingMessage): void {
  const settings = new SettingsStore().get()
  const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
  if (!profile) {
    wsClient.close(1008, 'No active profile')
    return
  }

  const fallbacks = getEnabledFallbacks(profile)
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue
    if (key.toLowerCase() === 'authorization') continue
    if (key.toLowerCase() === 'x-api-key') continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value[0]
  }

  let wsIndex = -1 // -1 = primary, 0+ = fallback index
  const wsUrl = profile.baseUrl.replace(/^http/, 'ws') + '/v1/realtime'
  // [2026-04-30] OpenAI 兼容格式使用 Authorization: Bearer
  if (profile.format === 'openai') {
    headers['authorization'] = `Bearer ${profile.authToken}`
  } else {
    headers['x-api-key'] = profile.authToken
  }
  console.log('[API Proxy] WebSocket forwarding to primary:', wsUrl)

  let wsTarget = new WebSocket(wsUrl, { headers })

  const tryNextFallback = (): boolean => {
    wsIndex++
    if (wsIndex >= fallbacks.length) return false
    const fallback = fallbacks[wsIndex]
    console.log(`[API Proxy] WebSocket trying #${wsIndex + 1}: ${fallback.name}`)
    // [2026-04-30] OpenAI 兼容格式
    if (fallback.format === 'openai') {
      headers['authorization'] = `Bearer ${fallback.authToken}`
      delete headers['x-api-key']
    } else {
      headers['x-api-key'] = fallback.authToken
      delete headers['authorization']
    }
    const fallbackWsUrl = fallback.baseUrl.replace(/^http/, 'ws') + '/v1/realtime'
    wsTarget = new WebSocket(fallbackWsUrl, { headers })
    return true
  }

  wsTarget.on('open', () => {
    console.log(`[API Proxy] WebSocket connected to ${wsIndex === -1 ? 'primary' : `#${wsIndex + 1}`}`)
    wsClient.on('message', (data) => wsTarget.send(data))
    wsTarget.on('message', (data) => wsClient.send(data))
  })

  wsTarget.on('error', (err) => {
    console.error(`[API Proxy] WebSocket ${wsIndex === -1 ? 'primary' : `#${wsIndex + 1}`} error:`, err.message)
    if (tryNextFallback()) {
      wsTarget.on('open', () => {
        console.log(`[API Proxy] WebSocket connected to #${wsIndex + 1}`)
        wsClient.on('message', (data) => wsTarget.send(data))
        wsTarget.on('message', (data) => wsClient.send(data))
      })
      wsTarget.on('error', (fallbackErr) => {
        console.error(`[API Proxy] WebSocket #${wsIndex + 1} error:`, fallbackErr.message)
        if (!tryNextFallback()) {
          wsClient.close(1011, 'All WebSocket fallbacks failed')
        }
      })
    } else {
      wsClient.close(1011, 'WebSocket connection failed')
    }
  })

  wsTarget.on('close', (code, reason) => {
    wsClient.close(code, reason)
  })

  wsClient.on('close', () => {
    wsTarget.close()
  })
}

export function startApiProxy(): number {
  if (state.running) return PROXY_PORT

  state.server = createServer(handleRequest)
  state.wsServer = new WebSocket.Server({ server: state.server })

  state.wsServer.on('connection', handleWebSocket)

  state.server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`[API Proxy] Server listening on http://127.0.0.1:${PROXY_PORT} (HTTP + WebSocket)`)
    state.running = true
  })

  state.server.on('error', (err) => {
    console.error('[API Proxy] Server error:', err.message)
    state.running = false
  })

  return PROXY_PORT
}

export function stopApiProxy(): void {
  if (state.wsServer) {
    state.wsServer.close()
    state.wsServer = null
  }
  if (state.server) {
    state.server.close()
    state.server = null
  }
  state.running = false
  primaryFailedAt = null
  cooldownFallbackIndex = null
  console.log('[API Proxy] Server stopped')
}

export function isApiProxyRunning(): boolean {
  return state.running
}

export function getProxyPort(): number {
  return PROXY_PORT
}