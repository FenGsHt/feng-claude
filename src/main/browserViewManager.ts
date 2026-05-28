import { BrowserWindow, ipcMain, screen, WebContentsView, WebPreferences } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { URL } from 'url'
import { WebSocketServer, WebSocket } from 'ws'

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
  toolsPanelWidth: number // [2026-05-01] Tools calls 面板宽度，浏览器需要在其左边
}

const state: BrowserPanelState = {
  view: null,
  navView: null,
  devToolsView: null,
  devToolsSeparatorView: null,
  mainWin: null,
  visible: false,
  resizeHandler: null,
  /* [2026-04-30] 原默认 0.5，首次打开占半屏偏大；调小成辅助调试面板宽度。 */
  splitRatio: 0.35,
  devToolsRatio: 0.4,
  devToolsVisible: false,
  toolsPanelWidth: 0
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
let devToolsDragTimer: NodeJS.Timeout | null = null

// [2026-04-30] 浏览器面板拖拽状态（通过主窗口 input-event 全局跟踪）
let browserDragging = false
let browserDragTimer: NodeJS.Timeout | null = null

// ── 布局计算 ───────────────────────────────────────────────────────

function notifyBrowserState(): void {
  const wins = BrowserWindow.getAllWindows()
  const mainWin = wins[0]
  if (mainWin?.webContents && state.view) {
    const bounds = mainWin.getContentBounds()
    // [2026-05-01] 与 setBounds 一致，使用去掉 Tools 面板后的有效宽度
    const effectiveWidth = bounds.width - state.toolsPanelWidth
    const viewW = state.visible ? Math.round(effectiveWidth * state.splitRatio) : 0
    mainWin.webContents.send('browser-view:state-changed', {
      visible: state.visible,
      width: viewW
    })
  }
}

function setBounds(win: BrowserWindow): void {
  if (!state.view || !state.mainWin) return
  const bounds = win.getContentBounds()
  // [2026-05-01] 浏览器面板右边需要给 Tools calls 面板留空间
  const effectiveWidth = bounds.width - state.toolsPanelWidth
  const viewW = Math.round(effectiveWidth * state.splitRatio)
  const viewX = effectiveWidth - viewW

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
  <button id="pick-btn" title="点击拾取页面元素，将层级信息发送到对话框">⊕</button>
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
  $('pick-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'pick'))
  $('url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) ipcRenderer.send('browser-nav:navigate', v) }
  })
  ipcRenderer.on('browser-nav:url', (_, d) => { $('url-input').value = d.url })
  ipcRenderer.on('browser-nav:nav-state', (_, d) => { $('back-btn').disabled = !d.canGoBack; $('fwd-btn').disabled = !d.canGoForward })
  ipcRenderer.on('browser-nav:devtools', (_, d) => { $('devtools-btn').classList.toggle('active', d.enabled) })
  ipcRenderer.on('browser-nav:ratio', (_, d) => { window.__currentRatio = d.ratio })
  ipcRenderer.on('browser-nav:pick-active', (_, d) => { $('pick-btn').classList.toggle('active', d.active) })
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

// 切换 DevTools — 使用 mode:'right' 内嵌在 state.view 内部，无需独立 WebContentsView
function toggleDevTools(): void {
  if (!state.view || !state.mainWin) return
  state.devToolsVisible = !state.devToolsVisible

  if (state.devToolsVisible) {
    // mode:'right' 让 Chrome 直接在浏览器视图内右侧渲染 DevTools，无空白间隔问题
    state.view.webContents.openDevTools({ mode: 'right' })
    // DevTools 分阶段异步初始化，did-finish-load 之后页面仍在继续布局，
    // 需要在多个时间点强制 setBounds + 注入 CSS 覆盖 DevTools 内部尺寸
  } else {
    state.view.webContents.closeDevTools()
  }
  // 通知导航栏按钮状态
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:devtools', { enabled: state.devToolsVisible })
  }
}

// ── 公共 API ───────────────────────────────────────────────────────

function revealMainWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  // [2026-05-27] 只在窗口未聚焦时才 focus；Windows ConPTY 在已聚焦窗口重复收到
  // SetFocus 时可能断开，PTY 进程以 STILL_ACTIVE(259) 退出。
  if (!win.isFocused()) win.focus()
}

/** 创建或显示浏览器面板 */
export function showBrowserView(win: BrowserWindow, url?: string): void {
  revealMainWindow(win)
  if (!state.view) {
    const prefs: WebPreferences = {
      nodeIntegration: false,
      contextIsolation: true,
    }
    const view = new WebContentsView({ webPreferences: prefs })
    state.view = view

    // 拦截新窗口请求
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // Ctrl+Shift+D — element picker，当浏览器页面获得焦点时也能触发
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'q') {
        event.preventDefault()
        void startElementPicker()
      }
    })

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

function ensureBrowserVisible(): boolean {
  if (state.visible && state.view?.webContents) return true
  if (!state.mainWin) return false
  /* [2026-04-30] 允许 Claude Code 直接调用 browser_navigate/browser_screenshot 拉起内置浏览器，
   * 不再要求用户或模型先显式调用 browser_show。 */
  showBrowserView(state.mainWin)
  return Boolean(state.visible && state.view?.webContents)
}

export async function navigateTo(url: string): Promise<{ success: boolean; url: string }> {
  if (!ensureBrowserVisible() || !state.view?.webContents) {
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

// ── CDP 代理（让 browser-tools MCP 直接连接内嵌浏览器）────────────────────

const CDP_PROXY_PORT = 9223   // browser-tools 配置此端口即可连接内嵌浏览器

let cdpWss: WebSocketServer | null = null

export function startCdpProxy(): void {
  if (cdpWss) return  // 已启动

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${CDP_PROXY_PORT}`)
    const path = url.pathname
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')

    let wc = state.view?.webContents ?? null

    if (path === '/json' || path === '/json/list') {
      // [2026-05-06] CDP 客户端查询时自动打开内嵌浏览器，避免正式版首次连接返回空列表
      if (!wc && state.mainWin) {
        showBrowserView(state.mainWin)
        wc = state.view?.webContents ?? null
      }
      const targets = wc ? [{
        description: 'Feng Claude Embedded Browser',
        devtoolsFrontendUrl: `chrome-devtools://devtools/bundled/inspector.html?ws=localhost:${CDP_PROXY_PORT}/devtools/page/embedded`,
        id: 'embedded',
        title: wc.getTitle() || 'Embedded Browser',
        type: 'page',
        url: wc.getURL() || 'about:blank',
        webSocketDebuggerUrl: `ws://localhost:${CDP_PROXY_PORT}/devtools/page/embedded`
      }] : []
      res.writeHead(200); res.end(JSON.stringify(targets))
      return
    }

    if (path === '/json/version') {
      res.writeHead(200); res.end(JSON.stringify({
        Browser: 'Chrome/120.0.0.0',
        'Protocol-Version': '1.3',
        'User-Agent': 'Mozilla/5.0 Feng-Claude-Embedded',
        'V8-Version': '12.0.267.17',
        'WebKit-Version': '537.36 (@embedded)',
        webSocketDebuggerUrl: `ws://localhost:${CDP_PROXY_PORT}/devtools/browser`
      }))
      return
    }

    res.writeHead(404); res.end('{}')
  })

  cdpWss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? ''
    if (url.startsWith('/devtools/page/embedded') || url.startsWith('/devtools/browser')) {
      cdpWss!.handleUpgrade(req, socket, head, (ws) => startCdpSession(ws))
    } else {
      socket.destroy()
    }
  })

  httpServer.listen(CDP_PROXY_PORT, '127.0.0.1', () => {
    console.log(`[browser] CDP proxy listening on port ${CDP_PROXY_PORT} — configure browser-tools to use this port`)
  })

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[browser] CDP proxy port ${CDP_PROXY_PORT} already in use`)
    }
  })
}

function startCdpSession(ws: WebSocket): void {
  // [2026-05-06] WebSocket 连接时若浏览器未打开则自动拉起
  if (!state.view && state.mainWin) showBrowserView(state.mainWin)
  const wc = state.view?.webContents
  if (!wc) { ws.close(); return }

  // 附加调试器（可能已附加，忽略错误）
  try { wc.debugger.attach('1.3') } catch { /* already attached */ }

  // 内嵌浏览器 → client（CDP 事件推送）
  type DebuggerMessageHandler = (event: Electron.Event, method: string, params: unknown) => void
  const onMsg: DebuggerMessageHandler = (_evt, method, params) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method, params }))
    }
  }
  wc.debugger.on('message', onMsg)

  // client → 内嵌浏览器（CDP 命令转发）
  ws.on('message', async (data) => {
    let msg: { id: number; method: string; params?: Record<string, unknown>; sessionId?: string }
    try { msg = JSON.parse(data.toString()) } catch { return }
    try {
      const result = await wc.debugger.sendCommand(msg.method, msg.params ?? {}, msg.sessionId)
      ws.send(JSON.stringify({ id: msg.id, result: result ?? {} }))
    } catch (e) {
      ws.send(JSON.stringify({ id: msg.id, error: { code: -32000, message: String(e) } }))
    }
  })

  ws.on('close', () => {
    wc.debugger.removeListener('message', onMsg)
    try { wc.debugger.detach() } catch { /* ignore */ }
  })

  ws.on('error', () => {
    wc.debugger.removeListener('message', onMsg)
    try { wc.debugger.detach() } catch { /* ignore */ }
  })
}

// ── 元素拾取器 ─────────────────────────────────────────────────────────

let isPickerActive = false

export async function startElementPicker(): Promise<void> {
  if (!state.view?.webContents || !state.mainWin) return

  // 已在拾取中 → 再按一次取消
  if (isPickerActive) {
    isPickerActive = false
    if (state.navView?.webContents) {
      state.navView.webContents.send('browser-nav:pick-active', { active: false })
    }
    // 向页面派发 Escape，触发拾取器已有的 onKey 清理逻辑
    await state.view.webContents.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`
    ).catch(() => {})
    return
  }

  isPickerActive = true
  // 激活按钮视觉反馈
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:pick-active', { active: true })
  }

  const PICKER_JS = `
new Promise((resolve) => {
  let highlighted = null
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;pointer-events:none;background:rgba(59,130,246,0.25);border:2px solid #3b82f6;z-index:2147483647;box-sizing:border-box;border-radius:2px'
  document.body.appendChild(overlay)

  const tooltip = document.createElement('div')
  tooltip.style.cssText = 'position:fixed;background:#1e293b;color:#93c5fd;font-family:monospace;font-size:11px;padding:3px 7px;border-radius:4px;z-index:2147483647;pointer-events:none;max-width:500px;word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,0.5)'
  document.body.appendChild(tooltip)

  function getSelector(el) {
    const parts = []
    let cur = el
    while (cur && cur !== document.documentElement && cur.tagName) {
      let part = cur.tagName.toLowerCase()
      if (cur.id) { part += '#' + CSS.escape(cur.id); parts.unshift(part); break }
      const siblings = cur.parentNode ? Array.from(cur.parentNode.children).filter(c => c.tagName === cur.tagName) : []
      if (siblings.length > 1) {
        const idx = Array.from(cur.parentNode.children).indexOf(cur) + 1
        part += ':nth-child(' + idx + ')'
      }
      parts.unshift(part)
      cur = cur.parentElement
    }
    return parts.join(' > ')
  }

  function getPath(el) {
    const chain = []
    let cur = el
    while (cur && cur.tagName) {
      let desc = cur.tagName.toLowerCase()
      if (cur.id) desc += '#' + cur.id
      else if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.')
        if (cls) desc += '.' + cls
      }
      chain.unshift(desc)
      cur = cur.parentElement
    }
    return chain.join(' > ')
  }

  function highlight(el) {
    if (el === overlay || el === tooltip) return
    const r = el.getBoundingClientRect()
    overlay.style.left = r.left + 'px'
    overlay.style.top = r.top + 'px'
    overlay.style.width = r.width + 'px'
    overlay.style.height = r.height + 'px'
    const sel = getSelector(el)
    tooltip.textContent = sel
    const ty = r.top > 28 ? r.top - 24 : r.bottom + 4
    const tx = Math.max(4, Math.min(r.left, window.innerWidth - 420))
    tooltip.style.left = tx + 'px'
    tooltip.style.top = ty + 'px'
  }

  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && el !== overlay && el !== tooltip) { highlighted = el; highlight(el) }
  }

  function onClick(e) {
    e.preventDefault(); e.stopPropagation()
    const el = highlighted
    cleanup()
    if (!el) { resolve(null); return }
    const r = el.getBoundingClientRect()
    resolve({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      selector: getSelector(el),
      path: getPath(el),
      text: (el.innerText || '').trim().slice(0, 300),
      html: el.outerHTML.slice(0, 600),
      bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    })
  }

  function onKey(e) {
    if (e.key === 'Escape') { cleanup(); resolve(null) }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    document.body.style.cursor = prev
    overlay.remove()
    tooltip.remove()
  }

  const prev = document.body.style.cursor
  document.body.style.cursor = 'crosshair'
  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
})
`

  try {
    const result = await state.view.webContents.executeJavaScript(PICKER_JS)
    if (result && state.mainWin?.webContents) {
      state.mainWin.webContents.send('browser:element-picked', result)
    }
  } catch (e) {
    console.warn('[browser] element picker error:', e)
  } finally {
    isPickerActive = false
    if (state.navView?.webContents) {
      state.navView.webContents.send('browser-nav:pick-active', { active: false })
    }
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
    else if (action === 'pick') void startElementPicker()
  })

  ipcMain.on('browser-nav:navigate', (_event, url: string) => {
    browserNavigate(url)
  })

  ipcMain.on('browser-nav:set-ratio', (event, ratio: number) => {
    const win = getBrowserOwnerWindow(event.sender)
    if (win) setSplitRatio(win, ratio)
  })

  // [2026-05-01] Tools calls 面板宽度变化，浏览器需要在其左边布局
  ipcMain.on('browser-view:set-tools-panel-width', (event, width: number) => {
    const win = getBrowserOwnerWindow(event.sender)
    state.toolsPanelWidth = width
    if (win && state.visible) setBounds(win)
  })

  // [2026-04-30] 浏览器面板拖拽（通过主窗口 input-event 全局跟踪，解决 WebContentsView 内 mousemove 出界断触问题）
  ipcMain.on('browser-nav:drag-start', (event, _startRatio: number) => {
    const win = getBrowserOwnerWindow(event.sender)
    if (win && state.mainWin === win && state.visible) {
      browserDragging = true
      /* [2026-04-30] 原挂在 BrowserWindow.on('input-event')；该事件属于 webContents，导致拖拽时收不到 mouseMove。 */
      win.webContents.removeListener('input-event', handleBrowserDragWindowInput)
      win.webContents.on('input-event', handleBrowserDragWindowInput)
      startBrowserDragPolling(win)
    }
  })

  ipcMain.on('browser-nav:drag-end', (event) => {
    const win = getBrowserOwnerWindow(event.sender)
    if (win) handleBrowserDragEnd(win)
  })

  // [2026-04-30] DevTools 分隔线拖拽开始/结束
  ipcMain.on('browser-nav:devtools-drag-start', (event) => {
    const win = getBrowserOwnerWindow(event.sender)
    if (win && state.mainWin === win && state.devToolsVisible) {
      devToolsDragging = true
      /* [2026-04-30] 原从 WebContentsView sender 反查 BrowserWindow，常拿不到；并且 input-event 需要挂到 webContents。 */
      win.webContents.removeListener('input-event', handleDevToolsDragWindowInput)
      win.webContents.on('input-event', handleDevToolsDragWindowInput)
      startDevToolsDragPolling(win)
    }
  })

  ipcMain.on('browser-nav:devtools-drag-end', (event) => {
    const win = getBrowserOwnerWindow(event.sender)
    if (win) handleDevToolsDragEnd(win)
  })
}

function getBrowserOwnerWindow(sender: Electron.WebContents): BrowserWindow | null {
  /* [2026-04-30] 导航栏/分隔线是 WebContentsView，BrowserWindow.fromWebContents(sender) 可能为 null；
   * 浏览器面板本身是单例，优先使用 state.mainWin。 */
  return state.mainWin ?? BrowserWindow.fromWebContents(sender)
}

// [2026-04-30] 处理 DevTools 分隔线拖拽 BrowserWindow input-event
function handleDevToolsDragWindowInput(_event: Electron.Event, input: Electron.Input): void {
  if (!devToolsDragging || !state.mainWin) return
  if (input.type === 'mouseMove') {
    updateDevToolsDragByContentX(input.x)
  } else if (input.type === 'mouseUp') {
    handleDevToolsDragEnd(state.mainWin)
  }
}

function updateDevToolsDragByContentX(mouseX: number): void {
  if (!state.mainWin) return
  const bounds = state.mainWin.getContentBounds()
  const panelWidth = Math.round(bounds.width * state.splitRatio)
  // DevTools 在右侧，mouseX 越大 DevTools 越小
  const devToolsWidth = bounds.width - mouseX - DEVTOOLS_SEPARATOR_W / 2
  const newRatio = devToolsWidth / panelWidth
  state.devToolsRatio = Math.max(DEVTOOLS_MIN_RATIO, Math.min(DEVTOOLS_MAX_RATIO, newRatio))
  setBounds(state.mainWin)
}

function startDevToolsDragPolling(win: BrowserWindow): void {
  if (devToolsDragTimer) clearInterval(devToolsDragTimer)
  const startedAt = Date.now()
  /* [2026-04-30] WebContentsView 内的 mousemove 不一定冒泡到主 webContents；轮询系统鼠标坐标作为拖拽兜底。 */
  devToolsDragTimer = setInterval(() => {
    if (!devToolsDragging || !state.mainWin) return
    const bounds = win.getContentBounds()
    const point = screen.getCursorScreenPoint()
    updateDevToolsDragByContentX(point.x - bounds.x)
    if (Date.now() - startedAt > 10000) handleDevToolsDragEnd(win)
  }, 16)
}

// [2026-04-30] 处理 DevTools 分隔线拖拽结束
function handleDevToolsDragEnd(win: BrowserWindow): void {
  if (!devToolsDragging) return
  devToolsDragging = false
  if (devToolsDragTimer) {
    clearInterval(devToolsDragTimer)
    devToolsDragTimer = null
  }
  win.webContents.removeListener('input-event', handleDevToolsDragWindowInput)
}

// [2026-04-30] 处理浏览器面板拖拽 — 主窗口 input-event
function handleBrowserDragWindowInput(_event: Electron.Event, input: Electron.Input): void {
  if (!browserDragging || !state.mainWin) return
  if (input.type === 'mouseMove') {
    updateBrowserDragByContentX(input.x)
  } else if (input.type === 'mouseUp') {
    handleBrowserDragEnd(state.mainWin)
  }
}

function updateBrowserDragByContentX(mouseX: number): void {
  if (!state.mainWin) return
  const bounds = state.mainWin.getContentBounds()
  // 浏览器面板在窗口右侧，mouseX 越大表示面板越窄
  const panelWidth = bounds.width - mouseX
  const newRatio = panelWidth / bounds.width
  setSplitRatio(state.mainWin, newRatio)
}

function startBrowserDragPolling(win: BrowserWindow): void {
  if (browserDragTimer) clearInterval(browserDragTimer)
  const startedAt = Date.now()
  /* [2026-04-30] WebContentsView 导航栏发起拖拽后，鼠标移出 navView 时不保证继续有 DOM mousemove；轮询系统鼠标坐标保持拖拽连续。 */
  browserDragTimer = setInterval(() => {
    if (!browserDragging || !state.mainWin) return
    const bounds = win.getContentBounds()
    const point = screen.getCursorScreenPoint()
    updateBrowserDragByContentX(point.x - bounds.x)
    if (Date.now() - startedAt > 10000) handleBrowserDragEnd(win)
  }, 16)
}

// [2026-04-30] 处理浏览器面板拖拽结束
function handleBrowserDragEnd(win: BrowserWindow): void {
  if (!browserDragging) return
  browserDragging = false
  if (browserDragTimer) {
    clearInterval(browserDragTimer)
    browserDragTimer = null
  }
  win.webContents.removeListener('input-event', handleBrowserDragWindowInput)
}

// ─ HTTP API ──────────────────────────────────────────────────────────

let browserHttpServer: Server | null = null
let browserServerPort = 0   // OS 分配后写入，供 ptyManager 读取

/** 返回当前实例浏览器 HTTP 服务的端口（0 = 尚未启动） */
export function getBrowserServerPort(): number { return browserServerPort }

export function startBrowserServer(win: BrowserWindow): Promise<{ port: number }> {
  /* [2026-04-30] HTTP /show 可能早于用户手动打开浏览器；原来未保存 win，state.mainWin=null 时仍返回 visible:true 但不显示。 */
  state.mainWin = win

  return new Promise((resolve) => {
    browserHttpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
          ensureBrowserVisible()
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open and no main window is available' }))
            return
          }
          if (!state.visible || !state.view || !state.mainWin) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser view is hidden and could not be shown' }))
            return
          }
          const bounds = state.view.getBounds()
          if (bounds.width <= 0 || bounds.height <= 0) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser view has empty bounds', bounds, url: webContents.getURL() }))
            return
          }

          /* [2026-04-30] 原直接 capturePage 后返回 base64；页面刚显示/未 paint 时可能拿到 empty NativeImage，
           * Claude 侧表现为 browser_screenshot 返回空。等待一帧并返回尺寸诊断，便于判断是否真截图成功。 */
          await new Promise((resolve) => setTimeout(resolve, 100))
          const image = await webContents.capturePage()
          if (image.isEmpty()) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'Captured image is empty', bounds, url: webContents.getURL() }))
            return
          }
          const png = image.toPNG()
          const size = image.getSize()
          const base64 = png.toString('base64')
          res.writeHead(200); res.end(JSON.stringify({
            format: 'png',
            data: base64,
            width: size.width,
            height: size.height,
            byteLength: png.length,
            url: webContents.getURL()
          }))
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
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open. Call browser_show or browser_navigate first.' }))
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
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open. Call browser_show or browser_navigate first.' }))
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
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open. Call browser_show or browser_navigate first.' }))
            return
          }
          res.writeHead(200); res.end(JSON.stringify({ url: webContents.getURL() }))
          return
        }

        if (path === '/text' && req.method === 'GET') {
          const selector = url.searchParams.get('selector')
          const webContents = getBrowserViewWebContents()
          if (!webContents) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open. Call browser_show or browser_navigate first.' }))
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
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open. Call browser_show or browser_navigate first.' }))
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

        if (path === '/show') {
          if (!state.mainWin) {
            res.writeHead(500); res.end(JSON.stringify({ visible: false, error: 'No main window is registered for embedded browser' }))
            return
          }
          showBrowserView(state.mainWin)
          res.writeHead(200); res.end(JSON.stringify({ visible: state.visible }))
          return
        }

        if (path === '/hide') {
          hideBrowserView()
          res.writeHead(200); res.end(JSON.stringify({ visible: false }))
          return
        }

        // /devtools — toggle DevTools（GET 或 POST 均可）
        if (path === '/devtools') {
          toggleDevTools()
          res.writeHead(200); res.end(JSON.stringify({ visible: state.devToolsVisible }))
          return
        }

        // /back
        if (path === '/back') {
          browserBack()
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }

        // /forward
        if (path === '/forward') {
          browserForward()
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }

        // /reload
        if (path === '/reload') {
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

        // POST /open-office-preview — trigger Office preview panel from MCP
        if (path === '/open-office-preview' && req.method === 'POST') {
          const body = await readBody(req)
          const filePath = body?.filePath as string
          if (!filePath) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing filePath' }))
            return
          }
          state.mainWin?.webContents.send('office:preview:trigger', filePath)
          res.writeHead(200); res.end(JSON.stringify({ success: true }))
          return
        }

        res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }))
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
      }
    })

    // port 0 → OS 自动分配空闲端口，多实例互不冲突
    browserHttpServer!.listen(0, '127.0.0.1', () => {
      const addr = browserHttpServer!.address() as { port: number }
      browserServerPort = addr.port
      console.log(`[browser] HTTP API server listening on port ${browserServerPort}`)
      resolve({ port: browserServerPort })
    })

    browserHttpServer!.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[browser] HTTP server error:', err.message)
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
