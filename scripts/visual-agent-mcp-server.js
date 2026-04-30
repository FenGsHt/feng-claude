/**
 * MCP Stdio Server - Visual Agent for Claude Code
 *
 * Provides image analysis capabilities via Anthropic-compatible API.
 * Configuration via environment variables:
 *   VISUAL_AGENT_AUTH_TOKEN - API key
 *   VISUAL_AGENT_BASE_URL   - API endpoint (default: https://api.anthropic.com)
 *   VISUAL_AGENT_MODEL      - Model name (default: claude-sonnet-4-6)
 *   VISUAL_AGENT_FORMAT     - 'anthropic' or 'openai' (default: anthropic)
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

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
  }
]

function getConfig() {
  return {
    authToken: process.env.VISUAL_AGENT_AUTH_TOKEN || '',
    baseUrl: process.env.VISUAL_AGENT_BASE_URL || 'https://api.anthropic.com',
    model: process.env.VISUAL_AGENT_MODEL || 'claude-sonnet-4-6',
    format: process.env.VISUAL_AGENT_FORMAT || 'anthropic'
  }
}

async function callApi(config, imageBase64, mediaType, prompt) {
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

  const postData = JSON.stringify(body)
  const client = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = client.request(url.href, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
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
  const config = getConfig()
  if (!config.authToken) {
    return [{ type: 'text', text: '视觉代理未配置。请设置环境变量 VISUAL_AGENT_AUTH_TOKEN 或在 MCP 配置中添加此环境变量。' }]
  }

  if (name !== 'analyze_image') {
    return [{ type: 'text', text: `Unknown tool: ${name}` }]
  }

  const imagePath = args.imagePath
  if (!fs.existsSync(imagePath)) {
    return [{ type: 'text', text: `图片文件不存在: ${imagePath}` }]
  }
  const mediaType = detectMediaType(imagePath)
  const imageBase64 = fs.readFileSync(imagePath).toString('base64')
  const result = await callApi(config, imageBase64, mediaType, args.prompt)
  return [{ type: 'text', text: result }]
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
