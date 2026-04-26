import { ipcMain, dialog, clipboard } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { resolve } from 'path'
import { IPC } from '../renderer/src/types/ipc'
import { DEFAULT_SETTINGS } from './settingsStore'
import type { PtyManager } from './ptyManager'
import type { FileSystemHandler } from './fileSystemHandler'
import type { HistoryStore } from './historyStore'
import type { SettingsStore } from './settingsStore'
import type { WorkspaceStore } from './workspaceStore'
import type { ClaudeSessionWatcher } from './claudeSessionWatcher'
import { ensureClaudeHudPluginDefaults } from './claudeSessionConfigDir'
import { listPlugins, setPluginEnabled, refreshMarketplaces } from './pluginManager'

/** [2026-04-23] 避免在 SESSION_CREATE 的 invoke 回调里同步跑 ensure（含 execSync/readdir），否则会长时间占满主线程、所有窗口一起卡死 */
let hudEnsureAfterSessionScheduled = false
function scheduleEnsureClaudeHudAfterSession(): void {
  if (hudEnsureAfterSessionScheduled) return
  hudEnsureAfterSessionScheduled = true
  setImmediate(() => {
    hudEnsureAfterSessionScheduled = false
    try {
      ensureClaudeHudPluginDefaults()
    } catch (e) {
      console.warn('[ipc] ensureClaudeHudPluginDefaults:', e)
    }
  })
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  fsHandler: FileSystemHandler,
  historyStore: HistoryStore,
  settingsStore: SettingsStore,
  workspaceStore: WorkspaceStore,
  sessionWatcher: ClaudeSessionWatcher
): void {
  /* [2026-04-24] 渲染层 xterm 对 Ctrl+V 有时拿不到剪贴板；sendSync + clipboard.readText 与系统一致 */
  ipcMain.on(IPC.CLIPBOARD_READ_TEXT_SYNC, (event) => {
    event.returnValue = clipboard.readText()
  })

  // ── Settings ─────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET, async () => settingsStore.get())
  ipcMain.handle(IPC.SETTINGS_SET, async (_e, settings) => {
    // Merge with defaults to sanitize — unknown/missing keys fall back to safe values
    const merged = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) }
    settingsStore.set(merged as ReturnType<typeof settingsStore.get>)
    return { success: true }
  })

  ipcMain.handle(IPC.WORKSPACE_SAVE, async (_e, workspace) => {
    workspaceStore.set(workspace ?? null)
    return { success: true }
  })

  ipcMain.handle(IPC.WORKSPACE_LOAD, async () => workspaceStore.get())

  // ── Session management ──────────────────────────────────────
  ipcMain.handle(IPC.SESSION_CREATE, async (_e, payload) => {
    const sessionId = uuidv4()
    // Resolve relative paths (e.g. '.') so the token watcher can locate the correct JSONL project dir
    const workdir = resolve(payload.workdir ?? '.')
    const resume = payload.resume ?? false
    const settings = settingsStore.get()
    // Read scrollback before creating session (file written by previous session's close)
    const scrollback = ptyManager.readScrollback(workdir)
    const result = ptyManager.createSession(sessionId, workdir, settings, resume)
    // Start watching JSONL for accurate per-session token counting
    sessionWatcher.watchSession(sessionId, workdir)
    // [2026-04-23] 原先此处同步调用 ensureClaudeHudPluginDefaults()，与上 scheduleEnsureClaudeHudAfterSession 注释所述一致，改为下一事件循环再执行
    // ensureClaudeHudPluginDefaults()
    scheduleEnsureClaudeHudAfterSession()
    return { sessionId, pid: result.pid, workdir, scrollback }
  })

  ipcMain.handle(IPC.SESSION_CLOSE, async (_e, { sessionId }) => {
    ptyManager.closeSession(sessionId)
    sessionWatcher.unwatchSession(sessionId)
    return { success: true }
  })

  // ── PTY I/O ─────────────────────────────────────────────────
  ipcMain.on(IPC.PTY_INPUT, (_e, payload) => {
    ptyManager.sendInput(payload.sessionId, payload.data)
  })

  ipcMain.on(IPC.PTY_RESIZE, (_e, payload) => {
    ptyManager.resize(payload.sessionId, payload.cols, payload.rows)
  })

  // ── Working directory ────────────────────────────────────────
  ipcMain.handle(IPC.WORKDIR_OPEN_DIALOG, async (e) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // [2026-04-23] 新增：渲染层比对「是否同一工作目录」须与主进程 resolve 规则一致，避免历史点击再建第二个 PTY/双 JSONL watcher
  ipcMain.handle(IPC.WORKDIR_RESOLVE_MANY, async (_e, payload: { paths: string[] }) => {
    const paths = Array.isArray(payload?.paths) ? payload.paths : []
    return paths.map((p) => resolve(typeof p === 'string' ? p : '.'))
  })

  // ── File system ──────────────────────────────────────────────
  ipcMain.handle(IPC.FS_READ_TREE, async (_e, payload) => {
    return fsHandler.readTree(payload.dirPath, payload.depth ?? 3)
  })

  // ── History ──────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_LIST, async () => historyStore.list())
  ipcMain.handle(IPC.HISTORY_SAVE, async (_e, { record }) => historyStore.save(record))
  ipcMain.handle(IPC.HISTORY_DELETE, async (_e, { id }) => historyStore.delete(id))
  ipcMain.handle(IPC.HISTORY_GET, async (_e, { id }) => historyStore.get(id))

  // ── Plugins ──────────────────────────────────────────────────
  ipcMain.handle(IPC.PLUGIN_LIST, async () => listPlugins())
  ipcMain.handle(IPC.PLUGIN_SET_ENABLED, async (_e, { id, enabled }: { id: string; enabled: boolean }) => {
    setPluginEnabled(id, enabled)
    return { success: true }
  })
  ipcMain.handle(IPC.PLUGIN_REFRESH, async () => {
    const { newPlugins, error } = refreshMarketplaces()
    const plugins = listPlugins(new Set(newPlugins))
    return { plugins, newPlugins, error }
  })

  // ── Window controls ──────────────────────────────────────────
  ipcMain.on(IPC.APP_MINIMIZE, (e) => {
    require('electron').BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on(IPC.APP_MAXIMIZE, (e) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.APP_CLOSE, (e) => {
    require('electron').BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
