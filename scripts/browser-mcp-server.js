/**
 * MCP Stdio Server - Browser Tools for Claude Code
 *
 * Usage: add to .claude.json mcpServers:
 *   "browser-tools": { "type": "stdio", "command": "node", "args": ["scripts/browser-mcp-server.js"] }
 *
 * Communicates with the Electron app's built-in HTTP API on localhost:3100
 */

const http = require('http')

const BASE = 'http://localhost:3100'

// [2026-04-30] MCP tools/list must use inputSchema; input_schema lets Claude Code load the server but hide its tools.
const TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the embedded browser',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to navigate to' } },
      required: ['url']
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a screenshot of the current page (PNG base64)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_click',
    description: 'Click an element by CSS selector',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        text: { type: 'string', description: 'Text to type' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_get_url',
    description: 'Get the current page URL',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_get_text',
    description: 'Get page text, optionally filtered by CSS selector',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector (optional)' } },
      required: []
    }
  },
  {
    name: 'browser_eval',
    description: 'Execute JavaScript in the page context',
    inputSchema: {
      type: 'object',
      properties: { javascript: { type: 'string', description: 'JS code to execute' } },
      required: ['javascript']
    }
  },
  {
    name: 'browser_show',
    description: 'Show the embedded browser in the app window',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_hide',
    description: 'Hide the embedded browser',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_devtools',
    description: 'Toggle DevTools (console, network, elements) for the embedded browser',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_back',
    description: 'Go back one page in browser history',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_forward',
    description: 'Go forward one page in browser history',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_console',
    description: 'Get console logs (log, warn, error, info, debug) from the embedded browser page',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'Clear the log buffer after reading (default: false)' }
      },
      required: []
    }
  }
]

async function callHttp(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const data = body ? JSON.stringify(body) : undefined
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 }
    }
    const req = http.request(options, (res) => {
      let d = ''
      res.on('data', (chunk) => { d += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch { resolve({ error: d }) }
      })
    })
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        resolve({ error: 'Browser server not running. Open the embedded browser first (Ctrl+Shift+D).' })
      } else {
        reject(e)
      }
    })
    if (data) req.write(data)
    req.end()
  })
}

async function handleTool(name, args) {
  try {
    switch (name) {
      case 'browser_navigate': {
        const r = await callHttp('/navigate', { url: args.url })
        return [{ type: 'text', text: r.success ? `Navigated to ${r.url}` : `Failed: ${r.error}` }]
      }
      case 'browser_screenshot': {
        const r = await callHttp('/screenshot')
        if (r.data) {
          // [2026-04-30] Return text diagnostics with the image so Claude Code shows a useful result even if image rendering is unavailable.
          const meta = `Screenshot captured: ${r.width || '?'}x${r.height || '?'} PNG, ${r.byteLength || Math.round(r.data.length * 0.75)} bytes${r.url ? `, url: ${r.url}` : ''}`
          return [
            { type: 'text', text: meta },
            { type: 'image', data: r.data, mimeType: 'image/png' }
          ]
        }
        return [{ type: 'text', text: `Failed: ${r.error || 'No screenshot data returned'}` }]
      }
      case 'browser_click': {
        const r = await callHttp('/click', { selector: args.selector })
        return [{ type: 'text', text: r.success ? `Clicked ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_type': {
        const r = await callHttp('/type', { selector: args.selector, text: args.text })
        return [{ type: 'text', text: r.success ? `Typed into ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_get_url': {
        const r = await callHttp('/url')
        return [{ type: 'text', text: r.url || 'No page loaded' }]
      }
      case 'browser_get_text': {
        const path = args.selector ? `/text?selector=${encodeURIComponent(args.selector)}` : '/text'
        const r = await callHttp(path)
        return [{ type: 'text', text: r.text || '' }]
      }
      case 'browser_eval': {
        const r = await callHttp('/eval', { javascript: args.javascript })
        return [{ type: 'text', text: r.result || 'No result' }]
      }
      case 'browser_show': {
        await callHttp('/show')
        return [{ type: 'text', text: 'Browser shown' }]
      }
      case 'browser_hide': {
        await callHttp('/hide')
        return [{ type: 'text', text: 'Browser hidden' }]
      }
      case 'browser_devtools': {
        const r = await callHttp('/devtools')
        return [{ type: 'text', text: r.visible ? 'DevTools opened' : 'DevTools closed' }]
      }
      case 'browser_back': {
        await callHttp('/back')
        return [{ type: 'text', text: 'Went back' }]
      }
      case 'browser_forward': {
        await callHttp('/forward')
        return [{ type: 'text', text: 'Went forward' }]
      }
      case 'browser_reload': {
        await callHttp('/reload')
        return [{ type: 'text', text: 'Reloaded page' }]
      }
      case 'browser_console': {
        const path = args.clear ? '/console?clear=true' : '/console'
        const r = await callHttp(path)
        if (r.entries?.length > 0) {
          const lines = r.entries.map(e => `[${e.timestamp}] ${e.level}: ${e.text}`)
          return [{ type: 'text', text: lines.join('\n') }]
        }
        return [{ type: 'text', text: 'No console logs captured' }]
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
        serverInfo: { name: 'browser-tools', version: '1.0.0' }
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
