/**
 * MCP Stdio Server - Browser Tools for Claude Code
 *
 * Usage: add to .claude.json mcpServers:
 *   "browser-tools": { "type": "stdio", "command": "node", "args": ["scripts/browser-mcp-server.js"] }
 *
 * Communicates with the Electron app's built-in HTTP API on localhost:3100
 */

const http = require('http')

const BASE = `http://localhost:${process.env.FENG_CLAUDE_BROWSER_PORT || 3100}`

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
  },
  {
    name: 'office_preview',
    description: 'Open an Office file (.docx/.xlsx/.pptx) in the built-in preview panel.',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: 'Absolute path to the Office file' } },
      required: ['filePath']
    }
  },
  {
    name: 'browser_get_html',
    description: 'Get the HTML source of the page or a specific element. Useful for understanding page structure without a screenshot (saves tokens).',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector to get outerHTML of (optional, defaults to full page)' } },
      required: []
    }
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page to a CSS selector or to specific x/y coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scroll into view (optional)' },
        x: { type: 'number', description: 'Horizontal scroll position in pixels (used if no selector)' },
        y: { type: 'number', description: 'Vertical scroll position in pixels (used if no selector)' },
        behavior: { type: 'string', description: '"smooth" (default) or "instant"' }
      },
      required: []
    }
  },
  {
    name: 'browser_key',
    description: 'Send a keyboard key press to the page. Useful for Enter, Tab, Escape, arrow keys, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name e.g. "Enter", "Tab", "Escape", "ArrowDown", "a"' },
        modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys: ["ctrl"], ["shift"], ["alt"], ["meta"]' }
      },
      required: ['key']
    }
  },
  {
    name: 'browser_hover',
    description: 'Move the mouse over an element to trigger hover effects, tooltips, or dropdown menus.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector of element to hover over' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_select',
    description: 'Set the value of a <select> dropdown element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the <select> element' },
        value: { type: 'string', description: 'Option value to select' }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'browser_check',
    description: 'Check or uncheck a checkbox or radio button element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the checkbox/radio' },
        checked: { type: 'boolean', description: 'true to check, false to uncheck (toggles if omitted)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_screenshot_element',
    description: 'Capture a screenshot of only a specific element (cropped). More efficient than a full page screenshot when focusing on a component.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to capture' },
        quality: { type: 'number', description: 'JPEG quality 10-100 (default 80)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_get_cookies',
    description: 'Get all cookies for the current page URL. Useful for inspecting session/auth state.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a CSS selector to appear in the DOM (useful for SPAs and dynamic content).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        timeout: { type: 'number', description: 'Max wait time in milliseconds (default 5000, max 30000)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_get_forms',
    description: 'Enumerate all forms and their input fields on the current page. Useful before filling out forms.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_drag',
    description: 'Simulate a realistic human-like drag (Bezier curve path with random jitter and ease-in-out timing). Useful for sliders, drag-and-drop, and CAPTCHA slider challenges.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSelector: { type: 'string', description: 'CSS selector of drag start element (optional)' },
        toSelector:   { type: 'string', description: 'CSS selector of drag end element (optional)' },
        fromX: { type: 'number', description: 'Start X coordinate (used if no fromSelector)' },
        fromY: { type: 'number', description: 'Start Y coordinate (used if no fromSelector)' },
        toX:   { type: 'number', description: 'End X coordinate (used if no toSelector)' },
        toY:   { type: 'number', description: 'End Y coordinate (used if no toSelector)' },
        steps:      { type: 'number', description: 'Number of intermediate mouse-move steps (default 60, more = smoother)' },
        durationMs: { type: 'number', description: 'Total drag duration in ms (default 800)' }
      },
      required: []
    }
  },
  {
    name: 'browser_click_human',
    description: 'Click an element using real mouse events (mousedown + random delay + mouseup) with slight position jitter, more realistic than browser_click.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector of element to click' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_type_human',
    description: 'Type text character by character with random delays (mimics human typing speed). More realistic than browser_type for sites that detect instant input.',
    inputSchema: {
      type: 'object',
      properties: {
        selector:  { type: 'string', description: 'CSS selector of input element' },
        text:      { type: 'string', description: 'Text to type' },
        minDelay:  { type: 'number', description: 'Min ms between keystrokes (default 40)' },
        maxDelay:  { type: 'number', description: 'Max ms between keystrokes (default 140)' }
      },
      required: ['selector', 'text']
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
        resolve({ error: `Browser server not running on port ${process.env.FENG_CLAUDE_BROWSER_PORT || 3100}. Open the embedded browser first.` })
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
          const fmt = r.format === 'png' ? 'image/png' : 'image/jpeg'
          const meta = `Screenshot: ${r.width||'?'}x${r.height||'?'} ${r.format||'jpeg'}, ${r.byteLength||Math.round(r.data.length*0.75)} bytes${r.url?`, url: ${r.url}`:''}`
          return [{ type: 'text', text: meta }, { type: 'image', data: r.data, mimeType: fmt }]
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
      case 'office_preview': {
        const r = await callHttp('/open-office-preview', { filePath: args.filePath })
        return [{ type: 'text', text: r.success ? `Office preview opened: ${args.filePath}` : `Failed: ${r.error}` }]
      }
      case 'browser_get_html': {
        const path = args.selector ? `/html?selector=${encodeURIComponent(args.selector)}` : '/html'
        const r = await callHttp(path)
        return [{ type: 'text', text: r.html ?? `Failed: ${r.error}` }]
      }
      case 'browser_scroll': {
        const r = await callHttp('/scroll', { selector: args.selector, x: args.x, y: args.y, behavior: args.behavior || 'smooth' })
        return [{ type: 'text', text: r.ok ? `Scrolled${args.selector ? ` to ${args.selector}` : ` to (${args.x||0},${args.y||0})`}` : `Failed: ${r.error}` }]
      }
      case 'browser_key': {
        const r = await callHttp('/key', { key: args.key, modifiers: args.modifiers || [] })
        return [{ type: 'text', text: r.ok ? `Key sent: ${args.key}` : `Failed: ${r.error}` }]
      }
      case 'browser_hover': {
        const r = await callHttp('/hover', { selector: args.selector })
        return [{ type: 'text', text: r.ok ? `Hovered over ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_select': {
        const r = await callHttp('/select', { selector: args.selector, value: args.value })
        return [{ type: 'text', text: r.ok ? `Selected "${args.value}" in ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_check': {
        const r = await callHttp('/check', { selector: args.selector, checked: args.checked })
        return [{ type: 'text', text: r.ok ? `Checkbox ${args.selector} is now ${r.checked ? 'checked' : 'unchecked'}` : `Failed: ${r.error}` }]
      }
      case 'browser_screenshot_element': {
        const path = `/screenshot-element?selector=${encodeURIComponent(args.selector)}${args.quality ? `&quality=${args.quality}` : ''}`
        const r = await callHttp(path)
        if (r.data) {
          return [
            { type: 'text', text: `Element screenshot: ${r.width||'?'}x${r.height||'?'} jpeg — ${args.selector}` },
            { type: 'image', data: r.data, mimeType: 'image/jpeg' }
          ]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_get_cookies': {
        const r = await callHttp('/cookies')
        if (r.cookies) {
          const lines = r.cookies.map(c => `${c.name}=${c.value.slice(0,40)}${c.value.length>40?'...':''} (${c.domain||''}${c.httpOnly?' httpOnly':''}${c.secure?' secure':''})`)
          return [{ type: 'text', text: lines.length ? lines.join('\n') : 'No cookies' }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_wait_for': {
        const r = await callHttp('/wait-for', { selector: args.selector, timeout: args.timeout || 5000 })
        return [{ type: 'text', text: r.found ? `Element found: ${args.selector}` : `Timeout: ${args.selector} not found within ${args.timeout||5000}ms` }]
      }
      case 'browser_get_forms': {
        const r = await callHttp('/forms')
        if (r.forms) {
          if (!r.forms.length) return [{ type: 'text', text: 'No forms found on page' }]
          const lines = r.forms.map(f => {
            const fields = f.fields.map(fl => `  - [${fl.tag}${fl.type?`:${fl.type}`:''}] name="${fl.name||''}" ${fl.placeholder?`placeholder="${fl.placeholder}"`:''}${fl.required?' required':''}`).join('\n')
            return `Form #${f.index}${f.id?` id="${f.id}"`:''}${f.name?` name="${f.name}"`:''}:\n${fields}`
          })
          return [{ type: 'text', text: lines.join('\n\n') }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_drag': {
        const r = await callHttp('/drag', {
          fromSelector: args.fromSelector, toSelector: args.toSelector,
          fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY,
          steps: args.steps, durationMs: args.durationMs
        })
        return [{ type: 'text', text: r.ok ? `Dragged from (${r.from?.x},${r.from?.y}) to (${r.to?.x},${r.to?.y}) in ${r.steps} steps` : `Failed: ${r.error}` }]
      }
      case 'browser_click_human': {
        const r = await callHttp('/click-human', { selector: args.selector })
        return [{ type: 'text', text: r.ok ? `Human-clicked ${args.selector} at (${r.x},${r.y})` : `Failed: ${r.error}` }]
      }
      case 'browser_type_human': {
        const r = await callHttp('/type-human', { selector: args.selector, text: args.text, minDelay: args.minDelay, maxDelay: args.maxDelay })
        return [{ type: 'text', text: r.ok ? `Typed ${r.length} chars into ${args.selector}` : `Failed: ${r.error}` }]
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
