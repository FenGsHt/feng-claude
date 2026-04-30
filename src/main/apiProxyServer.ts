import { createServer, IncomingMessage, ServerResponse } from 'http'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { SettingsStore, type FallbackConfig } from './settingsStore'
import WebSocket from 'ws'
import { Transform } from 'stream'

const PROXY_PORT = 9527

// [2026-04-30] Fallback cooldown: after primary fails, use first enabled fallback for 5 minutes
const FALLBACK_COOLDOWN_MS = 5 * 60 * 1000
let primaryFailedAt: number | null = null
let cooldownFallbackIndex: number | null = null

type ProxyState = {
  server: ReturnType<typeof createServer> | null
  wsServer: WebSocket.Server | null
  running: boolean
}

const state: ProxyState = { server: null, wsServer: null, running: false }

function getEnabledFallbacks(profile: { fallbacks?: FallbackConfig[] }): FallbackConfig[] {
  return (profile.fallbacks ?? []).filter(f => f.enabled && f.baseUrl)
}

// [2026-04-30] OpenAI 格式转换：请求体
function convertAnthropicToOpenai(body: Buffer, modelOverride?: string): Buffer {
  try {
    const json = JSON.parse(body.toString())

    // OpenAI 格式的请求体
    const openaiBody: Record<string, unknown> = {
      model: modelOverride ?? json.model ?? 'gpt-4o',
      stream: json.stream ?? false
    }

    // max_tokens → max_completion_tokens
    if (json.max_tokens) {
      openaiBody.max_completion_tokens = json.max_tokens
    }

    // 处理 messages
    const messages: Array<{ role: string; content: string | Array<unknown> }> = []

    // system 消息转为第一条 message
    if (json.system) {
      messages.push({ role: 'system', content: json.system })
    }

    // 复制原有 messages
    if (Array.isArray(json.messages)) {
      for (const msg of json.messages) {
        // Anthropic 的 content 可能是字符串或数组，OpenAI 也支持两种
        messages.push({
          role: msg.role,
          content: msg.content
        })
      }
    }

    openaiBody.messages = messages

    // 复制其他兼容字段
    if (json.temperature) openaiBody.temperature = json.temperature
    if (json.top_p) openaiBody.top_p = json.top_p
    if (json.stop_sequences) openaiBody.stop = json.stop_sequences

    // tools 转换（简化版，OpenAI tools 格式略有不同）
    if (Array.isArray(json.tools) && json.tools.length > 0) {
      openaiBody.tools = json.tools.map((tool: { name: string; description?: string; input_schema?: unknown }) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? '',
          parameters: tool.input_schema ?? {}
        }
      }))
    }

    return Buffer.from(JSON.stringify(openaiBody))
  } catch {
    return body
  }
}

// [2026-04-30] OpenAI 格式转换：流式响应 SSE
function createOpenaiToAnthropicStream(): Transform {
  let messageId = `msg_${Date.now()}`
  let contentIndex = 0
  let accumulatedContent = ''
  let inputTokens = 0
  let outputTokens = 0
  let sentMessageStart = false

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const lines = chunk.toString().split('\n')
      const outputLines: string[] = []

      for (const line of lines) {
        if (!line.trim() || line === 'data: [DONE]') {
          if (line === 'data: [DONE]' && sentMessageStart) {
            // 发送 message_stop
            outputLines.push('event: message_stop')
            outputLines.push('data: {}')
            outputLines.push('')
          }
          continue
        }

        // 解析 OpenAI SSE
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          try {
            const json = JSON.parse(data)

            // 发送 message_start（首次）
            if (!sentMessageStart) {
              sentMessageStart = true
              outputLines.push('event: message_start')
              outputLines.push(`data: ${JSON.stringify({
                type: 'message_start',
                message: {
                  id: messageId,
                  type: 'message',
                  role: 'assistant',
                  content: [],
                  model: json.model ?? 'gpt-4o',
                  stop_reason: null,
                  usage: { input_tokens: 0, output_tokens: 0 }
                }
              })}`)
              outputLines.push('')

              // 发送 content_block_start
              outputLines.push('event: content_block_start')
              outputLines.push(`data: ${JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' }
              })}`)
              outputLines.push('')
            }

            // 处理 choices
            if (json.choices && Array.isArray(json.choices)) {
              for (const choice of json.choices) {
                if (choice.delta?.content) {
                  accumulatedContent += choice.delta.content

                  // 发送 content_block_delta
                  outputLines.push('event: content_block_delta')
                  outputLines.push(`data: ${JSON.stringify({
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: choice.delta.content }
                  })}`)
                  outputLines.push('')

                  outputTokens++
                }

                // 处理 tool_calls
                if (choice.delta?.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    outputLines.push('event: content_block_delta')
                    outputLines.push(`data: ${JSON.stringify({
                      type: 'content_block_delta',
                      index: tc.index ?? 0,
                      delta: {
                        type: 'input_json_delta',
                        partial_json: tc.function?.arguments ?? ''
                      }
                    })}`)
                    outputLines.push('')
                  }
                }

                // 处理 finish_reason
                if (choice.finish_reason) {
                  // 发送 content_block_stop
                  outputLines.push('event: content_block_stop')
                  outputLines.push(`data: ${JSON.stringify({
                    type: 'content_block_stop',
                    index: 0
                  })}`)
                  outputLines.push('')

                  // 发送 message_delta
                  outputLines.push('event: message_delta')
                  outputLines.push(`data: ${JSON.stringify({
                    type: 'message_delta',
                    delta: { stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : choice.finish_reason },
                    usage: { output_tokens: outputTokens }
                  })}`)
                  outputLines.push('')
                }
              }
            }

            // 处理 usage
            if (json.usage) {
              inputTokens = json.usage.prompt_tokens ?? 0
              outputTokens = json.usage.completion_tokens ?? outputTokens
            }

          } catch {
            // 解析失败，跳过
          }
        }
      }

      if (outputLines.length > 0) {
        callback(null, outputLines.join('\n') + '\n')
      } else {
        callback(null)
      }
    }
  })
}

// [2026-04-30] OpenAI 格式转换：非流式响应
function convertOpenaiResponseToAnthropic(body: string): string {
  try {
    const json = JSON.parse(body)

    // Anthropic 格式响应
    const anthropicRes: Record<string, unknown> = {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: json.model ?? 'gpt-4o',
      content: [],
      stop_reason: null,
      usage: {
        input_tokens: json.usage?.prompt_tokens ?? 0,
        output_tokens: json.usage?.completion_tokens ?? 0
      }
    }

    // 转换 choices 为 content
    if (json.choices && Array.isArray(json.choices)) {
      for (const choice of json.choices) {
        if (choice.message?.content) {
          anthropicRes.content.push({
            type: 'text',
            text: choice.message.content
          })
        }
        if (choice.finish_reason) {
          anthropicRes.stop_reason = choice.finish_reason === 'stop' ? 'end_turn' : choice.finish_reason
        }
      }
    }

    return JSON.stringify(anthropicRes)
  } catch {
    return body
  }
}

function forwardRequest(
  targetBaseUrl: string,
  authToken: string,
  format: 'anthropic' | 'openai' | undefined,
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  fallbackIndex: number,
  originalBaseUrl: string,
  modelOverride?: string
): void {
  let requestPath = req.url ?? '/'

  if (originalBaseUrl !== targetBaseUrl) {
    const originalBasePath = new URL(originalBaseUrl).pathname
    if (requestPath.startsWith(originalBasePath)) {
      requestPath = requestPath.slice(originalBasePath.length)
    }
  }

  const targetUrl = new URL(targetBaseUrl)

  // [2026-04-30] OpenAI 路径转换
  if (format === 'openai') {
    requestPath = requestPath.replace('/v1/messages', '/v1/chat/completions')
  }

  // [2026-04-30] 修复双斜杠：如果 pathname 是 "/" 则忽略它
  const basePath = targetUrl.pathname === '/' ? '' : targetUrl.pathname
  const fullPath = basePath + requestPath
  const isHttps = targetUrl.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest

  // [2026-04-30] OpenAI 请求体转换
  let transformedBody = body
  if (format === 'openai') {
    transformedBody = convertAnthropicToOpenai(body, modelOverride)
  } else if (modelOverride) {
    transformedBody = applyModelOverride(body, modelOverride)
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === 'host') continue
    if (key.toLowerCase() === 'authorization') continue
    if (key.toLowerCase() === 'x-api-key') continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value[0]
  }
  headers['host'] = targetUrl.host
  headers['content-length'] = String(transformedBody.length)

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
        // 读取错误响应体用于调试
        const errorChunks: Buffer[] = []
        proxyRes.on('data', (chunk) => errorChunks.push(chunk))
        proxyRes.on('end', () => {
          const errorBody = Buffer.concat(errorChunks).toString()
          console.log(`[API Proxy] Error response (${statusCode}): ${errorBody.slice(0, 500)}`)

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
            console.log(`[API Proxy] Level ${fallbackIndex === -1 ? 'primary' : `#${fallbackIndex + 1}`} failed (${statusCode}), trying #${nextFallbackIndex + 1}: ${nextFallback.name}`)
            primaryFailedAt = Date.now()
            cooldownFallbackIndex = nextFallbackIndex
            forwardRequest(
              nextFallback.baseUrl,
              nextFallback.authToken,
              nextFallback.format,
              req,
              res,
              body,
              nextFallbackIndex,
              originalBaseUrl,
              nextFallback.model
            )
          } else if (fallbackIndex === -1) {
            console.log(`[API Proxy] Primary failed (${statusCode}), no enabled fallbacks`)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Primary returned ${statusCode}, no enabled fallbacks` }))
          } else {
            console.log(`[API Proxy] All ${fallbacks.length} fallbacks exhausted, last status: ${statusCode}`)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `All fallbacks failed, last status: ${statusCode}` }))
          }
        })
        return
      }

      if (fallbackIndex === -1) {
        primaryFailedAt = null
        cooldownFallbackIndex = null
      }

      // [2026-04-30] OpenAI 响应转换
      if (format === 'openai') {
        // 复制响应头，但修改 content-type
        const responseHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (typeof value === 'string') responseHeaders[key] = value
          else if (Array.isArray(value)) responseHeaders[key] = value[0]
        }
        responseHeaders['content-type'] = 'text/event-stream'

        res.writeHead(statusCode, responseHeaders)

        // 检查是否是流式响应
        const isStream = body.toString().includes('"stream":true')
        if (isStream) {
          proxyRes.pipe(createOpenaiToAnthropicStream()).pipe(res)
        } else {
          // 非流式：收集完整响应后转换
          const chunks: Buffer[] = []
          proxyRes.on('data', (chunk) => chunks.push(chunk))
          proxyRes.on('end', () => {
            const converted = convertOpenaiResponseToAnthropic(Buffer.concat(chunks).toString())
            res.end(converted)
          })
        }
      } else {
        res.writeHead(statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
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
        nextFallback.format,
        req,
        res,
        body,
        nextFallbackIndex,
        originalBaseUrl,
        nextFallback.model
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
        nextFallback.format,
        req,
        res,
        body,
        nextFallbackIndex,
        originalBaseUrl,
        nextFallback.model
      )
    } else {
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'All levels timeout' }))
    }
  })

  proxyReq.write(transformedBody)
  proxyReq.end()
}

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
        body,
        cooldownFallbackIndex,
        profile.baseUrl,
        cooldownFallback.model
      )
    } else {
      console.log('[API Proxy] Forwarding to primary:', profile.baseUrl, profile.format === 'openai' ? '(OpenAI format)' : '')
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

  let wsIndex = -1
  const wsUrl = profile.baseUrl.replace(/^http/, 'ws') + '/v1/realtime'
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
    console.log(`[API Proxy] Server listening on http://127.0.0.1:${PROXY_PORT} (HTTP + WebSocket + OpenAI compatible)`)
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