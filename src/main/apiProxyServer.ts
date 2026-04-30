import { createServer, IncomingMessage, ServerResponse } from 'http'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { SettingsStore } from './settingsStore'
import WebSocket from 'ws'

const PROXY_PORT = 9527

// [2026-04-30] Fallback cooldown: after primary fails, use fallback for 5 minutes
const FALLBACK_COOLDOWN_MS = 5 * 60 * 1000
let primaryFailedAt: number | null = null

type ProxyState = {
  server: ReturnType<typeof createServer> | null
  wsServer: WebSocket.Server | null
  running: boolean
}

const state: ProxyState = { server: null, wsServer: null, running: false }

function forwardRequest(
  targetBaseUrl: string,
  authToken: string,
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  fallbackAttempt: boolean,
  originalBaseUrl?: string
): void {
  // [2026-04-30] Fix: preserve original request path when switching to fallback
  // targetBaseUrl is the API base URL (e.g. https://api.anthropic.com)
  // We need to append the original request path (e.g. /v1/messages)
  let requestPath = req.url ?? '/'
  if (originalBaseUrl && originalBaseUrl !== targetBaseUrl) {
    // Strip original baseUrl's path prefix from requestPath if present
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
  headers['x-api-key'] = authToken

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
      if (statusCode >= 400 && !fallbackAttempt) {
        console.log(`[API Proxy] Primary response status ${statusCode}, trying fallback`)
        primaryFailedAt = Date.now() // [2026-04-30] Start cooldown
        proxyRes.resume()
        const settings = new SettingsStore().get()
        const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
        if (profile?.fallbackBaseUrl && profile.fallbackAuthToken) {
          console.log('[API Proxy] Switching to fallback:', profile.fallbackBaseUrl)
          let fallbackBody = body
          if (profile.fallbackModel && body.length > 0) {
            try {
              const json = JSON.parse(body.toString())
              if (json.model) json.model = profile.fallbackModel
              fallbackBody = Buffer.from(JSON.stringify(json))
            } catch { /* keep original body */ }
          }
          forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, fallbackBody, true, originalBaseUrl)
        } else {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Primary returned ${statusCode}, no fallback configured` }))
        }
        return
      }
      // [2026-04-30] Primary/fallback success — clear cooldown if this was primary
      if (!fallbackAttempt && statusCode < 400) {
        primaryFailedAt = null
      }
      res.writeHead(statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (err) => {
    console.error('[API Proxy] Request error:', err.message)
    if (!fallbackAttempt) {
      primaryFailedAt = Date.now() // [2026-04-30] Start cooldown
      const settings = new SettingsStore().get()
      const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
      if (profile?.fallbackBaseUrl && profile.fallbackAuthToken) {
        console.log('[API Proxy] Switching to fallback:', profile.fallbackBaseUrl)
        let fallbackBody = body
        if (profile.fallbackModel && body.length > 0) {
          try {
            const json = JSON.parse(body.toString())
            if (json.model) json.model = profile.fallbackModel
            fallbackBody = Buffer.from(JSON.stringify(json))
          } catch { /* keep original body */ }
        }
        forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, fallbackBody, true, originalBaseUrl)
      } else {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Primary failed, no fallback configured' }))
      }
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    if (!fallbackAttempt) {
      primaryFailedAt = Date.now() // [2026-04-30] Start cooldown
      console.log('[API Proxy] Primary timeout, trying fallback')
      const settings = new SettingsStore().get()
      const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
      if (profile?.fallbackBaseUrl && profile.fallbackAuthToken) {
        forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, body, true, originalBaseUrl)
      } else {
        res.writeHead(504, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Primary timeout, no fallback configured' }))
      }
    } else {
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Fallback timeout' }))
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

    // [2026-04-30] Check cooldown: if primary failed recently, use fallback directly
    const inCooldown = primaryFailedAt && (Date.now() - primaryFailedAt < FALLBACK_COOLDOWN_MS)
    if (inCooldown && profile.fallbackBaseUrl && profile.fallbackAuthToken) {
      console.log('[API Proxy] In cooldown, using fallback:', profile.fallbackBaseUrl)
      let fallbackBody = body
      if (profile.fallbackModel && body.length > 0) {
        try {
          const json = JSON.parse(body.toString())
          if (json.model) json.model = profile.fallbackModel
          fallbackBody = Buffer.from(JSON.stringify(json))
        } catch { /* keep original body */ }
      }
      forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, fallbackBody, true, profile.baseUrl)
    } else {
      console.log('[API Proxy] Forwarding to primary:', profile.baseUrl)
      forwardRequest(profile.baseUrl, profile.authToken, req, res, body, false, profile.baseUrl)
    }
  })
  req.on('error', (err) => {
    console.error('[API Proxy] Request read error:', err.message)
    res.writeHead(400)
    res.end()
  })
}

function getProfile(): { baseUrl: string; authToken: string; fallbackBaseUrl?: string; fallbackAuthToken?: string } | null {
  const settings = new SettingsStore().get()
  const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
  if (!profile) return null
  return {
    baseUrl: profile.baseUrl,
    authToken: profile.authToken,
    fallbackBaseUrl: profile.fallbackBaseUrl,
    fallbackAuthToken: profile.fallbackAuthToken
  }
}

function handleWebSocket(wsClient: WebSocket, req: IncomingMessage): void {
  const profile = getProfile()
  if (!profile) {
    wsClient.close(1008, 'No active profile')
    return
  }

  // WebSocket URL: convert http/https to ws/wss
  const wsUrl = profile.baseUrl.replace(/^http/, 'ws') + '/v1/realtime'
  console.log('[API Proxy] WebSocket forwarding to:', wsUrl)

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue
    if (key.toLowerCase() === 'authorization') continue
    if (key.toLowerCase() === 'x-api-key') continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value[0]
  }
  headers['x-api-key'] = profile.authToken

  let wsTarget = new WebSocket(wsUrl, { headers })
  let fallbackAttempted = false

  wsTarget.on('open', () => {
    console.log('[API Proxy] WebSocket connected to primary')
    // Bidirectional pipe
    wsClient.on('message', (data) => {
      wsTarget.send(data)
    })
    wsTarget.on('message', (data) => {
      wsClient.send(data)
    })
  })

  wsTarget.on('error', (err) => {
    console.error('[API Proxy] WebSocket primary error:', err.message)
    if (!fallbackAttempted && profile.fallbackBaseUrl && profile.fallbackAuthToken) {
      fallbackAttempted = true
      console.log('[API Proxy] WebSocket switching to fallback:', profile.fallbackBaseUrl)
      wsTarget.close()
      const fallbackWsUrl = profile.fallbackBaseUrl.replace(/^http/, 'ws') + '/v1/realtime'
      headers['x-api-key'] = profile.fallbackAuthToken
      wsTarget = new WebSocket(fallbackWsUrl, { headers })
      wsTarget.on('open', () => {
        console.log('[API Proxy] WebSocket connected to fallback')
        wsClient.on('message', (data) => wsTarget.send(data))
        wsTarget.on('message', (data) => wsClient.send(data))
      })
      wsTarget.on('error', (fallbackErr) => {
        console.error('[API Proxy] WebSocket fallback error:', fallbackErr.message)
        wsClient.close(1011, 'Both primary and fallback WebSocket failed')
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
  console.log('[API Proxy] Server stopped')
}

export function isApiProxyRunning(): boolean {
  return state.running
}

export function getProxyPort(): number {
  return PROXY_PORT
}