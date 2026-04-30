import { createServer, IncomingMessage, ServerResponse } from 'http'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { SettingsStore } from './settingsStore'

const PROXY_PORT = 9527

type ProxyState = {
  server: ReturnType<typeof createServer> | null
  running: boolean
}

const state: ProxyState = { server: null, running: false }

function forwardRequest(
  targetUrl: string,
  authToken: string,
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  fallbackAttempt: boolean
): void {
  const url = new URL(targetUrl)
  const isHttps = url.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue
    if (key.toLowerCase() === 'authorization') continue
    if (key.toLowerCase() === 'x-api-key') continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value[0]
  }
  headers['host'] = url.host
  headers['x-api-key'] = authToken

  const path = url.pathname + url.search

  const proxyReq = requestFn(
    {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path,
      method: req.method,
      headers,
      timeout: 60000
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
      proxyRes.pipe(res)

      if (proxyRes.statusCode && proxyRes.statusCode >= 400 && !fallbackAttempt) {
        console.log(`[API Proxy] Primary response status ${proxyRes.statusCode}`)
      }
    }
  )

  proxyReq.on('error', (err) => {
    console.error('[API Proxy] Request error:', err.message)
    if (!fallbackAttempt) {
      // Try fallback
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
        forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, fallbackBody, true)
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
      console.log('[API Proxy] Primary timeout, trying fallback')
      const settings = new SettingsStore().get()
      const profile = settings.profiles.find(p => p.id === settings.activeProfileId)
      if (profile?.fallbackBaseUrl && profile.fallbackAuthToken) {
        forwardRequest(profile.fallbackBaseUrl, profile.fallbackAuthToken, req, res, body, true)
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

    console.log('[API Proxy] Forwarding to primary:', profile.baseUrl)
    forwardRequest(profile.baseUrl, profile.authToken, req, res, body, false)
  })
  req.on('error', (err) => {
    console.error('[API Proxy] Request read error:', err.message)
    res.writeHead(400)
    res.end()
  })
}

export function startApiProxy(): number {
  if (state.running) return PROXY_PORT

  state.server = createServer(handleRequest)
  state.server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`[API Proxy] Server listening on http://127.0.0.1:${PROXY_PORT}`)
    state.running = true
  })

  state.server.on('error', (err) => {
    console.error('[API Proxy] Server error:', err.message)
    state.running = false
  })

  return PROXY_PORT
}

export function stopApiProxy(): void {
  if (state.server) {
    state.server.close()
    state.server = null
    state.running = false
    console.log('[API Proxy] Server stopped')
  }
}

export function isApiProxyRunning(): boolean {
  return state.running
}

export function getProxyPort(): number {
  return PROXY_PORT
}