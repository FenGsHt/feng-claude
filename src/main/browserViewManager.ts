import { BrowserWindow, ipcMain, screen, WebContentsView, WebPreferences, app } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { URL } from 'url'
import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { PNG } from 'pngjs'
import { readFileSync, writeFile, writeFileSync, mkdirSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { handleCloneRoute } from './cloneManager'
import * as routineMgr from './browserRoutineManager'

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

// ── [2026-06-12] 按 session 隔离的多 tab 调试浏览器 ──────────────────────────
// 每个终端 session 拥有自己的一组 tab，互不可见。state.view 是「当前前台 session
// 的 active tab」镜像，保持原有布局/拖拽/DevTools 逻辑几乎不变；后台 session 的
// tab view 仍存活，AI 可通过 CDP 截图/操作。
interface BrowserTab {
  id: string
  view: WebContentsView
  title: string
  consoleLogs: ConsoleLogEntry[]
}

interface SessionBrowser {
  sessionId: string
  tabs: BrowserTab[]
  activeTabId: string | null
}

const sessionBrowsers = new Map<string, SessionBrowser>()
// [2026-06-12] session → workdir 映射，供 routine HTTP 端点按请求 session 定位项目目录。
const sessionWorkdirs = new Map<string, string>()
export function registerSessionWorkdir(sessionId: string, workdir: string): void {
  if (sessionId && workdir) sessionWorkdirs.set(sessionId, workdir)
}
export function unregisterSessionWorkdir(sessionId: string): void {
  sessionWorkdirs.delete(sessionId)
}
/** 当前请求 session 的项目目录（routine 存取根）。 */
function currentWorkdir(): string | null {
  const sid = currentSessionId()
  return sid ? (sessionWorkdirs.get(sid) ?? null) : null
}
// 当前前台显示哪个 session 的浏览器（null = 无/旧单例兼容）
let foregroundSessionId: string | null = null
// title 变化防抖计时器（per session），避免页面快速更新 title 时 IPC 雪崩
const tabTitleDebounce = new Map<string, ReturnType<typeof setTimeout>>()
// 每个 HTTP 请求携带的 session id（来自 X-Feng-Session 头）
const requestSessionStore = new AsyncLocalStorage<string>()

/** 当前请求归属的 session id：优先请求头（非空），回退前台 session */
function currentSessionId(): string | null {
  const stored = requestSessionStore.getStore()
  return (stored && stored.length > 0) ? stored : foregroundSessionId
}

function ensureSessionBrowser(sid: string): SessionBrowser {
  let sb = sessionBrowsers.get(sid)
  if (!sb) {
    sb = { sessionId: sid, tabs: [], activeTabId: null }
    sessionBrowsers.set(sid, sb)
  }
  return sb
}

function getActiveTab(sid: string | null): BrowserTab | null {
  if (!sid) return null
  const sb = sessionBrowsers.get(sid)
  if (!sb || !sb.activeTabId) return null
  return sb.tabs.find(t => t.id === sb.activeTabId) ?? null
}

/** 当前请求/前台应操作的 webContents：前台 session 用 state.view（保留布局），
 *  后台 session 用其 active tab 的 view（仍存活、可 CDP 截图）。 */
function targetWebContents(): Electron.WebContents | null {
  const sid = currentSessionId()
  if (sid && sid !== foregroundSessionId) {
    return getActiveTab(sid)?.view.webContents ?? null
  }
  return state.view?.webContents ?? null
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
  writeFile(browserStateFile(), JSON.stringify({ lastUrl: url }), 'utf-8', () => {})
}
/** [2026-06-12] tab 增删/切换时持久化前台 active tab 的 URL（sessionId 为运行时 uuid，
 *  不做跨重启的 per-session tab 集恢复，仅保留「重开恢复上次页面」行为）。 */
function saveSessionTabs(): void {
  const active = getActiveTab(foregroundSessionId)
  const url = active?.view.webContents.getURL()
  if (url) saveLastBrowserUrl(url)
}

const DEFAULT_PORT = 3100
const TITLEBAR_H = 32
const NAVBAR_H = 60   // [2026-06-12] 两行：标签条(26) + 控制行(34)
const HISTORY_PANEL_H = 250  // 历史面板展开时覆盖在浏览器内容上方的高度
let historyPanelH = 0        // 0 = 关闭，HISTORY_PANEL_H = 打开
const ROUTINE_PANEL_H = 250  // Routine 回放面板展开高度
let routinePanelH = 0        // 0 = 关闭，ROUTINE_PANEL_H = 打开
const SAVE_BAR_H = 34        // 录制命名条高度
let saveBarH = 0             // 0 = 关闭，SAVE_BAR_H = 打开

// ── 浏览历史 ────────────────────────────────────────────────────────────────
interface HistoryEntry { url: string; title: string; ts: number }
const MAX_HISTORY = 100
let browserHistory: HistoryEntry[] = []

function browserHistoryFile(): string {
  return join(app.getPath('userData'), 'browser-history.json')
}
function loadBrowserHistory(): void {
  try {
    const data = JSON.parse(readFileSync(browserHistoryFile(), 'utf-8'))
    if (Array.isArray(data)) browserHistory = data.slice(0, MAX_HISTORY)
  } catch { /* first run */ }
}
function saveBrowserHistory(): void {
  writeFile(browserHistoryFile(), JSON.stringify(browserHistory), 'utf-8', () => {})
}
function addToHistory(url: string, title: string): void {
  if (!url || url.startsWith('data:') || url === 'about:blank') return
  const idx = browserHistory.findIndex(h => h.url === url)
  if (idx >= 0) browserHistory.splice(idx, 1)
  browserHistory.unshift({ url, title: title || url, ts: Date.now() })
  if (browserHistory.length > MAX_HISTORY) browserHistory.length = MAX_HISTORY
  saveBrowserHistory()
  pushHistoryToNav()
}
function pushHistoryToNav(): void {
  // 面板关着时不推送，节省 IPC
  if (!state.navView?.webContents || historyPanelH === 0) return
  state.navView.webContents.send('browser-nav:history', {
    items: browserHistory.slice(0, 60).map(h => ({ url: h.url, title: h.title, ts: h.ts }))
  })
}
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

  // 导航栏（历史面板/命名条打开时向下延伸覆盖浏览器内容，不挤压内容区）
  if (state.navView) {
    state.navView.setBounds({
      x: viewX,
      y: TITLEBAR_H,
      width: viewW,
      height: NAVBAR_H + historyPanelH + routinePanelH + saveBarH
    })
  }
}

function setSplitRatio(win: BrowserWindow, ratio: number): void {
  state.splitRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio))
  setBounds(win)
  if (state.navView?.webContents) {
    // ratio 真正变化时才通知 navView 更新拖拽手柄记录的值
    state.navView.webContents.send('browser-nav:ratio', { ratio: state.splitRatio })
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
  flex-direction: column;
  height: 100%;
  font-family: system-ui, sans-serif;
  user-select: none;
  border-left: 1px solid #333;
  overflow: hidden;   /* 面板过窄时不长出整页滚动条，由内部各行自行处理溢出 */
}
/* [2026-06-12] 标签条 */
#tab-strip {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 26px;
  flex: none;        /* 固定 26px，不被压缩，保证两行总高锁定在 60px */
  padding: 3px 6px 0 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
#tab-strip::-webkit-scrollbar { display: none; }
.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  min-width: 70px;
  padding: 2px 6px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-bottom: none;
  border-radius: 5px 5px 0 0;
  color: #999;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover { background: #222; color: #ccc; }
.tab.active { background: #2b2b2b; color: #fff; border-color: #3a3a3a; }
.tab .t-title { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.tab .t-close {
  flex: none; width: 14px; height: 14px; line-height: 13px; text-align: center;
  border-radius: 3px; font-size: 12px; color: #888;
}
.tab .t-close:hover { background: #444; color: #fff; }
#tab-new {
  flex: none; width: 24px; min-width: 24px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #aaa; font-size: 15px; cursor: pointer; margin-top: 1px;
}
/* 标签条右侧关闭按钮 */
#close-btn {
  flex: none; width: 24px; min-width: 24px; height: 22px;
  border: 1px solid #2a2a2a; border-radius: 5px; margin-top: 1px;
  font-size: 14px; color: #999;
}
#close-btn:hover { background: #c0392b; border-color: #c0392b; color: #fff; }
#tab-new:hover { background: #2a2a2a; color: #fff; }
/* 历史面板 */
#history-panel {
  display: none; flex-direction: column;
  position: absolute; top: 60px; left: 0; right: 0; height: 250px;
  background: #1a1a1a; border-left: 1px solid #333; border-bottom: 2px solid #3a3a3a;
  overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #444 transparent; z-index: 20;
}
#history-panel.open { display: flex; }
.h-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px; border-bottom: 1px solid #2a2a2a; flex: none;
  font-size: 11px; color: #888; background: #161616; position: sticky; top: 0; z-index: 1;
}
.h-scroll { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #444 transparent; }
.h-clear { background: none; border: 1px solid #333; color: #666; border-radius: 3px; padding: 1px 6px; font-size: 10px; cursor: pointer; height: auto; min-width: auto; }
.h-clear:hover { color: #e05252; border-color: #e05252; background: none; }
.h-empty { padding: 20px; color: #555; text-align: center; font-size: 12px; }
.h-group { padding: 4px 10px 2px; font-size: 10px; color: #555; letter-spacing: .04em; text-transform: uppercase; background: #161616; position: sticky; top: 0; z-index: 1; }
.h-item { padding: 4px 10px 3px; cursor: pointer; border-bottom: 1px solid #1e1e1e; }
.h-item:hover { background: #222; }
.h-row1 { display: flex; align-items: baseline; gap: 6px; }
.h-title { flex: 1; font-size: 12px; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-time  { flex: none; font-size: 10px; color: #555; white-space: nowrap; }
.h-url   { font-size: 10px; color: #444; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
/* Routine 回放面板（复用历史面板布局） */
#routine-panel {
  display: none; flex-direction: column;
  position: absolute; top: 60px; left: 0; right: 0; height: 250px;
  background: #1a1a1a; border-left: 1px solid #333; border-bottom: 2px solid #3a3a3a;
  overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #444 transparent; z-index: 20;
}
#routine-panel.open { display: flex; }
.r-item { padding: 5px 10px 4px; cursor: pointer; border-bottom: 1px solid #1e1e1e; }
.r-item:hover { background: #222; }
.r-row1 { display: flex; align-items: baseline; gap: 6px; }
.r-name { flex: 1; font-size: 12px; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-meta { flex: none; font-size: 10px; color: #555; white-space: nowrap; }
.r-params { font-size: 10px; color: #d08770; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
/* 控制行 */
#ctrl-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  flex: none;            /* 固定 34px 高，与标签条 26px 合计锁定 60px */
  height: 34px;
  min-width: 0;          /* 允许内部 url-input 收缩，而非撑大父级 */
  overflow-x: auto;      /* 极窄时横向滚动而非溢出整页 */
  overflow-y: hidden;
  scrollbar-width: none;
}
#ctrl-row::-webkit-scrollbar { display: none; }
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
  flex: none;            /* 按钮不被压缩，保持可点尺寸 */
  height: 24px;
}
button:hover { background: #2a2a2a; color: #fff; }
button:active { background: #333; }
button.active { color: #f59e0b; border-color: #f59e0b; }
#record-btn.recording { color: #ef4444; border-color: #ef4444; }
button:disabled { opacity: 0.3; cursor: default; }
/* 录制命名条（替代 window.prompt，Electron 不支持原生 prompt）。
   展开时撑高 navView，占控制行下方独立一行，不覆盖控制行。 */
#save-bar {
  display: none;
  position: absolute;
  left: 0; right: 0; top: 60px; height: 34px;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #1a1a1a;
  border-left: 1px solid #333;
  border-bottom: 1px solid #333;
  z-index: 30;
}
#save-bar.show { display: flex; }
#save-bar span { font-size: 12px; color: #ef4444; white-space: nowrap; }
#save-name {
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
#save-name:focus { border-color: #ef4444; }
#save-ok, #save-cancel { font-size: 12px; padding: 2px 10px; white-space: nowrap; }
#save-ok { color: #4ade80; border-color: #4ade80; }
#url-input {
  flex: 1 1 60px;   /* 可伸可缩，最低 60px，让按钮优先保有空间 */
  min-width: 60px;
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
/* 更多菜单（收纳历史/拾取/DevTools 等次要功能） */
#more-wrap { position: relative; flex: none; }
#more-menu {
  display: none;
  position: absolute; right: 0; top: 28px;
  min-width: 130px; padding: 4px;
  background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.5); z-index: 40;
}
#more-menu.open { display: block; }
.m-item {
  padding: 6px 10px; font-size: 12px; color: #ccc; border-radius: 4px;
  cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px;
}
.m-item:hover { background: #2d2d2d; color: #fff; }
.m-item.active { color: #f59e0b; }
#drag-handle {
  position: absolute;
  left: 0; top: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  z-index: 10;
}
#drag-handle:hover { background: #f59e0b66; }
#drag-handle.active { background: #f59e0b; }
.spacer { flex: 1; }
</style></head><body>
  <div id="drag-handle" title="拖拽调整宽度"></div>
  <div id="tab-strip">
    <button id="tab-new" title="新建标签页">+</button>
    <div class="spacer"></div>
    <button id="close-btn" title="关闭浏览器">×</button>
  </div>
  <div id="ctrl-row">
    <button id="back-btn" title="后退">◀</button>
    <button id="fwd-btn" title="前进">▶</button>
    <button id="reload-btn" title="刷新">⟳</button>
    <input id="url-input" type="text" placeholder="输入 URL 回车导航" />
    <button id="record-btn" title="录制操作（routine）">⏺</button>
    <button id="play-btn" title="回放 routine">▶</button>
    <div id="more-wrap">
      <button id="more-btn" title="更多">⋯</button>
      <div id="more-menu">
        <div class="m-item" id="m-history">⏱ 历史记录</div>
        <div class="m-item" id="m-pick">⊕ 拾取元素</div>
        <div class="m-item" id="m-devtools">⌘ DevTools</div>
      </div>
    </div>
  </div>
  <div id="save-bar">
    <span>保存 routine：</span>
    <input id="save-name" type="text" placeholder="输入名称回车保存" />
    <button id="save-ok" title="保存">保存</button>
    <button id="save-cancel" title="取消（保留录制）">取消</button>
  </div>
  <div id="history-panel"></div>
  <div id="routine-panel"></div>
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
  $('close-btn').addEventListener('click', () => ipcRenderer.send('browser-nav:action', 'close'))
  // 更多菜单：开关 + 三个次要功能项
  let moreOpen = false
  function toggleMore(force) {
    moreOpen = force !== undefined ? force : !moreOpen
    $('more-btn').classList.toggle('active', moreOpen)
    $('more-menu').classList.toggle('open', moreOpen)
  }
  $('more-btn').addEventListener('click', e => { e.stopPropagation(); toggleMore() })
  document.addEventListener('click', e => {
    if (moreOpen && !$('more-wrap').contains(e.target)) toggleMore(false)
  })
  $('m-history').addEventListener('click', () => { toggleMore(false); toggleHistory() })
  $('m-pick').addEventListener('click', () => { toggleMore(false); ipcRenderer.send('browser-nav:action', 'pick') })
  $('m-devtools').addEventListener('click', () => { toggleMore(false); ipcRenderer.send('browser-nav:action', 'devtools') })
  let recording = false
  function showSaveBar() {
    $('save-bar').classList.add('show')
    ipcRenderer.send('browser-nav:save-bar', { open: true })
    $('save-name').focus()
  }
  function hideSaveBar() {
    $('save-bar').classList.remove('show'); $('save-name').value = ''
    ipcRenderer.send('browser-nav:save-bar', { open: false })
  }
  function commitSave() {
    const name = $('save-name').value.trim()
    if (name) { ipcRenderer.send('browser-nav:record-stop', name); hideSaveBar() }
    else $('save-name').focus()
  }
  $('record-btn').addEventListener('click', () => {
    if (!recording) {
      ipcRenderer.send('browser-nav:record-start')
    } else {
      // Electron 不支持 window.prompt，用内联命名条命名后再 stop
      showSaveBar()
    }
  })
  $('save-ok').addEventListener('click', commitSave)
  $('save-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') commitSave()
    else if (e.key === 'Escape') hideSaveBar()
  })
  // 取消：放弃此次录制（清空录制态，按钮回到 ⏺）
  $('save-cancel').addEventListener('click', () => { ipcRenderer.send('browser-nav:record-cancel'); hideSaveBar() })
  ipcRenderer.on('browser-nav:recording', (_, d) => {
    recording = !!d.active
    const btn = $('record-btn')
    btn.classList.toggle('recording', recording)
    btn.textContent = recording ? ('⏹ ' + (d.count || 0)) : '⏺'
    btn.title = recording ? '停止并保存（已录 ' + (d.count||0) + ' 步）' : '录制操作（routine）'
    if (!recording) hideSaveBar()
  })
  // Routine 回放面板
  let routineOpen = false
  function toggleRoutine(force) {
    routineOpen = force !== undefined ? force : !routineOpen
    $('play-btn').classList.toggle('active', routineOpen)
    $('routine-panel').classList.toggle('open', routineOpen)
    ipcRenderer.send('browser-nav:routine-panel', { open: routineOpen })
  }
  $('play-btn').addEventListener('click', e => { e.stopPropagation(); toggleRoutine() })
  document.addEventListener('click', e => {
    if (routineOpen && !$('routine-panel').contains(e.target) && e.target !== $('play-btn')) toggleRoutine(false)
  })
  ipcRenderer.on('browser-nav:routines', (_, d) => {
    const panel = $('routine-panel')
    panel.innerHTML = ''
    const hdr = document.createElement('div'); hdr.className = 'h-header'
    hdr.appendChild(Object.assign(document.createElement('span'), { textContent: '回放 routine' }))
    panel.appendChild(hdr)
    const scroll = document.createElement('div'); scroll.className = 'h-scroll'
    panel.appendChild(scroll)
    const items = d.routines || []
    if (!items.length) {
      const em = document.createElement('div'); em.className = 'h-empty'; em.textContent = '本项目暂无录制的 routine'
      scroll.appendChild(em); return
    }
    for (const it of items) {
      const row = document.createElement('div'); row.className = 'r-item'
      const r1 = document.createElement('div'); r1.className = 'r-row1'
      const nm = document.createElement('span'); nm.className = 'r-name'; nm.textContent = it.name
      const meta = document.createElement('span'); meta.className = 'r-meta'; meta.textContent = (it.stepCount || 0) + ' 步'
      r1.appendChild(nm); r1.appendChild(meta)
      row.appendChild(r1)
      if (it.params && it.params.length) {
        const p = document.createElement('div'); p.className = 'r-params'; p.textContent = '参数: ' + it.params.join(', ')
        row.appendChild(p)
      }
      row.title = (it.params && it.params.length) ? '此 routine 含参数，手动回放将使用空值；带参回放请用 AI 调用' : '点击回放'
      row.addEventListener('click', () => { ipcRenderer.send('browser-nav:routine-run', it.name); toggleRoutine(false) })
      scroll.appendChild(row)
    }
  })
  $('tab-new').addEventListener('click', () => ipcRenderer.send('browser-nav:tab-new'))
  $('url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) ipcRenderer.send('browser-nav:navigate', v) }
  })
  ipcRenderer.on('browser-nav:url', (_, d) => { $('url-input').value = d.url })
  ipcRenderer.on('browser-nav:nav-state', (_, d) => { $('back-btn').disabled = !d.canGoBack; $('fwd-btn').disabled = !d.canGoForward })
  ipcRenderer.on('browser-nav:devtools', (_, d) => { $('m-devtools').classList.toggle('active', d.enabled) })
  ipcRenderer.on('browser-nav:ratio', (_, d) => { window.__currentRatio = d.ratio })
  ipcRenderer.on('browser-nav:pick-active', (_, d) => { $('m-pick').classList.toggle('active', d.active) })
  // [2026-06-12] 渲染标签条
  ipcRenderer.on('browser-nav:tabs', (_, d) => {
    const strip = $('tab-strip')
    const newBtn = $('tab-new')
    Array.from(strip.querySelectorAll('.tab')).forEach(el => el.remove())
    for (const t of (d.tabs || [])) {
      const tab = document.createElement('div')
      tab.className = 'tab' + (t.active ? ' active' : '')
      tab.title = t.title
      const title = document.createElement('span')
      title.className = 't-title'; title.textContent = t.title || 'New Tab'
      const close = document.createElement('span')
      close.className = 't-close'; close.textContent = '×'
      close.addEventListener('click', ev => { ev.stopPropagation(); ipcRenderer.send('browser-nav:tab-close', t.id) })
      tab.addEventListener('click', () => ipcRenderer.send('browser-nav:tab-select', t.id))
      tab.appendChild(title); tab.appendChild(close)
      strip.insertBefore(tab, newBtn)
    }
    // 单 tab 时隐藏标签条更简洁？保留显示以便随时 +。
  })
  // 历史面板（由更多菜单 m-history 触发）
  let histOpen = false
  function toggleHistory(force) {
    histOpen = force !== undefined ? force : !histOpen
    $('m-history').classList.toggle('active', histOpen)
    $('history-panel').classList.toggle('open', histOpen)
    ipcRenderer.send('browser-nav:history-panel', { open: histOpen })
  }
  document.addEventListener('click', e => {
    if (histOpen && !$('history-panel').contains(e.target) && !$('more-wrap').contains(e.target)) toggleHistory(false)
  })
  function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts), now = new Date()
    const hhmm = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
    const todayStr = now.toDateString()
    const yestStr = new Date(now - 86400000).toDateString()
    if (d.toDateString() === todayStr) return hhmm
    if (d.toDateString() === yestStr) return '昨天 ' + hhmm
    const days = Math.floor((now - d) / 86400000)
    if (days < 7) return '周' + '日一二三四五六'[d.getDay()] + ' ' + hhmm
    return (d.getMonth()+1) + '-' + d.getDate().toString().padStart(2,'0') + ' ' + hhmm
  }
  function getGroup(ts) {
    if (!ts) return '更早'
    const d = new Date(ts), now = new Date()
    if (d.toDateString() === now.toDateString()) return '今天'
    if (d.toDateString() === new Date(now - 86400000).toDateString()) return '昨天'
    return '更早'
  }
  ipcRenderer.on('browser-nav:history', (_, d) => {
    const panel = $('history-panel')
    panel.innerHTML = ''
    // 固定顶部标题 + 清除按钮
    const hdr = document.createElement('div'); hdr.className = 'h-header'
    const lbl = document.createElement('span'); lbl.textContent = '历史记录'
    const clr = document.createElement('button'); clr.className = 'h-clear'; clr.textContent = '清除全部'
    clr.addEventListener('click', e => { e.stopPropagation(); ipcRenderer.send('browser-nav:history-clear') })
    hdr.appendChild(lbl); hdr.appendChild(clr); panel.appendChild(hdr)
    const scroll = document.createElement('div'); scroll.className = 'h-scroll'
    panel.appendChild(scroll)
    const items = d.items || []
    if (!items.length) {
      const em = document.createElement('div'); em.className = 'h-empty'; em.textContent = '暂无历史记录'
      scroll.appendChild(em); return
    }
    let curGrp = null
    for (const item of items) {
      const grp = getGroup(item.ts)
      if (grp !== curGrp) {
        curGrp = grp
        const g = document.createElement('div'); g.className = 'h-group'; g.textContent = grp
        scroll.appendChild(g)
      }
      const row = document.createElement('div'); row.className = 'h-item'
      const r1 = document.createElement('div'); r1.className = 'h-row1'
      const t = document.createElement('span'); t.className = 'h-title'; t.textContent = item.title || item.url
      const tm = document.createElement('span'); tm.className = 'h-time'; tm.textContent = fmtTime(item.ts)
      r1.appendChild(t); r1.appendChild(tm)
      const u = document.createElement('div'); u.className = 'h-url'; u.textContent = item.url
      row.appendChild(r1); row.appendChild(u)
      row.addEventListener('click', () => { ipcRenderer.send('browser-nav:navigate', item.url); toggleHistory(false) })
      scroll.appendChild(row)
    }
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

/** [2026-06-12] 切换 tab/session 前，关掉旧 active tab 的内嵌 DevTools，避免遗留。 */
function closeActiveDevTools(): void {
  if (state.devToolsVisible && state.view) {
    try { state.view.webContents.closeDevTools() } catch { /* ignore */ }
    state.devToolsVisible = false
    if (state.navView?.webContents) {
      state.navView.webContents.send('browser-nav:devtools', { enabled: false })
    }
  }
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

/** [2026-06-12] 为某 session 创建一个 tab（独立 WebContentsView + 事件监听）。
 *  view 立即挂到窗口（backgroundThrottling:false，后台仍渲染以支持后台截图），
 *  z-order 由 raiseForegroundView 调整。 */
function createBrowserTab(sid: string, win: BrowserWindow): BrowserTab {
  const prefs: WebPreferences = {
    nodeIntegration: false,
    contextIsolation: true
  }
  const view = new WebContentsView({ webPreferences: prefs })
  // 新建 tab 默认为 active tab，立即关闭 throttle 使 capturePage 可用；
  // 切换为非 active 时由 selectTab 恢复 throttle（减少 GPU 开销）。
  view.webContents.setBackgroundThrottling(false)
  const tab: BrowserTab = { id: randomUUID(), view, title: '', consoleLogs: [] }

  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'q') {
      event.preventDefault()
      void startElementPicker()
    }
  })

  const isForegroundActive = (): boolean =>
    sid === foregroundSessionId && getActiveTab(sid)?.id === tab.id

  view.webContents.on('did-navigate', (_, navUrl) => {
    if (isForegroundActive()) { updateNavUrl(navUrl); updateNavBackForward(); saveLastBrowserUrl(navUrl) }
    addToHistory(navUrl, tab.title)
    // [2026-06-12] 录制中：记录导航并在新页面重注入 recorder（导航清空了注入脚本）
    if (routineMgr.isRecording(sid)) {
      routineMgr.recordNavigate(sid, navUrl)
      if (sid === foregroundSessionId) pushRecordingState(sid)
      view.webContents.executeJavaScript(routineMgr.RECORDER_JS).catch(() => {})
    }
  })
  view.webContents.on('did-navigate-in-page', (_, navUrl) => {
    if (isForegroundActive()) { updateNavUrl(navUrl); updateNavBackForward(); saveLastBrowserUrl(navUrl) }
    // 只有路径/query 变化才记录；纯 hash 跳转（锚点）不写历史
    const prevUrl = browserHistory[0]?.url ?? ''
    if (navUrl.split('#')[0] !== prevUrl.split('#')[0]) addToHistory(navUrl, tab.title)
  })
  view.webContents.on('page-title-updated', (_e, title) => {
    tab.title = title
    // 防抖：title 稳定后再同步历史（避免页面加载期间每帧写盘+IPC）
    const cur = view.webContents.getURL()
    const entry = browserHistory.find(h => h.url === cur)
    if (entry && entry.title !== title) {
      entry.title = title
      const debounceKey = `hist-title-${tab.id}`
      const existing = tabTitleDebounce.get(debounceKey)
      if (existing) clearTimeout(existing)
      tabTitleDebounce.set(debounceKey, setTimeout(() => {
        tabTitleDebounce.delete(debounceKey)
        saveBrowserHistory()
        pushHistoryToNav()
      }, 500))
    }
    if (sid === foregroundSessionId) {
      // 防抖：页面加载期间 title 可能快速变化，150ms 内只推一次 IPC
      const existing = tabTitleDebounce.get(sid)
      if (existing) clearTimeout(existing)
      tabTitleDebounce.set(sid, setTimeout(() => {
        tabTitleDebounce.delete(sid)
        pushTabsToNav(sid)
      }, 150))
    }
  })

  view.webContents.on('console-message', (_event: Electron.Event, level: number, message: string, _line: number, _sourceId: string) => {
    // [2026-06-12] 录制事件通道：带前缀的日志转给 routine 录制器，且不进 console buffer（不污染 /console）
    if (message.startsWith(routineMgr.WING_EVT_PREFIX)) {
      if (routineMgr.isRecording(sid)) {
        try {
          routineMgr.recordEvent(sid, JSON.parse(message.slice(routineMgr.WING_EVT_PREFIX.length)))
          if (sid === foregroundSessionId) pushRecordingState(sid)
        } catch { /* ignore */ }
      }
      return
    }
    const entry: ConsoleLogEntry = { level: levelToString(level), text: message, timestamp: new Date().toISOString() }
    tab.consoleLogs.push(entry)
    if (tab.consoleLogs.length > CONSOLE_BUFFER_MAX) tab.consoleLogs.shift()
    // 前台 active tab 同步写入全局 buffer（兼容 /console 端点）
    if (isForegroundActive()) {
      consoleLogs.push(entry)
      if (consoleLogs.length > CONSOLE_BUFFER_MAX) consoleLogs.shift()
    }
  })

  win.contentView.addChildView(view)
  // [2026-06-12] 给后台 tab 一个非零初始 bounds，使其合成器持续出帧，
  // 后台 capturePage / CDP 截图才不为空白。前台 active tab 由 setBounds 覆盖。
  view.setBounds(computeContentBounds(win))
  return tab
}

/** 计算浏览器内容区 bounds（不含 DevTools 分栏，给后台 tab 用）。 */
function computeContentBounds(win: BrowserWindow): { x: number; y: number; width: number; height: number } {
  const bounds = win.getContentBounds()
  const effectiveWidth = bounds.width - state.toolsPanelWidth
  const viewW = Math.round(effectiveWidth * state.splitRatio)
  const viewX = effectiveWidth - viewW
  const contentY = TITLEBAR_H + NAVBAR_H
  return { x: viewX, y: contentY, width: Math.max(1, viewW), height: Math.max(1, bounds.height - contentY) }
}

/** 窗口 resize/maximize 时同步所有后台 tab view 的 bounds，
 *  防止它们保留旧尺寸/位置从前台 view 边缘漏出来覆盖终端区域。 */
function syncAllBackgroundBounds(win: BrowserWindow): void {
  const b = computeContentBounds(win)
  for (const sb of sessionBrowsers.values()) {
    for (const tab of sb.tabs) {
      if (tab.view !== state.view) {
        try { tab.view.setBounds(b) } catch { /* ignore */ }
      }
    }
  }
}

/** 把前台 session 的 active tab 提到内容层顶部，navView 再提到最顶。
 *  其余 tab view 仍挂载但被遮挡（保持渲染）。 */
function raiseForegroundView(win: BrowserWindow): void {
  const active = getActiveTab(foregroundSessionId)
  if (active) {
    state.view = active.view
    win.contentView.addChildView(active.view)  // 重新 add = 提到顶层
  }
  if (state.devToolsVisible && state.devToolsSeparatorView && state.devToolsView) {
    win.contentView.addChildView(state.devToolsSeparatorView)
    win.contentView.addChildView(state.devToolsView)
  }
  if (state.navView) win.contentView.addChildView(state.navView)
}

/** 创建或显示浏览器面板 */
export function showBrowserView(win: BrowserWindow, url?: string): void {
  revealMainWindow(win)

  // 目标 session：HTTP 请求带的 session 优先，否则前台/默认单例 key
  const sid = currentSessionId() ?? foregroundSessionId ?? '__default__'
  const sb = ensureSessionBrowser(sid)

  // 共享导航栏（单例，只显示前台 session）
  if (!state.navView) {
    state.navView = createNavView()
    win.contentView.addChildView(state.navView)
  }
  if (!state.resizeHandler) {
    let resizeDeferPending = false
    state.resizeHandler = () => {
      setBounds(win)  // 立即更新前台 view 坐标，保证视觉跟手
      if (!resizeDeferPending) {
        resizeDeferPending = true
        setImmediate(() => {
          resizeDeferPending = false
          syncAllBackgroundBounds(win)  // 后台 tab bounds 合并更新
          notifyBrowserState()          // 通知 renderer 宽度变化
        })
      }
    }
    win.on('resize', state.resizeHandler)
    win.on('maximize', state.resizeHandler)
    win.on('unmaximize', state.resizeHandler)
  }
  state.mainWin = win

  // 该 session 还没有 tab → 建首个 tab
  if (sb.tabs.length === 0) {
    // 只有这是应用启动后首次打开调试浏览器（其他 session 尚无 tab）时，才恢复上次 URL；
    // 其余情况新 session 独立开始，避免继承上一个 session 的页面。
    const hasOtherTabs = Array.from(sessionBrowsers.values()).some(s => s !== sb && s.tabs.length > 0)
    const tab = createBrowserTab(sid, win)
    sb.tabs.push(tab)
    sb.activeTabId = tab.id
    const initial = url || (hasOtherTabs ? '' : loadLastBrowserUrl()) || 'https://www.bing.com'
    tab.view.webContents.loadURL(initial).catch(() => {})
  } else if (url) {
    const active = getActiveTab(sid)
    active?.view.webContents.loadURL(url).catch(() => {})
  }

  // 把该 session 设为前台并置顶
  foregroundSessionId = sid
  state.view = getActiveTab(sid)?.view ?? null
  setBounds(win)
  raiseForegroundView(win)
  pushTabsToNav(sid)
  updateNavUrl(state.view?.webContents.getURL() ?? '')
  updateNavBackForward()
  // navView 首次显示时推送一次当前比例（setBounds 中已不再发 ratio IPC）
  if (state.navView?.webContents) {
    state.navView.webContents.send('browser-nav:ratio', { ratio: state.splitRatio })
  }

  state.visible = true
  notifyBrowserState()
}

/** 把某 session 的 tab 列表推送到导航栏（标签条 UI 用，阶段 B 接入）。 */
function pushTabsToNav(sid: string): void {
  if (!state.navView?.webContents) return
  const sb = sessionBrowsers.get(sid)
  if (!sb) return
  const tabs = sb.tabs.map(t => ({
    id: t.id,
    title: t.title || t.view.webContents.getURL().replace(/^https?:\/\//, '').slice(0, 30) || 'New Tab',
    active: t.id === sb.activeTabId
  }))
  state.navView.webContents.send('browser-nav:tabs', { tabs })
}

// ── [2026-06-12] tab 管理（用户标签条 + MCP tab 工具共用）─────────────────

/** 在某 session 新建 tab 并切为 active。返回新 tab id。 */
function openTab(sid: string, url?: string): string | null {
  if (!state.mainWin) return null
  const sb = ensureSessionBrowser(sid)
  const tab = createBrowserTab(sid, state.mainWin)
  sb.tabs.push(tab)
  sb.activeTabId = tab.id
  tab.view.webContents.loadURL(url || 'https://www.bing.com').catch(() => {})
  if (sid === foregroundSessionId) {
    state.view = tab.view
    setBounds(state.mainWin)
    raiseForegroundView(state.mainWin)
    pushTabsToNav(sid)
  }
  saveSessionTabs()
  return tab.id
}

/** 切换某 session 的 active tab。 */
function selectTab(sid: string, tabId: string): boolean {
  const sb = sessionBrowsers.get(sid)
  if (!sb) return false
  const tab = sb.tabs.find(t => t.id === tabId)
  if (!tab) return false
  if (sid === foregroundSessionId) closeActiveDevTools()
  // 旧 active tab 恢复 throttle（不再需要保持合成器），新 active tab 关闭 throttle
  const oldTab = sb.tabs.find(t => t.id === sb.activeTabId)
  if (oldTab && oldTab.id !== tabId) oldTab.view.webContents.setBackgroundThrottling(true)
  tab.view.webContents.setBackgroundThrottling(false)
  sb.activeTabId = tabId
  if (sid === foregroundSessionId && state.mainWin) {
    state.view = tab.view
    setBounds(state.mainWin)
    raiseForegroundView(state.mainWin)
    pushTabsToNav(sid)
    updateNavUrl(tab.view.webContents.getURL())
    updateNavBackForward()
  }
  saveSessionTabs()
  return true
}

/** 关闭某 session 的一个 tab；若关的是 active，则切到相邻 tab。最后一个 tab 不关（保留空浏览器）。 */
function closeTab(sid: string, tabId: string): boolean {
  const sb = sessionBrowsers.get(sid)
  if (!sb) return false
  const idx = sb.tabs.findIndex(t => t.id === tabId)
  if (idx < 0) return false
  const [removed] = sb.tabs.splice(idx, 1)
  try { state.mainWin?.contentView.removeChildView(removed.view) } catch { /* ignore */ }
  try { (removed.view.webContents as Electron.WebContents).close() } catch { /* ignore */ }
  if (sb.activeTabId === tabId) {
    const next = sb.tabs[idx] ?? sb.tabs[idx - 1] ?? null
    sb.activeTabId = next?.id ?? null
    if (sid === foregroundSessionId && state.mainWin) {
      state.view = next?.view ?? null
      if (next) { setBounds(state.mainWin); raiseForegroundView(state.mainWin) }
      updateNavUrl(next?.view.webContents.getURL() ?? '')
      updateNavBackForward()
    }
  }
  if (sid === foregroundSessionId) pushTabsToNav(sid)
  saveSessionTabs()
  return true
}

/** 列出某 session 的 tab（供 MCP browser_tab_list）。 */
function listTabs(sid: string): { id: string; title: string; url: string; active: boolean }[] {
  const sb = sessionBrowsers.get(sid)
  if (!sb) return []
  return sb.tabs.map(t => ({
    id: t.id,
    title: t.title || '',
    url: t.view.webContents.getURL(),
    active: t.id === sb.activeTabId
  }))
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
  if (!state.mainWin) return
  // [2026-06-12] 移除所有 session 所有 tab 的 view（WebContents 仍存活，重新 show 时 re-add）
  for (const sb of sessionBrowsers.values()) {
    for (const tab of sb.tabs) {
      try { state.mainWin.contentView.removeChildView(tab.view) } catch { /* ignore */ }
    }
  }
  if (state.navView) {
    state.mainWin.contentView.removeChildView(state.navView)
  }
  // [2026-04-30] 清理 DevTools 相关视图
  if (state.devToolsVisible) {
    state.view?.webContents.closeDevTools()
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
  // [2026-06-12] 按 session 路由：后台 session 返回其 active tab 的 view（仍存活），
  // 前台/旧单例返回 state.view —— 64 处 HTTP handler 调用点无需改动。
  return targetWebContents()
}

/** [2026-06-12] 向某 session 的 active tab 注入 recorder 脚本。 */
function injectRecorder(sid: string): void {
  const wc = getActiveTab(sid)?.view.webContents
  if (wc) wc.executeJavaScript(routineMgr.RECORDER_JS).catch(() => {})
}

/** [2026-06-12] 把前台 session 录制态推给导航栏（按钮红点 + 步数）。 */
function pushRecordingState(sid: string): void {
  if (!state.navView?.webContents) return
  state.navView.webContents.send('browser-nav:recording', {
    active: routineMgr.isRecording(sid),
    count: routineMgr.recordingStepCount(sid)
  })
}

/** [2026-06-13] 把本项目的 routine 列表推给导航栏（回放面板用）。 */
function pushRoutinesToNav(): void {
  if (!state.navView?.webContents) return
  const wd = foregroundSessionId ? sessionWorkdirs.get(foregroundSessionId) : null
  state.navView.webContents.send('browser-nav:routines', {
    routines: wd ? routineMgr.listRoutines(wd) : []
  })
}

function ensureBrowserVisible(): boolean {
  if (!state.mainWin) return false
  const sid = currentSessionId()
  // [2026-06-12] 后台 session 调用：不抢前台，只确保该 session 有 active tab（仍可 CDP/capturePage）
  if (sid && sid !== foregroundSessionId && foregroundSessionId !== null) {
    const sb = ensureSessionBrowser(sid)
    if (sb.tabs.length === 0) {
      const tab = createBrowserTab(sid, state.mainWin)
      sb.tabs.push(tab)
      sb.activeTabId = tab.id
      tab.view.webContents.loadURL('https://www.bing.com').catch(() => {})
    }
    return Boolean(getActiveTab(sid)?.view.webContents)
  }
  if (state.visible && state.view?.webContents) return true
  /* [2026-04-30] 允许 Claude Code 直接调用 browser_navigate/browser_screenshot 拉起内置浏览器，
   * 不再要求用户或模型先显式调用 browser_show。 */
  showBrowserView(state.mainWin)
  return Boolean(state.visible && state.view?.webContents)
}

export async function navigateTo(url: string): Promise<{ success: boolean; url: string }> {
  if (!ensureBrowserVisible()) {
    return { success: false, url: '' }
  }
  // [2026-06-12] 路由到请求 session 的 active tab（后台 session 不抢前台）
  const wc = targetWebContents()
  if (!wc) return { success: false, url: '' }
  let target = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    target = 'https://' + url
  }
  try {
    await wc.loadURL(target)
    return { success: true, url: wc.getURL() }
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

// ── [2026-06-12] 前台 session 切换 + 生命周期 ────────────────────────────

/** 切换前台显示的 session：把目标 session 的 active tab 提到顶层，刷新导航栏。
 *  若该 session 还没有浏览器（从未打开过），仅记录前台 id；面板保持当前内容直到它打开。 */
export function setForegroundSession(sessionId: string): void {
  if (!sessionId || sessionId === foregroundSessionId) return
  closeActiveDevTools()  // 关掉旧 session active tab 的 DevTools
  foregroundSessionId = sessionId
  if (!state.visible || !state.mainWin) return
  const sb = sessionBrowsers.get(sessionId)
  if (!sb || sb.tabs.length === 0) {
    // 该 session 尚无 tab：保持面板可见但内容为空——这里直接为其建首个 tab，体验更顺
    showBrowserView(state.mainWin)
    return
  }
  // 重新挂载该 session 所有 tab（hide 时可能被移除），再置顶 active
  for (const tab of sb.tabs) {
    try { state.mainWin.contentView.addChildView(tab.view) } catch { /* ignore */ }
  }
  state.view = getActiveTab(sessionId)?.view ?? null
  setBounds(state.mainWin)
  raiseForegroundView(state.mainWin)
  pushTabsToNav(sessionId)
  updateNavUrl(state.view?.webContents.getURL() ?? '')
  updateNavBackForward()
  notifyBrowserState()
  pushRecordingState(sessionId)
}

/** 销毁某 session 的全部 tab（终端关闭时调用），释放内存。 */
export function destroySessionBrowser(sessionId: string): void {
  const sb = sessionBrowsers.get(sessionId)
  if (!sb) return
  for (const tab of sb.tabs) {
    try { state.mainWin?.contentView.removeChildView(tab.view) } catch { /* ignore */ }
    try { (tab.view.webContents as Electron.WebContents).close() } catch { /* ignore */ }
  }
  sessionBrowsers.delete(sessionId)
  unregisterSessionWorkdir(sessionId)
  if (foregroundSessionId === sessionId) {
    foregroundSessionId = null
    state.view = null
  }
}

// ─ IPC ────────────────────────────────────────────────────────────────

export function registerBrowserViewIpc(): void {
  loadBrowserHistory()

  ipcMain.on('browser-view:set-active-session', (_event, sessionId: string) => {
    setForegroundSession(sessionId)
  })
  ipcMain.on('browser-view:destroy-session', (_event, sessionId: string) => {
    destroySessionBrowser(sessionId)
  })

  // [2026-06-12] 导航栏标签条操作（作用于前台 session）
  ipcMain.on('browser-nav:tab-new', () => {
    if (foregroundSessionId) openTab(foregroundSessionId)
  })
  ipcMain.on('browser-nav:tab-select', (_event, tabId: string) => {
    if (foregroundSessionId) selectTab(foregroundSessionId, tabId)
  })
  ipcMain.on('browser-nav:tab-close', (_event, tabId: string) => {
    if (foregroundSessionId) closeTab(foregroundSessionId, tabId)
  })

  // 历史面板开/关：调整 navView 高度（overlay，不挤内容区）
  ipcMain.on('browser-nav:history-panel', (_event, { open }: { open: boolean }) => {
    historyPanelH = open ? HISTORY_PANEL_H : 0
    if (state.mainWin) setBounds(state.mainWin)
    if (open) pushHistoryToNav()
  })
  ipcMain.on('browser-nav:history-clear', () => {
    browserHistory = []
    saveBrowserHistory()
    pushHistoryToNav()
  })

  // 录制命名条开/关：撑高 navView 占独立一行
  ipcMain.on('browser-nav:save-bar', (_event, { open }: { open: boolean }) => {
    saveBarH = open ? SAVE_BAR_H : 0
    if (state.mainWin) setBounds(state.mainWin)
  })

  // Routine 回放面板：开面板时推送本项目 routine 列表
  ipcMain.on('browser-nav:routine-panel', (_event, { open }: { open: boolean }) => {
    routinePanelH = open ? ROUTINE_PANEL_H : 0
    if (state.mainWin) setBounds(state.mainWin)
    if (open) pushRoutinesToNav()
  })
  // 手动回放（用户从面板点击）：作用于前台 session 的 active tab，无参数
  ipcMain.on('browser-nav:routine-run', (_event, name: string) => {
    if (!foregroundSessionId || !name) return
    const wd = sessionWorkdirs.get(foregroundSessionId)
    const wc = getActiveTab(foregroundSessionId)?.view.webContents
    if (wd && wc) void routineMgr.runRoutine(wc, wd, name, {})
  })

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
  ipcMain.on('browser-nav:record-start', () => {
    if (!foregroundSessionId) return
    const wc = getActiveTab(foregroundSessionId)?.view.webContents
    routineMgr.startRecording(foregroundSessionId, wc?.getURL())
    injectRecorder(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
  })
  ipcMain.on('browser-nav:record-stop', (_event, name: string) => {
    if (!foregroundSessionId) return
    const wd = sessionWorkdirs.get(foregroundSessionId)
    if (wd && name) routineMgr.stopRecording(foregroundSessionId, wd, name)
    else routineMgr.cancelRecording(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
  })
  ipcMain.on('browser-nav:record-cancel', () => {
    if (!foregroundSessionId) return
    routineMgr.cancelRecording(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
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
    browserHttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      // [2026-06-12] 读取 X-Feng-Session 头，在整个请求处理期间携带 session id，
      // 使 getBrowserViewWebContents() 等按 session 路由到对应的调试浏览器。
      const sidHeader = req.headers['x-feng-session']
      const reqSid = (Array.isArray(sidHeader) ? sidHeader[0] : sidHeader) || ''
      void requestSessionStore.run(reqSid || (foregroundSessionId ?? ''), async () => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')

      try {
        const url = new URL(req.url ?? '/', `http://localhost:${DEFAULT_PORT}`)
        const path = url.pathname

        if (path === '/health') {
          res.writeHead(200); res.end(JSON.stringify({ status: 'ok' }))
          return
        }

        // ── [2026-06-12] 多 tab 管理（按请求 session 隔离）──────────────────
        if (path === '/tabs' && req.method === 'GET') {
          const sid = currentSessionId()
          if (!sid) { res.writeHead(200); res.end(JSON.stringify({ tabs: [] })); return }
          res.writeHead(200); res.end(JSON.stringify({ tabs: listTabs(sid) }))
          return
        }
        if (path === '/tabs/new' && req.method === 'POST') {
          const body = await readBody(req)
          ensureBrowserVisible()
          const sid = currentSessionId()
          if (!sid) { res.writeHead(400); res.end(JSON.stringify({ error: 'No session' })); return }
          const id = openTab(sid, (body?.url as string) || undefined)
          if (!id) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to open tab' })); return }
          res.writeHead(200); res.end(JSON.stringify({ tabId: id, tabs: listTabs(sid) }))
          return
        }
        if (path === '/tabs/select' && req.method === 'POST') {
          const body = await readBody(req)
          const sid = currentSessionId()
          const tabId = (body?.tabId as string) ?? ''
          if (!sid || !tabId) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing session or tabId' })); return }
          const ok = selectTab(sid, tabId)
          res.writeHead(ok ? 200 : 404); res.end(JSON.stringify(ok ? { ok: true, tabs: listTabs(sid) } : { error: 'Tab not found' }))
          return
        }
        if (path === '/tabs/close' && req.method === 'POST') {
          const body = await readBody(req)
          const sid = currentSessionId()
          const tabId = (body?.tabId as string) ?? ''
          if (!sid || !tabId) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing session or tabId' })); return }
          const ok = closeTab(sid, tabId)
          res.writeHead(ok ? 200 : 404); res.end(JSON.stringify(ok ? { ok: true, tabs: listTabs(sid) } : { error: 'Tab not found' }))
          return
        }

        // ── [2026-06-12] Routine 录制/回放（按请求 session 隔离，存项目目录）──
        if (path === '/routine/list' && req.method === 'GET') {
          const wd = currentWorkdir()
          if (!wd) { res.writeHead(200); res.end(JSON.stringify({ routines: [] })); return }
          res.writeHead(200); res.end(JSON.stringify({ routines: routineMgr.listRoutines(wd) }))
          return
        }
        if (path === '/routine/delete' && req.method === 'POST') {
          const body = await readBody(req)
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!wd || !name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing workdir or name' })); return }
          const ok = routineMgr.deleteRoutine(wd, name)
          res.writeHead(ok ? 200 : 404); res.end(JSON.stringify(ok ? { ok: true } : { error: 'Routine not found' }))
          return
        }
        if (path === '/routine/run' && req.method === 'POST') {
          const body = await readBody(req)
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!wd || !name) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Missing workdir or name' })); return }
          ensureBrowserVisible()
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Browser not open' })); return }
          const params = (body?.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {}
          const result = await routineMgr.runRoutine(wc, wd, name, params)
          res.writeHead(result.ok ? 200 : 500); res.end(JSON.stringify(result))
          return
        }
        if (path === '/routine/record/start' && req.method === 'POST') {
          ensureBrowserVisible()
          const sid = currentSessionId()
          if (!sid) { res.writeHead(400); res.end(JSON.stringify({ error: 'No session' })); return }
          const wc = getActiveTab(sid)?.view.webContents
          routineMgr.startRecording(sid, wc?.getURL())
          injectRecorder(sid)
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }
        if (path === '/routine/record/stop' && req.method === 'POST') {
          const body = await readBody(req)
          const sid = currentSessionId()
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!sid || !wd || !name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing session/workdir/name' })); return }
          const result = routineMgr.stopRecording(sid, wd, name)
          if (!result) { res.writeHead(400); res.end(JSON.stringify({ error: 'Not recording' })); return }
          res.writeHead(200); res.end(JSON.stringify({ ok: true, ...result }))
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
          // [2026-06-12] 优先返回请求 session 的 active tab 日志，回退全局 buffer
          const activeTab = getActiveTab(currentSessionId())
          const buf = activeTab ? activeTab.consoleLogs : consoleLogs
          const entries = [...buf]
          if (doClear) { buf.length = 0 }
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
      }) // end requestSessionStore.run
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
