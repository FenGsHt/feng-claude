import { ipcMain, dialog, clipboard, Notification } from 'electron'
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
import { getTokenData, setTokenData } from './tokenDataStore'
import { listMcpServers, addMcpServer, removeMcpServer, setMcpServerEnabled, updateMcpServer } from './mcpManager'
import type { McpServerConfig } from '../renderer/src/types/ipc'
import { listSkills, getSkillContent, saveSkill, deleteSkill, openSkillsDir } from './skillsManager'

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

  // ── MCP servers ───────────────────────────────────────────────
  ipcMain.handle(IPC.MCP_LIST, async () => listMcpServers())
  ipcMain.handle(IPC.MCP_ADD, async (_e, { name, cfg }: { name: string; cfg: McpServerConfig }) => {
    addMcpServer(name, cfg)
    return { success: true }
  })
  ipcMain.handle(IPC.MCP_REMOVE, async (_e, { name }: { name: string }) => {
    removeMcpServer(name)
    return { success: true }
  })
  ipcMain.handle(IPC.MCP_SET_ENABLED, async (_e, { name, enabled }: { name: string; enabled: boolean }) => {
    setMcpServerEnabled(name, enabled)
    return { success: true }
  })
  ipcMain.handle(IPC.MCP_UPDATE, async (_e, { name, cfg }: { name: string; cfg: McpServerConfig }) => {
    updateMcpServer(name, cfg)
    return { success: true }
  })

  // ── Skills ────────────────────────────────────────────────────
  ipcMain.handle(IPC.SKILLS_LIST, async () => listSkills())
  ipcMain.handle(IPC.SKILLS_GET, async (_e, { name }: { name: string }) => getSkillContent(name))
  ipcMain.handle(IPC.SKILLS_SAVE, async (_e, { name, content }: { name: string; content: string }) => {
    saveSkill(name, content)
    return { success: true }
  })
  ipcMain.handle(IPC.SKILLS_DELETE, async (_e, { name, isFolder }: { name: string; isFolder: boolean }) => {
    deleteSkill(name, isFolder)
    return { success: true }
  })
  ipcMain.handle(IPC.SKILLS_OPEN_DIR, async () => openSkillsDir())

  // ── Token data persistence ────────────────────────────────────
  ipcMain.handle(IPC.TOKEN_DATA_GET, async () => getTokenData())
  ipcMain.handle(IPC.TOKEN_DATA_SET, async (_e, data: unknown) => setTokenData(data))

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

  // ── Pet Agent ─────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_ASK, async (_e, payload) => {
    const { message, history, petConfig } = payload as {
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
      petConfig: { name: string; personality: string }
    }
    const settings = settingsStore.get()
    const apiKey = settings.authToken
    const rawBase = settings.baseUrl?.trim() || 'https://api.anthropic.com'
    const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

    if (!apiKey) return { error: 'No API key configured' }

    const systemPrompt = [
      petConfig.personality,
      `你的名字是 ${petConfig.name}。`,
      '你会伪装成刚上网搜索了最新技术动态，给出最前沿、最激进的建议。',
      '回答必须简短（3句以内），具体可执行，不废话。',
    ].join(' ')

    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: message },
    ]

    try {
      const model = settings.model || 'claude-haiku-4-5'
      const body = JSON.stringify({
        model,
        max_tokens: 400,
        system: systemPrompt,
        messages,
      })

      const url = new URL(`${baseUrl}/v1/messages`)
      const isHttps = url.protocol === 'https:'
      const { request } = isHttps ? await import('https') : await import('http')

      const text = await new Promise<string>((resolve, reject) => {
        const req = request(
          {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
          },
          (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.write(body)
        req.end()
      })

      const json = JSON.parse(text) as { content?: Array<{ text?: string }>; error?: { message?: string } }
      if (json.error) return { error: json.error.message ?? 'API error' }
      return { text: json.content?.[0]?.text ?? '' }
    } catch (e) {
      console.error('[pet:ask] error:', e)
      return { error: String(e) }
    }
  })

  // ── Notifications ────────────────────────────────────────────
  ipcMain.on(IPC.NOTIFICATION_SHOW, (_e, { title, body }) => {
    console.log('[notification] show:', title, body)
    if (!Notification.isSupported()) {
      console.warn('[notification] not supported on this platform')
      return
    }
    const notif = new Notification({ title, body, silent: false })
    notif.on('show', () => console.log('[notification] displayed'))
    notif.on('error', (err) => console.error('[notification] error:', err))
    notif.show()
  })
}
