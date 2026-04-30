/**
 * MCP Stdio Server - Visual Agent for Claude Code
 *
 * Provides image analysis capabilities via Anthropic API.
 * Configuration fetched from Feng Claude's HTTP API on localhost:3100
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const BASE = 'http://localhost:3100'

const TOOLS = [
  {
    name: 'analyze_image',
    description: '分析图片内容，返回详细描述。支持 PNG、JPEG、GIF、WebP 格式。',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: '图片文件绝对路径' },
        prompt: { type: 'string', description: '分析指令（可选，默认为"请详细描述这张图片的内容"）' }
      },
      required: ['imagePath']
    }
  },
  {
    name: 'capture_and_analyze',
    description: '截取当前嵌入浏览器的页面并分析内容',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '分析指令（可选）' }
      },
      required: []
    }
  }
]

async function fetchConfig() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 3100, path: '/visual-agent-config', method: 'GET' },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid config response')) }
        })
      }
    )
    req.on('error', (e) => reject(e))
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Config fetch timeout')) })
    req.end()
  })
}

async function callAnthropicApi(config, imageBase64, mediaType, prompt) {
  const url = new URL('/v1/messages', config.baseUrl)
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  }
  if (config.format === 'openai') {
    headers['Authorization'] = `Bearer ${config.authToken}`
  } else {
    headers['x-api-key'] = config.authToken
  }

  const body = {
    model: config.model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt || '请详细描述这张图片的内容' }
        ]
      }
    ]
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body)
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(postData) }
    }

    const client = url.protocol === 'https:' ? require('https') : require('http')
    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) reject(new Error(parsed.error.message || 'API error'))
          else resolve(parsed.content?.[0]?.text || 'No response')
        } catch { reject(new Error('Invalid API response')) }
      })
    })
    req.on('error', (e) => reject(e))
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('API timeout')) })
    req.write(postData)
    req.end()
  })
}

function detectMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'image/png'
  }
}

async function handleTool(name, args) {
  try {
    const config = await fetchConfig()
    if (!config.authToken) {
      return [{ type: 'text', text: '视觉代理未配置。请在 Feng Claude 设置面板中配置 API Key。' }]
    }

    switch (name) {
      case 'analyze_image': {
        const imagePath = args.imagePath
        if (!fs.existsSync(imagePath)) {
          return [{ type: 'text', text: `图片文件不存在: ${imagePath}` }]
        }
        const mediaType = detectMediaType(imagePath)
        const imageBase64 = fs.readFileSync(imagePath).toString('base64')
        const result = await callAnthropicApi(config, imageBase64, mediaType, args.prompt)
        return [{ type: 'text', text: result }]
      }
      case 'capture_and_analyze': {
        // 先获取浏览器截图
        const screenshotResult = await new Promise((resolve, reject) => {
          const req = http.request(
            { hostname: 'localhost', port: 3100, path: '/screenshot', method: 'GET' },
            (res) => {
              let data = ''
              res.on('data', (chunk) => { data += chunk })
              res.on('end', () => {
                try { resolve(JSON.parse(data)) } catch { reject(new Error('Screenshot failed')) }
              })
            }
          )
          req.on('error', (e) => reject(e))
          req.setTimeout(10000, () => { req.destroy(); reject(new Error('Screenshot timeout')) })
          req.end()
        })

        if (!screenshotResult.data) {
          return [{ type: 'text', text: `截图失败: ${screenshotResult.error || '未知错误'}` }]
        }

        const result = await callAnthropicApi(config, screenshotResult.data, 'image/png', args.prompt)
        return [{ type: 'text', text: result }]
      }
      default:
        return [{ type: 'text', text: `Unknown tool: ${name}` }]
    }
  } catch (e) {
    return [{ type: 'text', text: `Error: ${e.message}` }]
  }
}

async function handleMessage(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'visual-agent', version: '1.0.0' }
      }
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return { content: await handleTool(msg.params.name, msg.params.arguments || {}) }
    default:
      return null
  }
}

let buffer = ''

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString()
  let newlineIndex
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)
    if (!line) continue
    try {
      const parsed = JSON.parse(line)
      handleMessage(parsed).then((result) => {
        if (result !== null) {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }) + '\n')
        }
      }).catch((e) => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, error: { code: -32603, message: String(e) } }) + '\n')
      })
    } catch {}
  }
})