import { BrowserView, BrowserWindow, ipcMain } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

interface BrowserViewState {
  view: BrowserView | null
  visible: boolean
}

const state: BrowserViewState = {
  view: null,
  visible: false
}

const DEFAULT_PORT = 3100

/** 创建或显示 BrowserView */
export function showBrowserView(win: BrowserWindow, url?: string): void {
  if (!state.view) {
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    })
    state.view = view
    win.setBrowserView(view)

    // 拦截新窗口请求，阻止弹出
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  const { width, height } = win.getContentBounds()
  const titleBarH = 32
  state.view.setBounds({ x: 0, y: titleBarH, width, height: height - titleBarH })

  if (url) {
    state.view.webContents.loadURL(url).catch(() => {})
  } else if (!state.view.webContents.getURL()) {
    state.view.webContents.loadURL('https://www.bing.com').catch(() => {})
  }

  win.setBrowserView(state.view)
  state.visible = true
}

/** 隐藏 BrowserView（不销毁，保留页面状态） */
export function hideBrowserView(win: BrowserWindow): void {
  if (state.view) {
    win.removeBrowserView(state.view)
    state.visible = false
  }
}

/** 切换 BrowserView 可见性 */
export function toggleBrowserView(win: BrowserWindow): boolean {
  if (state.visible) {
    hideBrowserView(win)
    return false
  } else {
    showBrowserView(win)
    return true
  }
}

/** 返回当前是否可见 */
export function isBrowserViewVisible(): boolean {
  return state.visible
}

/** 获取 BrowserView 的 webContents（用于截图等） */
export function getBrowserViewWebContents(): Electron.WebContents | null {
  return state.view?.webContents ?? null
}

/** 导航到 URL */
export async function navigateTo(url: string): Promise<{ success: boolean; url: string }> {
  if (!state.view?.webContents) {
    return { success: false, url: '' }
  }
  let target = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    target = 'https://' + url
  }
  try {
    await state.view.webContents.loadURL(target)
    return { success: true, url: state.view.webContents.getURL() }
  } catch {
    return { success: false, url: '' }
  }
}

// ── IPC 注册 ──────────────────────────────────────────────────────────

export function registerBrowserViewIpc(): void {
  ipcMain.handle('browser-view:toggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { visible: false }
    const visible = toggleBrowserView(win)
    return { visible }
  })

  ipcMain.handle('browser-view:navigate', (_event, url: string) => {
    return navigateTo(url)
  })
}

// ── HTTP API 服务器 ──────────────────────────────────────────────────
// Claude Code 通过 curl 调用这些端点来调试网页

export function startBrowserServer(win: BrowserWindow): Promise<{ port: number }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')

      try {
        const url = new URL(req.url ?? '/', `http://localhost:${DEFAULT_PORT}`)
        const path = url.pathname

        // GET /health
        if (path === '/health') {
          res.writeHead(200)
          res.end(JSON.stringify({ status: 'ok' }))
          return
        }

        // POST /navigate
        if (path === '/navigate' && req.method === 'POST') {
          const body = await readBody(req)
          const target = (body?.url as string) ?? ''
          if (!target) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url' }))
            return
          }
          const result = await navigateTo(target)
          res.writeHead(200); res.end(JSON.stringify(result))
          return
        }

        // GET /screenshot
        if (path === '/screenshot' && req.method === 'GET') {
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          const dataUrl = await webContents.capturePage()
          const base64 = dataUrl.toPNG().toString('base64')
          res.writeHead(200)
          res.end(JSON.stringify({ format: 'png', data: base64 }))
          return
        }

        // POST /click
        if (path === '/click' && req.method === 'POST') {
          const body = await readBody(req)
          const selector = (body?.selector as string) ?? ''
          if (!selector) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' }))
            return
          }
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          try {
            await webContents.executeJavaScript(`
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}' );
                if (el) { el.click(); return true; }
                return false;
              })()
            `)
            res.writeHead(200); res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // POST /type
        if (path === '/type' && req.method === 'POST') {
          const body = await readBody(req)
          const selector = (body?.selector as string) ?? ''
          const text = (body?.text as string) ?? ''
          if (!selector || text === undefined) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector or text' }))
            return
          }
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          try {
            await webContents.executeJavaScript(`
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}' );
                if (el) {
                  el.focus();
                  el.value = '${text.replace(/'/g, "\\'")}' ;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
                return false;
              })()
            `)
            res.writeHead(200); res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // GET /url
        if (path === '/url' && req.method === 'GET') {
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify({ url: webContents.getURL() }))
          return
        }

        // GET /text
        if (path === '/text' && req.method === 'GET') {
          const selector = url.searchParams.get('selector')
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          try {
            const js = selector
              ? `(document.querySelector('${selector.replace(/'/g, "\\'")}' )?.innerText) ?? ''`
              : 'document.body?.innerText ?? ""'
            const text = await webContents.executeJavaScript(js)
            res.writeHead(200); res.end(JSON.stringify({ text: String(text).slice(0, 8000) }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // POST /eval
        if (path === '/eval' && req.method === 'POST') {
          const body = await readBody(req)
          const js = (body?.javascript as string) ?? ''
          if (!js) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing javascript' }))
            return
          }
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          try {
            const result = await webContents.executeJavaScript(js)
            res.writeHead(200)
            res.end(JSON.stringify({ result: typeof result === 'string' ? result : JSON.stringify(result) }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // POST /show — 确保 BrowserView 可见
        if (path === '/show' && req.method === 'POST') {
          showBrowserView(win)
          res.writeHead(200); res.end(JSON.stringify({ visible: true }))
          return
        }

        // POST /hide — 隐藏 BrowserView
        if (path === '/hide' && req.method === 'POST') {
          hideBrowserView(win)
          res.writeHead(200); res.end(JSON.stringify({ visible: false }))
          return
        }

        res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }))
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
      }
    })

    server.listen(DEFAULT_PORT, () => {
      console.log(`[browser] HTTP API server listening on port ${DEFAULT_PORT}`)
      resolve({ port: DEFAULT_PORT })
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[browser] Port ${DEFAULT_PORT} in use, browser API may already be running`)
      } else {
        console.error('[browser] HTTP server error:', err.message)
      }
    })
  })
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data)) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}
