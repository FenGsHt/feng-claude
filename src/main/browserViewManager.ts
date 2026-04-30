import { BrowserWindow, ipcMain, WebContentsView, WebPreferences } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

interface BrowserPanelState {
  view: WebContentsView | null
  navView: WebContentsView | null
  devToolsView: WebContentsView | null  // [2026-04-30] 独立 DevTools 视图
  devToolsSeparatorView: WebContentsView | null // [2026-04-30] DevTools 分隔线视图（可拖拽）
  mainWin: BrowserWindow | null
  visible: boolean
  resizeHandler: (() => void) | null
  splitRatio: number   // 浏览器占窗口宽度的比例（0.25-0.75）
  devToolsRatio: number // [2026-04-30] DevTools 占浏览器面板宽度比例（0.2-0.6）
  devToolsVisible: boolean
}

const state: BrowserPanelState = {
  view: null,
  navView: null,
  devToolsView: null,
  devToolsSeparatorView: null,
  mainWin: null,
  visible: false,
  resizeHandler: null,
  splitRatio: 0.5,
  devToolsRatio: 0.4,
  devToolsVisible: false
}

const DEFAULT_PORT = 3100
const TITLEBAR_H = 32
const NAVBAR_H = 34
const MIN_RATIO = 0.25
const MAX_RATIO = 0.75
const DEVTOOLS_MIN_RATIO = 0.2   // [2026-04-30] DevTools 最小比例
const DEVTOOLS_MAX_RATIO = 0.6   // [2026-04-30] DevTools 最大比例
const DEVTOOLS_SEPARATOR_W = 8   // [2026-04-30] DevTools 分隔线宽度

const CONSOLE_BUFFER_MAX = 500

interface ConsoleLogEntry {
  level: string
  text: string
  timestamp: string
}

const consoleLogs: ConsoleLogEntry[] = []

function levelToString(level: number): string {
  switch (level) {
    case 0: return 'verbose'
    case 1: return 'info'
    case 2: return 'warning'
    case 3: return 'error'
    default: return 'debug'
  }
}

// [2026-04-30] DevTools 分隔线拖拽状态
let devToolsDragging = false

// [2026-04-30] 浏览器面板拖拽状态（通过主窗口 input-event 全局跟踪）
let browserDragging = false

// ── 布局计算 ───────────────────────────────────────────────────────

function notifyBrowserState(): void {
  const wins = BrowserWindow.getAllWindows()
  const mainWin = wins[0]
  if (mainWin?.webContents && state.view) {
    const bounds = mainWin.getContentBounds()
    const viewW = state.visible ? Math.round(bounds.width * state.splitRatio) : 0
    mainWin.webContents.send('browser-view:state-changed', {
      visible: state.visible,
      width: viewW
    })
  }
}

function setBounds(win: BrowserWindow): void {
  if (!state.view || !state.mainWin) return
  const bounds = win.getContentBounds()
  const viewW = Math.round(bounds.width * state.splitRatio)
  const viewX = bounds.width - viewW

  // 通知导航栏当前比例
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:ratio', { ratio: state.splitRatio })
  }

  const contentY = TITLEBAR_H + NAVBAR_H
  const contentH = bounds.height - contentY

  // [2026-04-30] 计算浏览器内容、分隔线、DevTools 的布局
  if (state.devToolsVisible && state.devToolsView && state.devToolsSeparatorView) {
    const devToolsW = Math.round(viewW * state.devToolsRatio)
    const devToolsSeparatorX = viewX + viewW - devToolsW - DEVTOOLS_SEPARATOR_W
    const contentW = viewW - devToolsW - DEVTOOLS_SEPARATOR_W

    // 网页内容（左侧）
    state.view.setBounds({ x: viewX, y: contentY, width: contentW, height: contentH })
    // DevTools 分隔线
    state.devToolsSeparatorView.setBounds({ x: devToolsSeparatorX, y: contentY, width: DEVTOOLS_SEPARATOR_W, height: contentH })
    // DevTools（右侧）
    state.devToolsView.setBounds({ x: devToolsSeparatorX + DEVTOOLS_SEPARATOR_W, y: contentY, width: devToolsW, height: contentH })
  } else {
    // 无 DevTools 时，浏览器内容占满
    state.view.setBounds({ x: viewX, y: contentY, width: viewW, height: contentH })
  }

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
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:resize', { ratio: state.splitRatio })
  }
  notifyBrowserState()
}

// ── 导航栏 HTML ────────────────────────────────────────────────────

const NAVBAR_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
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
  border-left: 1px solid #333;
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
  const { ipcRenderer } = require('electron')
  $('drag-handle').addEventListener('mousedown', e => {
    $('drag-handle').classList.add('active'); document.body.style.cursor = 'col-resize'
    ipcRenderer.send('browser-nav:drag-start', window.__currentRatio || 0.5)
    e.preventDefault()
  })
  document.addEventListener('mouseup', () => {
    $('drag-handle').classList.remove('active'); document.body.style.cursor = ''
    ipcRenderer.send('browser-nav:drag-end')
  })
  $('back-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'back'))
  $('fwd-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'forward'))
  $('reload-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'reload'))
  $('devtools-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'devtools'))
  $('close-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'close'))
  $('url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) ipcRenderer.send('browser-nav:navigate', v) }
  })
  ipcRenderer.on('browser-nav:url', (_, d) => { $('url-input').value = d.url })
  ipcRenderer.on('browser-nav:nav-state', (_, d) => { $('back-btn').disabled = !d.canGoBack; $('fwd-btn').disabled = !d.canGoForward })
  ipcRenderer.on('browser-nav:devtools', (_, d) => { $('devtools-btn').classList.toggle('active', d.enabled) })
  ipcRenderer.on('browser-nav:ratio', (_, d) => { window.__currentRatio = d.ratio })
</script></body></html>`

// [2026-04-30] 分隔线 HTML — 用于拖拽调整 DevTools 宽度
// 注意：拖拽过程中鼠标会离开分隔线，所以 mousemove/mouseup 由主进程监听主窗口
const SEPARATOR_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #333;
  height: 100%;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}
body:hover { background: #f59e0b; }
.drag-indicator {
  width: 2px;
  height: 50%;
  background: #555;
  border-radius: 1px;
}
body:hover .drag-indicator { background: #fff; }
</style></head><body>
  <div class="drag-indicator"></div>
<script>
const { ipcRenderer } = require('electron')
document.body.addEventListener('mousedown', e => {
  ipcRenderer.send('browser-nav:devtools-drag-start')
  e.preventDefault()
})
document.body.addEventListener('mouseup', () => {
  ipcRenderer.send('browser-nav:devtools-drag-end')
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

// [2026-04-30] 创建 DevTools 分隔线视图
function createDevToolsSeparatorView(): WebContentsView {
  const prefs: WebPreferences = {
    nodeIntegration: true,
    contextIsolation: false,
    backgroundThrottling: false
  }
  const sep = new WebContentsView({ webPreferences: prefs })
  sep.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  sep.webContents.loadURL(`data:text/html;base64,${Buffer.from(SEPARATOR_HTML, 'utf-8').toString('base64')}`).catch(() => {})
  return sep
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

// [2026-04-30] 切换 DevTools — 使用独立的 WebContentsView
function toggleDevTools(): void {
  if (!state.view || !state.mainWin) return
  state.devToolsVisible = !state.devToolsVisible
  const win = state.mainWin

  if (state.devToolsVisible) {
    // 创建 DevTools 视图
    if (!state.devToolsView) {
      const prefs: WebPreferences = {
        nodeIntegration: false,
        contextIsolation: true,
      }
      state.devToolsView = new WebContentsView({ webPreferences: prefs })
      // 将此视图设置为 DevTools 的目标
      state.view.webContents.setDevToolsWebContents(state.devToolsView.webContents)
      state.devToolsView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
    // 创建 DevTools 分隔线
    if (!state.devToolsSeparatorView) {
      state.devToolsSeparatorView = createDevToolsSeparatorView()
    }
    // [2026-04-30] 先添加 DevTools，再添加分隔线（分隔线需要在最上层接收鼠标事件）
    win.contentView.addChildView(state.devToolsView)
    win.contentView.addChildView(state.devToolsSeparatorView)
    // 打开 DevTools（内容会显示在 devToolsView 中）
    state.view.webContents.openDevTools()
    // 更新布局
    setBounds(win)
  } else {
    // 关闭 DevTools
    state.view.webContents.closeDevTools()
    // 移除视图
    if (state.devToolsView) {
      win.contentView.removeChildView(state.devToolsView)
    }
    if (state.devToolsSeparatorView) {
      win.contentView.removeChildView(state.devToolsSeparatorView)
    }
    // 更新布局（浏览器内容恢复全宽）
    setBounds(win)
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

    view.webContents.on('console-message', (_event: Electron.Event, level: number, message: string, _line: number, _sourceId: string) => {
      consoleLogs.push({
        level: levelToString(level),
        text: message,
        timestamp: new Date().toISOString()
      })
      if (consoleLogs.length > CONSOLE_BUFFER_MAX) {
        consoleLogs.shift()
      }
    })

    state.navView = createNavView()
    state.mainWin = win

    // 窗口 resize 时重新定位 + 通知渲染进程
    state.resizeHandler = () => { setBounds(win); notifyBrowserState() }
    win.on('resize', state.resizeHandler)
    win.on('maximize', state.resizeHandler)
    win.on('unmaximize', state.resizeHandler)

    win.contentView.addChildView(view)
    win.contentView.addChildView(state.navView)
  }

  state.mainWin = win
  setBounds(win)
  // 先添加浏览器内容，再添加导航栏（确保导航栏在最上层）
  if (state.navView) win.contentView.addChildView(state.navView)
  win.contentView.addChildView(state.view)

  if (url) {
    state.view.webContents.loadURL(url).catch(() => {})
  } else if (!state.view.webContents.getURL()) {
    state.view.webContents.loadURL('https://www.bing.com').catch(() => {})
  }

  state.visible = true
  notifyBrowserState()
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
  if (!state.view || !state.mainWin) return
  state.mainWin.contentView.removeChildView(state.view)
  if (state.navView) {
    state.mainWin.contentView.removeChildView(state.navView)
  }
  // [2026-04-30] 清理 DevTools 相关视图
  if (state.devToolsVisible) {
    state.view.webContents.closeDevTools()
    if (state.devToolsView) {
      state.mainWin.contentView.removeChildView(state.devToolsView)
    }
    if (state.devToolsSeparatorView) {
      state.mainWin.contentView.removeChildView(state.devToolsSeparatorView)
    }
    state.devToolsVisible = false
  }
  state.visible = false
  notifyBrowserState()
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

  // [2026-04-30] 浏览器面板拖拽（通过主窗口 input-event 全局跟踪，解决 WebContentsView 内 mousemove 出界断触问题）
  ipcMain.on('browser-nav:drag-start', (event, _startRatio: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && state.mainWin === win && state.visible) {
      browserDragging = true
      win.on('input-event', handleBrowserDragWindowInput)
    }
  })

  ipcMain.on('browser-nav:drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) handleBrowserDragEnd(win)
  })

  // [2026-04-30] DevTools 分隔线拖拽开始/结束
  ipcMain.on('browser-nav:devtools-drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && state.mainWin === win && state.devToolsVisible) {
      devToolsDragging = true
      win.on('input-event', handleDevToolsDragWindowInput)
    }
  })

  ipcMain.on('browser-nav:devtools-drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) handleDevToolsDragEnd(win)
  })
}

// [2026-04-30] 处理 DevTools 分隔线拖拽 BrowserWindow input-event
function handleDevToolsDragWindowInput(_event: Electron.Event, input: Electron.Input): void {
  if (!devToolsDragging || !state.mainWin) return
  if (input.type === 'mouseMove') {
    const bounds = state.mainWin.getContentBounds()
    const panelWidth = Math.round(bounds.width * state.splitRatio)
    const mouseX = input.x
    // DevTools 在右侧，mouseX 越大 DevTools 越小
    const devToolsWidth = bounds.width - mouseX - DEVTOOLS_SEPARATOR_W / 2
    const newRatio = devToolsWidth / panelWidth
    state.devToolsRatio = Math.max(DEVTOOLS_MIN_RATIO, Math.min(DEVTOOLS_MAX_RATIO, newRatio))
    setBounds(state.mainWin)
  } else if (input.type === 'mouseUp') {
    handleDevToolsDragEnd(state.mainWin)
  }
}

// [2026-04-30] 处理 DevTools 分隔线拖拽结束
function handleDevToolsDragEnd(win: BrowserWindow): void {
  if (!devToolsDragging) return
  devToolsDragging = false
  win.removeListener('input-event', handleDevToolsDragWindowInput)
}

// [2026-04-30] 处理浏览器面板拖拽 — 主窗口 input-event
function handleBrowserDragWindowInput(_event: Electron.Event, input: Electron.Input): void {
  if (!browserDragging || !state.mainWin) return
  if (input.type === 'mouseMove') {
    const bounds = state.mainWin.getContentBounds()
    const mouseX = input.x
    // 浏览器面板在窗口右侧，mouseX 越大表示面板越窄
    const panelWidth = bounds.width - mouseX
    const newRatio = panelWidth / bounds.width
    setSplitRatio(state.mainWin, newRatio)
  } else if (input.type === 'mouseUp') {
    handleBrowserDragEnd(state.mainWin)
  }
}

// [2026-04-30] 处理浏览器面板拖拽结束
function handleBrowserDragEnd(win: BrowserWindow): void {
  if (!browserDragging) return
  browserDragging = false
  win.removeListener('input-event', handleBrowserDragWindowInput)
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

        // GET /console?clear=true
        if (path === '/console' && req.method === 'GET') {
          const doClear = url.searchParams.get('clear') === 'true'
          const entries = [...consoleLogs]
          if (doClear) {
            consoleLogs.length = 0
          }
          res.writeHead(200); res.end(JSON.stringify({ entries }))
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
