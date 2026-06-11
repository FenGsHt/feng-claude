import { BrowserWindow, ipcMain, screen, WebContentsView, WebPreferences, app } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { URL } from 'url'
import { WebSocketServer, WebSocket } from 'ws'
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { handleCloneRoute } from './cloneManager'

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

// ── 浏览器 URL 持久化 ───────────────────────────────────────────────────────
function browserStateFile(): string {
  return join(app.getPath('userData'), 'browser-state.json')
}
function loadLastBrowserUrl(): string {
  try {
    const data = JSON.parse(readFileSync(browserStateFile(), 'utf-8'))
    return typeof data?.lastUrl === 'string' ? data.lastUrl : ''
  } catch { return '' }
}
function saveLastBrowserUrl(url: string): void {
  if (!url || url.startsWith('data:') || url === 'about:blank') return
  try { writeFileSync(browserStateFile(), JSON.stringify({ lastUrl: url }), 'utf-8') } catch { /* ignore */ }
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

// local static servers created by /serve-local, keyed by dir
const localServers = new Map<string, Server>()

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

// 弹窗遮挡计数：>0 时临时隐藏浏览器面板，降至 0 时自动恢复
let overlayCount = 0
let overlayHiddenWhileVisible = false

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
  <button id="pick-btn" title="点击拾取页面元素，将层级信息发送到对话框 (Ctrl+Shift+Q)">⊕</button>
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

    // URL 变化时更新导航栏地址并持久化
    view.webContents.on('did-navigate', (_, navUrl) => {
      updateNavUrl(navUrl)
      updateNavBackForward()
      saveLastBrowserUrl(navUrl)
    })
    view.webContents.on('did-navigate-in-page', (_, navUrl) => {
      updateNavUrl(navUrl)
      updateNavBackForward()
      saveLastBrowserUrl(navUrl)
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
  } else {
    const currentUrl = state.view.webContents.getURL()
    if (!currentUrl || currentUrl === 'about:blank') {
      const last = loadLastBrowserUrl()
      state.view.webContents.loadURL(last || 'https://www.bing.com').catch(() => {})
    }
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
  let phase = 'hover' // 'hover' | 'breadcrumb'

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;pointer-events:none;background:rgba(59,130,246,0.25);border:2px solid #3b82f6;z-index:2147483646;box-sizing:border-box;border-radius:2px;transition:all 0.08s ease'
  document.body.appendChild(overlay)

  const tooltip = document.createElement('div')
  tooltip.style.cssText = 'position:fixed;background:#1e293b;color:#93c5fd;font-family:monospace;font-size:11px;padding:3px 7px;border-radius:4px;z-index:2147483647;pointer-events:none;max-width:500px;word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,0.5)'
  document.body.appendChild(tooltip)

  // 面包屑条（点击后显示）
  const bar = document.createElement('div')
  bar.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;border-bottom:1px solid #1e40af;padding:5px 10px;font-family:monospace;font-size:11px;color:#94a3b8;overflow-x:auto;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6);scrollbar-width:thin'
  document.body.appendChild(bar)

  // 确认按钮（浮在高亮元素右下角）
  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = '✓ 发送到输入框'
  confirmBtn.title = '点击将此元素信息发送到 Claude 输入框（也可再次点击面包屑中已选中项）'
  confirmBtn.style.cssText = 'display:none;position:fixed;z-index:2147483647;background:#1d4ed8;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-family:system-ui,sans-serif;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.5);white-space:nowrap;transition:background 0.1s'
  confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = '#2563eb' })
  confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = '#1d4ed8' })
  document.body.appendChild(confirmBtn)

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

  function getAncestors(el) {
    const chain = []
    let cur = el
    while (cur && cur.tagName && cur !== document.documentElement) {
      chain.unshift(cur)
      cur = cur.parentElement
    }
    return chain
  }

  function buildLabel(el) {
    let label = el.tagName.toLowerCase()
    if (el.id) label += '#' + el.id
    else if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.')
      if (cls) label += '.' + cls
    }
    return label
  }

  function showOverlay(el) {
    if (!el || !el.tagName) return
    const r = el.getBoundingClientRect()
    overlay.style.left = r.left + 'px'
    overlay.style.top = r.top + 'px'
    overlay.style.width = r.width + 'px'
    overlay.style.height = r.height + 'px'
    overlay.style.display = 'block'
  }

  function showConfirmBtn(el) {
    if (!el || !el.tagName) return
    const r = el.getBoundingClientRect()
    const barH = bar.style.display !== 'none' ? 28 : 0
    // 优先显示在元素右下角，边界保护
    let top = r.bottom + 6
    if (top + 30 > window.innerHeight) top = Math.max(barH + 4, r.top - 34)
    let left = r.right - 130
    if (left < 4) left = 4
    if (left + 140 > window.innerWidth) left = window.innerWidth - 144
    confirmBtn.style.top = top + 'px'
    confirmBtn.style.left = left + 'px'
    confirmBtn.style.display = 'block'
  }

  function hideConfirmBtn() {
    confirmBtn.style.display = 'none'
  }

  function showTooltip(el) {
    if (!el) { tooltip.style.display = 'none'; return }
    const r = el.getBoundingClientRect()
    const sel = getSelector(el)
    tooltip.textContent = sel
    tooltip.style.display = 'block'
    const ty = r.top > 28 ? r.top - 24 : r.bottom + 4
    const tx = Math.max(4, Math.min(r.left, window.innerWidth - 420))
    tooltip.style.left = tx + 'px'
    tooltip.style.top = ty + 'px'
  }

  // 构建面包屑：当前元素在最左，父级依次向右；activeEl 为当前高亮项
  // 点击非 active 项 → 切换高亮；点击已 active 项 → 确认发送
  function buildBreadcrumb(ancestors, activeEl) {
    bar.innerHTML = ''
    // 反转：当前元素在第一位，父级依次向后
    const reversed = [...ancestors].reverse()
    reversed.forEach((el, i) => {
      if (i > 0) {
        const sep = document.createElement('span')
        sep.textContent = ' › '
        sep.style.cssText = 'color:#475569;margin:0 1px'
        bar.appendChild(sep)
      }
      const btn = document.createElement('button')
      const isActive = el === activeEl
      btn.textContent = buildLabel(el)
      btn.dataset.active = isActive ? '1' : '0'
      btn.style.cssText = 'background:' + (isActive ? '#1e40af' : 'transparent') + ';color:' + (isActive ? '#93c5fd' : '#64748b') + ';border:none;padding:1px 6px;border-radius:3px;cursor:pointer;font-family:monospace;font-size:11px;transition:background 0.1s'
      btn.addEventListener('mouseenter', () => {
        if (btn.dataset.active !== '1') btn.style.background = '#1e293b'
        showOverlay(el)
        showTooltip(el)
      })
      btn.addEventListener('mouseleave', () => {
        if (btn.dataset.active !== '1') btn.style.background = 'transparent'
        // 恢复到当前 active 元素的高亮
        const activeBtn = bar.querySelector('button[data-active="1"]')
        if (activeBtn && activeBtn._el) { showOverlay(activeBtn._el); showTooltip(activeBtn._el) }
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation()
        if (btn.dataset.active === '1') {
          // 已是当前选中项，再次点击 → 确认发送
          confirmSelection(el)
        } else {
          // 切换到该项：重建面包屑，高亮切换，更新确认按钮
          buildBreadcrumb(ancestors, el)
          showOverlay(el)
          showTooltip(el)
          showConfirmBtn(el)
          confirmBtn.onclick = (ev) => { ev.stopPropagation(); confirmSelection(el) }
        }
      })
      btn._el = el
      bar.appendChild(btn)
    })
  }

  function confirmSelection(el) {
    cleanup()
    if (!el) { resolve(null); return }
    const r = el.getBoundingClientRect()
    resolve({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      selector: getSelector(el),
      path: getPath(el),
      text: (el.innerText || '').trim(),
      html: el.outerHTML,
      bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    })
  }

  function onMove(e) {
    if (phase !== 'hover') return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && el !== overlay && el !== tooltip && el !== bar && !bar.contains(el)) {
      highlighted = el
      showOverlay(el)
      showTooltip(el)
    }
  }

  function onClick(e) {
    if (bar.contains(e.target)) return // 面包屑按钮自己处理
    if (e.target === confirmBtn) return // 确认按钮自己处理（捕获阶段不拦截）
    e.preventDefault(); e.stopPropagation()
    if (phase === 'hover') {
      const el = highlighted
      if (!el) { cleanup(); resolve(null); return }
      // 切换到面包屑阶段
      phase = 'breadcrumb'
      tooltip.style.display = 'none'
      document.body.style.cursor = prev
      document.removeEventListener('mousemove', onMove, true)
      const ancestors = getAncestors(el)
      bar.style.display = 'block'
      buildBreadcrumb(ancestors, el)
      showOverlay(el)
      showConfirmBtn(el)
      confirmBtn.onclick = (e) => { e.stopPropagation(); confirmSelection(el) }
    }
    // breadcrumb 阶段点击空白处（非 bar 非 confirmBtn）：重置回 hover
    else if (phase === 'breadcrumb') {
      if (!bar.contains(e.target) && e.target !== confirmBtn) {
        phase = 'hover'
        bar.style.display = 'none'
        hideConfirmBtn()
        document.body.style.cursor = 'crosshair'
        document.addEventListener('mousemove', onMove, true)
        overlay.style.display = 'none'
        tooltip.style.display = 'none'
      }
    }
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
    bar.remove()
    confirmBtn.remove()
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
      // 先 focus 主窗口和 renderer webcontents，确保 ta.focus() 能生效
      revealMainWindow(state.mainWin)
      state.mainWin.webContents.focus()
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

/** 弹窗打开/关闭时调用，防止原生 WebContentsView 遮挡 DOM 弹窗 */
export function setOverlayOpen(win: BrowserWindow, open: boolean): void {
  if (open) {
    overlayCount++
    if (overlayCount === 1 && state.visible) {
      overlayHiddenWhileVisible = true
      hideBrowserView()
    }
  } else {
    overlayCount = Math.max(0, overlayCount - 1)
    if (overlayCount === 0 && overlayHiddenWhileVisible) {
      overlayHiddenWhileVisible = false
      showBrowserView(win)
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

  ipcMain.on('browser-view:overlay', (event, open: boolean) => {
    const win = getBrowserOwnerWindow(event.sender) ?? state.mainWin
    if (win) setOverlayOpen(win, open)
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

          /* [2026-06-02] 支持 ?format=jpeg|png&quality=0-100&scale=0.1-1.0
           * 默认 jpeg q=80 scale=0.8：比 PNG 快 3-5x，体积小 60-80%，AI 看图足够清晰。
           * 原始 PNG 请求用 ?format=png */
          const fmt    = (url.searchParams.get('format') ?? 'jpeg').toLowerCase()
          const quality = Math.max(10, Math.min(100, parseInt(url.searchParams.get('quality') ?? '80', 10)))
          const scale   = Math.max(0.1, Math.min(1.0, parseFloat(url.searchParams.get('scale') ?? '0.8')))

          await new Promise((resolve) => setTimeout(resolve, 80))
          let image = await webContents.capturePage()
          if (image.isEmpty()) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'Captured image is empty', bounds, url: webContents.getURL() }))
            return
          }

          // 缩放（对 AI 截图有明显提速效果）
          if (scale < 1.0) {
            const orig = image.getSize()
            image = image.resize({
              width: Math.round(orig.width * scale),
              height: Math.round(orig.height * scale),
              quality: 'good'
            })
          }

          const size = image.getSize()
          const buf  = fmt === 'png' ? image.toPNG() : image.toJPEG(quality)
          const base64 = buf.toString('base64')
          res.writeHead(200); res.end(JSON.stringify({
            format: fmt === 'png' ? 'png' : 'jpeg',
            data: base64,
            width: size.width,
            height: size.height,
            byteLength: buf.length,
            url: webContents.getURL()
          }))
          return
        }

        // GET /frames — 枚举页面内所有 iframe，返回 src/name/bounds（用于定位 cross-origin iframe）
        if (path === '/frames' && req.method === 'GET') {
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const frames = await wc.executeJavaScript(`
              Array.from(document.querySelectorAll('iframe')).map((f, i) => {
                const r = f.getBoundingClientRect()
                return {
                  index: i,
                  src: f.src || null,
                  name: f.name || f.id || null,
                  selector: f.id ? '#' + f.id : (f.name ? 'iframe[name="' + f.name + '"]' : 'iframe:nth-of-type(' + (i+1) + ')'),
                  bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
                  centerX: Math.round(r.x + r.width / 2),
                  centerY: Math.round(r.y + r.height / 2)
                }
              })
            `)
            res.writeHead(200); res.end(JSON.stringify({ frames }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /click-at — 按页面坐标点击（穿透 cross-origin iframe，如 Turnstile/reCAPTCHA）
        // body: { x, y, button? }
        if (path === '/click-at' && req.method === 'POST') {
          const body = await readBody(req)
          const x = Math.round(Number(body?.x) || 0)
          const y = Math.round(Number(body?.y) || 0)
          if (!body?.x && body?.x !== 0) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing x/y' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
            wc.sendInputEvent({ type: 'mouseMove', x, y } as Electron.MouseInputEvent)
            await delay(30 + Math.random() * 30)
            wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            await delay(60 + Math.random() * 60)
            wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            res.writeHead(200); res.end(JSON.stringify({ ok: true, x, y }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
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
            // [2026-06-11] 派发完整 pointer/mouse 事件序列，而非裸 el.click()。
            // Vue/React 的事件处理器多绑定在 mousedown/pointerdown/click 上，
            // 裸 .click() 只触发原生 click，常常不触发框架 handler（弹窗关不掉等）。
            const found = await webContents.executeJavaScript(
              `(function(){
                const el=document.querySelector(${JSON.stringify(selector)});
                if(!el)return false;
                el.scrollIntoView({block:'center',inline:'center'});
                const r=el.getBoundingClientRect();
                const cx=r.left+r.width/2, cy=r.top+r.height/2;
                const opts={bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy,button:0};
                try{el.dispatchEvent(new PointerEvent('pointerdown',opts));}catch(e){}
                el.dispatchEvent(new MouseEvent('mousedown',opts));
                try{el.dispatchEvent(new PointerEvent('pointerup',opts));}catch(e){}
                el.dispatchEvent(new MouseEvent('mouseup',opts));
                el.dispatchEvent(new MouseEvent('click',opts));
                if(typeof el.click==='function'){try{el.click();}catch(e){}}
                return true;
              })()`
            )
            if (!found) { res.writeHead(404); res.end(JSON.stringify({ error: `Element not found: ${selector}` })); return }
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
            const found = await webContents.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(el){el.focus();el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;})()`
            )
            if (!found) { res.writeHead(404); res.end(JSON.stringify({ error: `Element not found: ${selector}` })); return }
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
            const maxLength = Number(url.searchParams.get('maxLength')) || 30000
            const text = await webContents.executeJavaScript(js)
            res.writeHead(200); res.end(JSON.stringify({ text: String(text).slice(0, maxLength) }))
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
            const frameSelector = (body?.frameSelector as string) ?? ''
            // [2026-06-03] frameSelector 指定同源 iframe 时，通过 contentDocument 在其上下文执行
            const wrappedJs = frameSelector
              ? `(function(){const f=document.querySelector(${JSON.stringify(frameSelector)});if(!f||!f.contentDocument)throw new Error('iframe not found or cross-origin: '+${JSON.stringify(frameSelector)});with(f.contentDocument.defaultView){return(function(){${js}})()}})()`
              : js
            const result = await webContents.executeJavaScript(wrappedJs)
            res.writeHead(200)
            res.end(JSON.stringify({ result: typeof result === 'string' ? result : JSON.stringify(result) }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // POST /eval-in-frame — CDP isolated world，支持跨域 iframe
        // body: { frameUrl: string (partial URL match), javascript: string }
        if (path === '/eval-in-frame' && req.method === 'POST') {
          const body = await readBody(req)
          const frameUrl = (body?.frameUrl as string) ?? ''
          const js = (body?.javascript as string) ?? ''
          if (!frameUrl || !js) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing frameUrl or javascript' }))
            return
          }
          const wc = getBrowserViewWebContents()
          if (!wc) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' }))
            return
          }
          try {
            try { wc.debugger.attach('1.3') } catch { /* already attached */ }

            type FrameNode = { frame: { id: string; url: string; securityOrigin?: string }; childFrames?: FrameNode[] }
            const { frameTree } = await wc.debugger.sendCommand('Page.getFrameTree', {}) as { frameTree: FrameNode }

            // 先按 URL 匹配，URL 为 about:blank 等无效时再按 securityOrigin 匹配
            function findFrameId(node: FrameNode): string | null {
              if (node.frame.url.includes(frameUrl) || node.frame.securityOrigin?.includes(frameUrl)) return node.frame.id
              for (const child of (node.childFrames ?? [])) {
                const found = findFrameId(child)
                if (found) return found
              }
              return null
            }

            function collectUrls(node: FrameNode): string[] {
              return [`url=${node.frame.url} origin=${node.frame.securityOrigin ?? ''}`, ...(node.childFrames ?? []).flatMap(collectUrls)]
            }

            const frameId = findFrameId(frameTree)
            if (!frameId) {
              const available = collectUrls(frameTree)
              res.writeHead(404); res.end(JSON.stringify({ error: `No frame matching "${frameUrl}" found`, availableFrameUrls: available }))
              return
            }

            // grantUniversalAccess 让 isolated world 可以访问跨域 frame 的 DOM
            const { executionContextId } = await wc.debugger.sendCommand('Page.createIsolatedWorld', {
              frameId,
              worldName: 'mcp-frame-eval',
              grantUniversalAccess: true
            }) as { executionContextId: number }

            const evalResult = await wc.debugger.sendCommand('Runtime.evaluate', {
              expression: js,
              contextId: executionContextId,
              returnByValue: true,
              awaitPromise: true
            }) as { result: { value?: unknown; description?: string }; exceptionDetails?: { text: string } }

            if (evalResult.exceptionDetails) {
              res.writeHead(500); res.end(JSON.stringify({ error: evalResult.exceptionDetails.text }))
              return
            }

            const value = evalResult.result?.value
            res.writeHead(200)
            res.end(JSON.stringify({
              result: value !== undefined
                ? (typeof value === 'string' ? value : JSON.stringify(value))
                : (evalResult.result?.description ?? 'undefined'),
              frameId
            }))
          } catch (e) {
            res.writeHead(500); res.end(JSON.stringify({ error: String(e) }))
          }
          return
        }

        // POST /capture-resources — CDP 抓取页面所有网络资源存到本地
        // body: { url: string, outputDir: string, waitMs?: number }
        if (path === '/capture-resources' && req.method === 'POST') {
          const body = await readBody(req)
          const targetUrl = (body?.url as string) ?? ''
          const outputDir = (body?.outputDir as string) ?? ''
          if (!targetUrl || !outputDir) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url or outputDir' })); return
          }
          const waitMs = Math.min(Number(body?.waitMs ?? 3000), 15000)
          const wc = getBrowserViewWebContents()
          if (!wc) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return
          }
          try {
            try { wc.debugger.attach('1.3') } catch { /* already attached */ }

            // 收集 requestId → { url, mimeType, status }
            type ReqInfo = { url: string; mimeType: string; status: number }
            const requests = new Map<string, ReqInfo>()
            const onMsg = (_evt: Electron.Event, method: string, params: Record<string, unknown>) => {
              if (method === 'Network.responseReceived') {
                const resp = params.response as Record<string, unknown>
                requests.set(params.requestId as string, {
                  url: resp.url as string,
                  mimeType: (resp.mimeType as string) ?? '',
                  status: (resp.status as number) ?? 0
                })
              }
            }
            wc.debugger.on('message', onMsg)

            await wc.debugger.sendCommand('Network.enable', {})
            await wc.debugger.sendCommand('Page.enable', {})

            // 导航到目标页面
            const navDone = new Promise<void>(resolve => {
              const h = (_e: Electron.Event, method: string) => {
                if (method === 'Page.loadEventFired') {
                  wc.debugger.removeListener('message', h)
                  resolve()
                }
              }
              wc.debugger.on('message', h)
              setTimeout(resolve, 12000)
            })
            await wc.debugger.sendCommand('Page.navigate', { url: targetUrl })
            await navDone
            // 额外等待懒加载资源
            await new Promise(r => setTimeout(r, waitMs))
            wc.debugger.removeListener('message', onMsg)

            // 下载所有 response body
            mkdirSync(outputDir, { recursive: true })
            const manifest: Record<string, string> = {}
            const saved: string[] = []
            const skipped: string[] = []

            // 文件名去重
            const usedNames = new Set<string>()
            function uniqueName(name: string): string {
              if (!usedNames.has(name)) { usedNames.add(name); return name }
              const ext = extname(name)
              const base = basename(name, ext)
              let i = 2
              while (usedNames.has(`${base}_${i}${ext}`)) i++
              const n = `${base}_${i}${ext}`
              usedNames.add(n)
              return n
            }

            for (const [requestId, info] of requests) {
              if (info.status < 200 || info.status >= 300) continue
              // 按 MIME 类型分类
              const mime = info.mimeType.split(';')[0].trim()
              let subdir = 'other'
              if (mime.includes('html')) subdir = '.'
              else if (mime.includes('css')) subdir = 'css'
              else if (mime.includes('javascript') || mime.includes('ecmascript')) subdir = 'js'
              else if (mime.startsWith('image/')) subdir = 'images'
              else if (mime.includes('font')) subdir = 'fonts'
              else if (mime.includes('json')) subdir = 'data'
              else if (mime.includes('svg')) subdir = 'images'

              try {
                const rb = await wc.debugger.sendCommand('Network.getResponseBody', { requestId }) as { body: string; base64Encoded: boolean }
                const urlObj = new URL(info.url)
                let rawName = basename(urlObj.pathname) || 'index'
                if (!extname(rawName)) {
                  if (subdir === 'css') rawName += '.css'
                  else if (subdir === 'js') rawName += '.js'
                  else if (subdir === '.') rawName += '.html'
                }
                const finalName = uniqueName(subdir === '.' ? rawName : `${subdir}/${rawName}`)
                const destPath = join(outputDir, finalName)
                mkdirSync(dirname(destPath), { recursive: true })
                const content = rb.base64Encoded ? Buffer.from(rb.body, 'base64') : Buffer.from(rb.body, 'utf-8')
                writeFileSync(destPath, content)
                manifest[info.url] = finalName
                saved.push(finalName)
              } catch {
                skipped.push(info.url)
              }
            }

            // 写入 manifest
            writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

            res.writeHead(200); res.end(JSON.stringify({
              saved: saved.length,
              skipped: skipped.length,
              outputDir,
              manifest
            }))
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

        // GET /html?selector= — 返回页面或指定元素的 HTML
        if (path === '/html' && req.method === 'GET') {
          const selector = url.searchParams.get('selector')
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const js = selector
              ? `document.querySelector(${JSON.stringify(selector)})?.outerHTML ?? null`
              : 'document.documentElement.outerHTML'
            const html = await wc.executeJavaScript(js)
            res.writeHead(200); res.end(JSON.stringify({ html: typeof html === 'string' ? html.slice(0, 500_000) : null }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /scroll — 滚动到元素或坐标，或相对滚动 { selector? x? y? deltaY? behavior? }
        if (path === '/scroll' && req.method === 'POST') {
          const body = await readBody(req)
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const { selector, x, y, deltaY, behavior = 'smooth' } = body as Record<string, unknown>
            let js: string
            if (selector) {
              js = `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.scrollIntoView({behavior:${JSON.stringify(behavior)},block:'center'});return true})()`
            } else if (deltaY !== undefined) {
              js = `window.scrollBy({left:0,top:${Number(deltaY)},behavior:${JSON.stringify(behavior)}});true`
            } else {
              js = `window.scrollTo({left:${Number(x)||0},top:${Number(y)||0},behavior:${JSON.stringify(behavior)}});true`
            }
            const ok = await wc.executeJavaScript(js)
            res.writeHead(200); res.end(JSON.stringify({ ok: !!ok }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /key — 模拟键盘按键 { key, modifiers? } key 如 "Enter" "Tab" "Escape" "a" 等
        if (path === '/key' && req.method === 'POST') {
          const body = await readBody(req)
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          const key = (body?.key as string) ?? ''
          if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing key' })); return }
          const modifiers = (body?.modifiers as string[]) ?? []
          try {
            wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers } as Electron.KeyboardInputEvent)
            wc.sendInputEvent({ type: 'char', keyCode: key, modifiers } as Electron.KeyboardInputEvent)
            wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers } as Electron.KeyboardInputEvent)
            res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /hover — 鼠标悬浮到元素 { selector }
        if (path === '/hover' && req.method === 'POST') {
          const body = await readBody(req)
          const selector = (body?.selector as string) ?? ''
          if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const rect = await wc.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`
            )
            if (!rect) { res.writeHead(404); res.end(JSON.stringify({ error: 'Element not found' })); return }
            wc.sendInputEvent({ type: 'mouseMove', x: Math.round(rect.x), y: Math.round(rect.y) } as Electron.MouseInputEvent)
            res.writeHead(200); res.end(JSON.stringify({ ok: true, x: rect.x, y: rect.y }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /select — 设置 <select> 的值 { selector, value }
        if (path === '/select' && req.method === 'POST') {
          const body = await readBody(req)
          const { selector, value } = body as Record<string, unknown>
          if (!selector || value === undefined) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector or value' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const ok = await wc.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
            )
            res.writeHead(200); res.end(JSON.stringify({ ok: !!ok }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /check — 勾选/取消 checkbox { selector, checked? }
        if (path === '/check' && req.method === 'POST') {
          const body = await readBody(req)
          const { selector, checked } = body as Record<string, unknown>
          if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const result = await wc.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;el.checked=${checked === undefined ? '!el.checked' : !!checked};el.dispatchEvent(new Event('change',{bubbles:true}));return el.checked})()`
            )
            res.writeHead(200); res.end(JSON.stringify({ ok: result !== null, checked: result }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // GET /screenshot-element?selector= — 只截指定元素
        if (path === '/screenshot-element' && req.method === 'GET') {
          const selector = url.searchParams.get('selector')
          if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
          ensureBrowserVisible()
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const rect = await wc.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`
            )
            if (!rect || rect.width <= 0 || rect.height <= 0) { res.writeHead(404); res.end(JSON.stringify({ error: 'Element not found or zero size' })); return }
            await new Promise(r => setTimeout(r, 50))
            const full = await wc.capturePage()
            const quality = Math.max(10, Math.min(100, parseInt(url.searchParams.get('quality') ?? '80', 10)))
            // 裁剪到元素区域
            const cropped = full.crop({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
            const buf = cropped.toJPEG(quality)
            res.writeHead(200); res.end(JSON.stringify({
              format: 'jpeg', data: buf.toString('base64'),
              width: rect.width, height: rect.height, selector
            }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /screenshot-compare — 像素级对比两张 PNG，返回相似度和差异高亮图
        // 独立于浏览器状态，不需要浏览器打开
        if (path === '/screenshot-compare' && req.method === 'POST') {
          const body = await readBody(req)
          const b64A = (body?.imageA as string) ?? ''
          const b64B = (body?.imageB as string) ?? ''
          if (!b64A || !b64B) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Missing imageA or imageB' })); return
          }
          const threshold = Math.max(0, Math.min(255, Number(body?.threshold ?? 10)))
          try {
            const decodePNG = (b64: string): Promise<PNG> =>
              new Promise((resolve, reject) => {
                const buf = Buffer.from(b64, 'base64')
                const png = new PNG()
                png.parse(buf, (err, data) => err ? reject(err) : resolve(data))
              })

            const [imgA, imgB] = await Promise.all([decodePNG(b64A), decodePNG(b64B)])
            const cmpW = Math.min(imgA.width, imgB.width)
            const cmpH = Math.min(imgA.height, imgB.height)
            // 总像素用较大图的面积，缺失部分算 diff
            const maxW = Math.max(imgA.width, imgB.width)
            const maxH = Math.max(imgA.height, imgB.height)
            const totalPixels = maxW * maxH
            const missingPixels = totalPixels - cmpW * cmpH

            const diff = new PNG({ width: cmpW, height: cmpH })
            let rawDiffPixels = 0
            let weightedDiff = 0

            for (let y = 0; y < cmpH; y++) {
              for (let x = 0; x < cmpW; x++) {
                const i = (y * cmpW + x) * 4
                const iA = (y * imgA.width + x) * 4
                const iB = (y * imgB.width + x) * 4
                const rA = imgA.data[iA], gA = imgA.data[iA + 1], bA = imgA.data[iA + 2]
                const rB = imgB.data[iB], gB = imgB.data[iB + 1], bB = imgB.data[iB + 2]
                const dr = Math.abs(rA - rB)
                const dg = Math.abs(gA - gB)
                const db = Math.abs(bA - bB)
                // 判断是否是近似纯色背景像素（饱和度低、亮度高或低）
                const maxC = Math.max(rA, gA, bA)
                const minC = Math.min(rA, gA, bA)
                const isBg = (maxC - minC) < 20 // 低饱和度 ≈ 背景
                const weight = isBg ? 1 : 3    // 内容区差异权重 ×3
                if (dr + dg + db > threshold) {
                  rawDiffPixels++
                  weightedDiff += weight
                  diff.data[i] = 255; diff.data[i + 1] = 60; diff.data[i + 2] = 60; diff.data[i + 3] = 220
                } else {
                  weightedDiff += 0
                  diff.data[i] = rA; diff.data[i + 1] = gA; diff.data[i + 2] = bA
                  diff.data[i + 3] = Math.round(imgA.data[iA + 3] * 0.35)
                }
              }
            }

            // 加权总分：缺失部分按内容权重算（保守取 ×2）
            const weightedTotal = cmpW * cmpH * 1 + missingPixels * 2 + rawDiffPixels * 2
            const weightedScore = weightedDiff + missingPixels * 2
            const diffPercent = parseFloat(((weightedScore / weightedTotal) * 100).toFixed(2))
            const similarity = parseFloat((100 - diffPercent).toFixed(2))

            const diffBuf = await new Promise<Buffer>((resolve, reject) => {
              const chunks: Buffer[] = []
              diff.pack().on('data', (c: Buffer) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject)
            })

            res.writeHead(200); res.end(JSON.stringify({
              similarity,
              diffPercent,
              diffPixels: rawDiffPixels,
              missingPixels,
              totalPixels,
              diffImage: diffBuf.toString('base64'),
              width: cmpW,
              height: cmpH,
              sizeMatch: imgA.width === imgB.width && imgA.height === imgB.height
            }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // GET /cookies — 获取当前页面 cookies
        if (path === '/cookies' && req.method === 'GET') {
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const pageUrl = wc.getURL()
            const cookies = await wc.session.cookies.get({ url: pageUrl })
            res.writeHead(200); res.end(JSON.stringify({ cookies }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /wait-for — 等待元素出现 { selector, timeout? (ms, default 5000) }
        if (path === '/wait-for' && req.method === 'POST') {
          const body = await readBody(req)
          const selector = (body?.selector as string) ?? ''
          const timeout = Math.min(30000, Math.max(100, Number(body?.timeout) || 5000))
          if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const found = await wc.executeJavaScript(`
              new Promise((resolve) => {
                const el = document.querySelector(${JSON.stringify(selector)})
                if (el) { resolve(true); return }
                const ob = new MutationObserver(() => {
                  if (document.querySelector(${JSON.stringify(selector)})) { ob.disconnect(); resolve(true) }
                })
                ob.observe(document.body, { childList: true, subtree: true })
                setTimeout(() => { ob.disconnect(); resolve(false) }, ${timeout})
              })
            `)
            res.writeHead(200); res.end(JSON.stringify({ found: !!found, selector }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // GET /forms — 枚举页面所有表单字段
        if (path === '/forms' && req.method === 'GET') {
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const forms = await wc.executeJavaScript(`
              Array.from(document.forms).map((form, fi) => ({
                index: fi,
                id: form.id || null,
                name: form.name || null,
                action: form.action || null,
                method: form.method || 'get',
                fields: Array.from(form.elements).map(el => ({
                  tag: el.tagName.toLowerCase(),
                  type: el.type || null,
                  name: el.name || null,
                  id: el.id || null,
                  value: el.type === 'password' ? '***' : (el.value || null),
                  placeholder: el.placeholder || null,
                  required: !!el.required
                }))
              }))
            `)
            res.writeHead(200); res.end(JSON.stringify({ forms }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /drag — 模拟真人拖拽（贝塞尔曲线 + 随机抖动），适用于滑块等场景
        // body: { fromSelector?, toSelector?, fromX?, fromY?, toX?, toY?, steps?, durationMs? }
        if (path === '/drag' && req.method === 'POST') {
          const body = await readBody(req)
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            // 获取起终点坐标
            const getCenter = async (sel: string | undefined, fx: number | undefined, fy: number | undefined) => {
              if (sel) {
                const r = await wc.executeJavaScript(
                  `(function(){const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;const b=el.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}})()`
                )
                return r
              }
              return { x: fx ?? 0, y: fy ?? 0 }
            }
            const from = await getCenter(body?.fromSelector as string, Number(body?.fromX), Number(body?.fromY))
            const to   = await getCenter(body?.toSelector as string,   Number(body?.toX),   Number(body?.toY))
            if (!from || !to) { res.writeHead(404); res.end(JSON.stringify({ error: 'Element not found' })); return }

            const steps = Math.max(20, Math.min(200, Number(body?.steps) || 60))
            const durationMs = Math.max(200, Math.min(5000, Number(body?.durationMs) || 800))
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

            // 生成带随机抖动的贝塞尔曲线路径（模拟人手抖）
            const cx1 = from.x + (to.x - from.x) * 0.3 + (Math.random() - 0.5) * 30
            const cy1 = from.y + (Math.random() - 0.5) * 20
            const cx2 = from.x + (to.x - from.x) * 0.7 + (Math.random() - 0.5) * 20
            const cy2 = to.y + (Math.random() - 0.5) * 20

            const bezier = (t: number, p0: number, p1: number, p2: number, p3: number) =>
              Math.pow(1-t,3)*p0 + 3*Math.pow(1-t,2)*t*p1 + 3*(1-t)*t*t*p2 + Math.pow(t,3)*p3

            // mousedown at start
            wc.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x), y: Math.round(from.y) } as Electron.MouseInputEvent)
            await delay(30 + Math.random() * 40)
            wc.sendInputEvent({ type: 'mouseDown', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            await delay(40 + Math.random() * 30)

            // 沿贝塞尔曲线移动
            const stepDelay = durationMs / steps
            for (let i = 1; i <= steps; i++) {
              const t = i / steps
              // ease-in-out 速度曲线（慢→快→慢）
              const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t
              const x = bezier(eased, from.x, cx1, cx2, to.x) + (Math.random()-0.5)*2
              const y = bezier(eased, from.y, cy1, cy2, to.y) + (Math.random()-0.5)*1.5
              wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) } as Electron.MouseInputEvent)
              await delay(stepDelay * (0.8 + Math.random() * 0.4))
            }

            // mouseup at end
            await delay(30 + Math.random() * 30)
            wc.sendInputEvent({ type: 'mouseUp', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            res.writeHead(200); res.end(JSON.stringify({ ok: true, from, to, steps }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /click-human — 真实鼠标事件点击（非 JS click()，带 mousedown+up+随机延迟）
        if (path === '/click-human' && req.method === 'POST') {
          const body = await readBody(req)
          const selector = (body?.selector as string) ?? ''
          if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            const rect = await wc.executeJavaScript(
              `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`
            )
            if (!rect) { res.writeHead(404); res.end(JSON.stringify({ error: 'Element not found' })); return }
            const x = Math.round(rect.x + (Math.random()-0.5)*4)
            const y = Math.round(rect.y + (Math.random()-0.5)*4)
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
            wc.sendInputEvent({ type: 'mouseMove', x, y } as Electron.MouseInputEvent)
            await delay(30 + Math.random()*30)
            wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            await delay(60 + Math.random()*80)
            wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent)
            res.writeHead(200); res.end(JSON.stringify({ ok: true, x, y }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // POST /type-human — 逐字符模拟真人输入（随机间隔、先 focus）
        if (path === '/type-human' && req.method === 'POST') {
          const body = await readBody(req)
          const { selector, text, minDelay = 40, maxDelay = 140 } = body as Record<string, unknown>
          if (!selector || typeof text !== 'string') { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector or text' })); return }
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
          try {
            // 先 focus 元素
            await wc.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.focus()`)
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
            for (const ch of text as string) {
              wc.sendInputEvent({ type: 'keyDown', keyCode: ch } as Electron.KeyboardInputEvent)
              wc.sendInputEvent({ type: 'char', keyCode: ch } as Electron.KeyboardInputEvent)
              wc.sendInputEvent({ type: 'keyUp', keyCode: ch } as Electron.KeyboardInputEvent)
              const ms = Number(minDelay) + Math.random() * (Number(maxDelay) - Number(minDelay))
              // 偶尔短暂停顿（模拟思考）
              await delay(Math.random() < 0.05 ? ms * 4 : ms)
            }
            res.writeHead(200); res.end(JSON.stringify({ ok: true, length: (text as string).length }))
          } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
          return
        }

        // Clone-related routes delegated to cloneManager
        if (await handleCloneRoute(path, req, res, getBrowserViewWebContents, localServers)) return

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
