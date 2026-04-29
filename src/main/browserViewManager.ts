import { BrowserWindow, ipcMain, WebContentsView, WebPreferences } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

interface BrowserPanelState {
  view: WebContentsView | null
  navView: WebContentsView | null
  mainWin: BrowserWindow | null
  visible: boolean
  resizeHandler: (() => void) | null
  splitRatio: number   // 浏览器占窗口宽度的比例（0.3-0.7）
  devToolsVisible: boolean
}

const state: BrowserPanelState = {
  view: null,
  navView: null,
  mainWin: null,
  visible: false,
  resizeHandler: null,
  splitRatio: 0.5,
  devToolsVisible: false
}

const DEFAULT_PORT = 3100
const TITLEBAR_H = 32
const NAVBAR_H = 34
const MIN_RATIO = 0.25
const MAX_RATIO = 0.75

// ── 布局计算 ───────────────────────────────────────────────────────

function setBounds(win: BrowserWindow): void {
  if (!state.view || !state.mainWin) return
  const bounds = win.getContentBounds()
  const viewW = Math.round(bounds.width * state.splitRatio)
  const viewX = bounds.width - viewW

  // 通知导航栏当前比例
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:ratio', { ratio: state.splitRatio })
  }

  // 浏览器内容区域
  state.view.setBounds({
    x: viewX,
    y: TITLEBAR_H + NAVBAR_H,
    width: viewW,
    height: bounds.height - TITLEBAR_H - NAVBAR_H
  })

  // 导航栏
  if (state.navView) {
    state.navView.setBounds({
      x: viewX,
      y: TITLEBAR_H,
      width: viewW,
      height: NAVBAR_H
    })
  }
}

function setSplitRatio(win: BrowserWindow, ratio: number): void {
  state.splitRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio))
  setBounds(win)
  // 通知导航栏更新宽度
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:resize', { ratio: state.splitRatio })
  }
}

// ── 导航栏 HTML ────────────────────────────────────────────────────

const NAVBAR_HTML = `<!DOCTYPE html>
<html><head><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  height: 100%;
  font-family: system-ui, sans-serif;
  user-select: none;
}
button {
  background: none;
  border: 1px solid #333;
  color: #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
}
button:hover { background: #2a2a2a; color: #fff; }
button:active { background: #333; }
button.active { color: #f59e0b; border-color: #f59e0b; }
button:disabled { opacity: 0.3; cursor: default; }
#url-input {
  flex: 1;
  background: #111;
  border: 1px solid #333;
  color: #e0e0e0;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  outline: none;
  height: 24px;
}
#url-input:focus { border-color: #f59e0b; }
#drag-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  margin-left: -6px;
  z-index: 10;
}
#drag-handle:hover { background: #f59e0b66; }
#drag-handle.active { background: #f59e0b; }
.spacer { flex: 1; }
</style></head><body>
  <div id="drag-handle" title="拖拽调整宽度"></div>
  <button id="back-btn" title="后退">◀</button>
  <button id="fwd-btn" title="前进">▶</button>
  <button id="reload-btn" title="刷新">⟳</button>
  <input id="url-input" type="text" placeholder="输入 URL 回车导航" />
  <button id="devtools-btn" title="打开/关闭 DevTools">⌘</button>
  <button id="close-btn" title="关闭浏览器">×</button>
<script>
  const $ = id => document.getElementById(id)
  // 拖拽分割线 — 直接通过 ipcRenderer 发送比例
  let dragging = false
  let startX = 0
  let startRatio = 0
  const { ipcRenderer: navIpc } = require('electron')

  $('drag-handle').addEventListener('mousedown', e => {
    dragging = true
    startX = e.clientX
    startRatio = window.__currentRatio || 0.5
    $('drag-handle').classList.add('active')
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
  })
  document.addEventListener('mousemove', e => {
    if (!dragging) return
    const dx = e.clientX - startX
    const newRatio = startRatio - dx / window.innerWidth
    navIpc.send('browser-nav:set-ratio', newRatio)
  })
  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false
      $('drag-handle').classList.remove('active')
      document.body.style.cursor = ''
    }
  })

  $('back-btn').addEventListener('click', () => { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:action', 'back') })
  $('fwd-btn').addEventListener('click', () => { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:action', 'forward') })
  $('reload-btn').addEventListener('click', () => { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:action', 'reload') })
  $('devtools-btn').addEventListener('click', () => { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:action', 'devtools') })
  $('close-btn').addEventListener('click', () => { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:action', 'close') })
  $('url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const url = e.target.value.trim()
      if (url) { const { ipcRenderer } = require('electron'); ipcRenderer.send('browser-nav:navigate', url) }
    }
  })

  // 监听主进程发来的消息
  const { ipcRenderer } = require('electron')
  ipcRenderer.on('browser-nav:url', (_, data) => {
    $('url-input').value = data.url
  })
  ipcRenderer.on('browser-nav:nav-state', (_, data) => {
    $('back-btn').disabled = !data.canGoBack
    $('fwd-btn').disabled = !data.canGoForward
  })
  ipcRenderer.on('browser-nav:devtools', (_, data) => {
    $('devtools-btn').classList.toggle('active', data.enabled)
  })
  ipcRenderer.on('browser-nav:resize', (_, data) => {
    // width change handled by main process setBounds
  })
  ipcRenderer.on('browser-nav:ratio', (_, data) => {
    window.__currentRatio = data.ratio
  })
</script></body></html>`

function createNavView(): WebContentsView {
  const prefs: WebPreferences = {
    nodeIntegration: true,
    contextIsolation: false,
    backgroundThrottling: false
  }
  const nav = new WebContentsView({ webPreferences: prefs })
  nav.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  nav.webContents.loadURL(`data:text/html;base64,${Buffer.from(NAVBAR_HTML, 'utf-8').toString('base64')}`).catch(() => {})

  return nav
}

// ── 导航控制 ───────────────────────────────────────────────────────

function browserBack(): void {
  if (state.view?.webContents.canGoBack()) state.view.webContents.goBack()
}

function browserForward(): void {
  if (state.view?.webContents.canGoForward()) state.view.webContents.goForward()
}

function browserReload(): void {
  state.view?.webContents.reload()
}

function browserNavigate(url: string): void {
  if (!state.view?.webContents) return
  let target = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    target = 'https://' + url
  }
  state.view.webContents.loadURL(target).catch(() => {})
}

function toggleDevTools(): void {
  if (!state.view) return
  state.devToolsVisible = !state.devToolsVisible
  if (state.devToolsVisible) {
    state.view.webContents.openDevTools({ mode: 'detach' })
  } else {
    state.view.webContents.closeDevTools()
  }
  // 通知导航栏按钮状态
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:devtools', { enabled: state.devToolsVisible })
  }
}

// ── 公共 API ───────────────────────────────────────────────────────

/** 创建或显示浏览器面板 */
export function showBrowserView(win: BrowserWindow, url?: string): void {
  if (!state.view) {
    const prefs: WebPreferences = {
      nodeIntegration: false,
      contextIsolation: true,
    }
    const view = new WebContentsView({ webPreferences: prefs })
    state.view = view

    // 拦截新窗口请求
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // URL 变化时更新导航栏地址
    view.webContents.on('did-navigate', (_, navUrl) => {
      updateNavUrl(navUrl)
      updateNavBackForward()
    })
    view.webContents.on('did-navigate-in-page', (_, navUrl) => {
      updateNavUrl(navUrl)
      updateNavBackForward()
    })

    state.navView = createNavView()
    state.mainWin = win

    // 窗口 resize 时重新定位
    state.resizeHandler = () => setBounds(win)
    win.on('resize', state.resizeHandler)
    win.on('maximize', state.resizeHandler)
    win.on('unmaximize', state.resizeHandler)

    win.contentView.addChildView(view)
    win.contentView.addChildView(state.navView)
  }

  state.mainWin = win
  setBounds(win)
  win.contentView.addChildView(state.view)
  if (state.navView) win.contentView.addChildView(state.navView)

  if (url) {
    state.view.webContents.loadURL(url).catch(() => {})
  } else if (!state.view.webContents.getURL()) {
    state.view.webContents.loadURL('https://www.bing.com').catch(() => {})
  }

  state.visible = true
}

/** 更新导航栏 URL 显示 */
function updateNavUrl(url: string): void {
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:url', { url })
  }
}

/** 更新前进/后退按钮状态 */
function updateNavBackForward(): void {
  if (!state.view || !state.navView?.webContents) return
  state.navView.webContents.send('browser-nav:nav-state', {
    canGoBack: state.view.webContents.canGoBack(),
    canGoForward: state.view.webContents.canGoForward()
  })
}

/** 隐藏浏览器面板 */
export function hideBrowserView(_win?: BrowserWindow): void {
  if (state.view && state.mainWin) {
    state.mainWin.contentView.removeChildView(state.view)
    if (state.devToolsVisible) {
      state.view.webContents.closeDevTools()
      state.devToolsVisible = false
    }
    state.visible = false
  }
}

/** 切换浏览器面板 */
export function toggleBrowserView(win: BrowserWindow): boolean {
  if (state.visible) {
    hideBrowserView()
    return false
  } else {
    showBrowserView(win)
    return true
  }
}

export function isBrowserViewVisible(): boolean {
  return state.visible
}

export function getBrowserViewWebContents(): Electron.WebContents | null {
  return state.view?.webContents ?? null
}

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

// ─ IPC ────────────────────────────────────────────────────────────────

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

  // 导航栏 IPC
  ipcMain.on('browser-nav:action', (_event, action: string) => {
    if (action === 'back') browserBack()
    else if (action === 'forward') browserForward()
    else if (action === 'reload') browserReload()
    else if (action === 'devtools') toggleDevTools()
    else if (action === 'close') hideBrowserView()
  })

  ipcMain.on('browser-nav:navigate', (_event, url: string) => {
    browserNavigate(url)
  })

  ipcMain.on('browser-nav:set-ratio', (event, ratio: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) setSplitRatio(win, ratio)
  })
}

// ─ HTTP API ──────────────────────────────────────────────────────────

export function startBrowserServer(_win: BrowserWindow): Promise<{ port: number }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')

      try {
        const url = new URL(req.url ?? '/', `http://localhost:${DEFAULT_PORT}`)
        const path = url.pathname

        if (path === '/health') {
          res.writeHead(200); res.end(JSON.stringify({ status: 'ok' }))
          return
        }

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

        if (path === '/screenshot' && req.method === 'GET') {
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          const dataUrl = await webContents.capturePage()
          const base64 = dataUrl.toPNG().toString('base64')
          res.writeHead(200); res.end(JSON.stringify({ format: 'png', data: base64 }))
          return
        }

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

        if (path === '/url' && req.method === 'GET') {
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          res.writeHead(200); res.end(JSON.stringify({ url: webContents.getURL() }))
          return
        }

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

        if (path === '/show' && req.method === 'POST') {
          if (state.mainWin) showBrowserView(state.mainWin)
          res.writeHead(200); res.end(JSON.stringify({ visible: true }))
          return
        }

        if (path === '/hide' && req.method === 'POST') {
          hideBrowserView()
          res.writeHead(200); res.end(JSON.stringify({ visible: false }))
          return
        }

        // POST /devtools — toggle DevTools
        if (path === '/devtools' && req.method === 'POST') {
          toggleDevTools()
          res.writeHead(200); res.end(JSON.stringify({ visible: state.devToolsVisible }))
          return
        }

        // POST /back
        if (path === '/back' && req.method === 'POST') {
          browserBack()
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }

        // POST /forward
        if (path === '/forward' && req.method === 'POST') {
          browserForward()
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }

        // POST /reload
        if (path === '/reload' && req.method === 'POST') {
          browserReload()
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
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
