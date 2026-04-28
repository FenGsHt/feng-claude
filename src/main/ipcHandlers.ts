import { ipcMain, dialog, clipboard, Notification, app, BrowserWindow } from 'electron'
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
import { checkForUpdates, downloadUpdate, installUpdate } from './autoUpdater'
import { PetLogStore } from './petLogStore'

const petLogStore = new PetLogStore()

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

function broadcastSettingsChanged(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC.SETTINGS_CHANGED)
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
    broadcastSettingsChanged()
    return { success: true }
  })

  // ── API Profile 管理 [2026-04-28] ───────────────────────────────────
  ipcMain.handle(IPC.PROFILE_ADD, async (_e, payload) => {
    const { profile } = payload as { profile: import('../renderer/src/types/settings').ApiProfile }
    settingsStore.addProfile(profile)
    broadcastSettingsChanged()
    return { success: true, profile }
  })

  ipcMain.handle(IPC.PROFILE_UPDATE, async (_e, payload) => {
    const { profileId, updates } = payload as { profileId: string; updates: Partial<import('../renderer/src/types/settings').ApiProfile> }
    settingsStore.updateProfile(profileId, updates)
    broadcastSettingsChanged()
    return { success: true }
  })

  ipcMain.handle(IPC.PROFILE_DELETE, async (_e, payload) => {
    const { profileId } = payload as { profileId: string }
    const result = settingsStore.deleteProfile(profileId)
    broadcastSettingsChanged()
    return result
  })

  ipcMain.handle(IPC.PROFILE_SET_ACTIVE, async (_e, payload) => {
    const { profileId } = payload as { profileId: string }
    const result = settingsStore.setActiveProfile(profileId)
    broadcastSettingsChanged()
    return result
  })

  ipcMain.handle(IPC.PROFILE_GET_ACTIVE, async () => {
    return { profile: settingsStore.getActiveProfile() }
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
    const profileId = payload.profileId as string | undefined
    const settings = settingsStore.get()

    // [2026-04-28] 获取指定的 profile 或使用全局激活的
    const profile = profileId
      ? settings.profiles.find(p => p.id === profileId) ?? settingsStore.getActiveProfile()
      : settingsStore.getActiveProfile()

    // Read scrollback before creating session (file written by previous session's close)
    const scrollback = ptyManager.readScrollback(workdir)
    const result = ptyManager.createSession(sessionId, workdir, profile, settings, resume)
    // Start watching JSONL for accurate per-session token counting
    sessionWatcher.watchSession(sessionId, workdir)
    // [2026-04-23] 原先此处同步调用 ensureClaudeHudPluginDefaults()，与上 scheduleEnsureClaudeHudAfterSession 注释所述一致，改为下一事件循环再执行
    // ensureClaudeHudPluginDefaults()
    scheduleEnsureClaudeHudAfterSession()
    return { sessionId, pid: result.pid, workdir, scrollback, profileId: profile.id }
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
  ipcMain.handle(IPC.APP_GET_VERSION, async () => {
    return app.getVersion()
  })

  // ── Pet Agent ─────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_ASK, async (_e, payload) => {
    const { message, history, petConfig, triggerType } = payload as {
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
      petConfig: { name: string; personality: string; type?: string }
      triggerType?: 'auto' | 'manual' | 'pet' | 'content-bank'
    }
    // [2026-04-28] 使用激活 profile 的 API 配置
    const activeProfile = settingsStore.getActiveProfile()
    const apiKey = activeProfile.authToken
    const rawBase = activeProfile.baseUrl?.trim() || 'https://api.anthropic.com'
    const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

    if (!apiKey) {
      return { error: 'No API key configured' }
    }

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

    // 宠物用 haiku 模型，速度快费用低
    const model = activeProfile.haikuModel?.trim() || activeProfile.model?.trim() || 'claude-haiku-4-5'

    try {
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

      const json = JSON.parse(text) as {
        content?: Array<{ text?: string }>
        usage?: {
          input_tokens: number
          output_tokens: number
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
        }
        error?: { message?: string }
      }
      if (json.error) {
        return { error: json.error.message ?? 'API error' }
      }

      const replyText = json.content?.[0]?.text ?? ''

      // 保存宠物日志
      petLogStore.add({
        id: uuidv4(),
        timestamp: Date.now(),
        userMessage: message,
        assistantMessage: replyText,
        petName: petConfig.name,
        petType: petConfig.type ?? 'cat',
        triggerType: triggerType ?? 'auto',
      })

      return {
        text: replyText,
        usage: json.usage ? {
          input: json.usage.input_tokens,
          output: json.usage.output_tokens,
          cacheCreate: json.usage.cache_creation_input_tokens ?? 0,
          cacheRead: json.usage.cache_read_input_tokens ?? 0,
        } : undefined,
      }
    } catch (e) {
      console.error('[pet:ask] error:', e)
      return { error: String(e) }
    }
  })

  // ── Pet Logs ──────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_LOG_LIST, async (_e, { limit }: { limit?: number }) => {
    return petLogStore.list(limit ?? 100)
  })
  ipcMain.handle(IPC.PET_LOG_CLEAR, async () => {
    petLogStore.clear()
    return { success: true }
  })

  // ── Content Bank Generate ─────────────────────────────────────
  ipcMain.handle(IPC.CONTENT_BANK_GENERATE, async (_e, payload) => {
    const { category, count } = payload as {
      category: 'chitchat' | 'joke' | 'news' | 'tip'
      count: number
    }
    // [2026-04-28] 使用激活 profile 的 API 配置
    const activeProfile = settingsStore.getActiveProfile()
    const apiKey = activeProfile.authToken
    const rawBase = activeProfile.baseUrl?.trim() || 'https://api.anthropic.com'
    const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

    if (!apiKey) return { items: [], error: 'No API key configured' }

    const prompts: Record<string, string> = {
      joke: `生成 ${count} 个程序员笑话，每个笑话用 JSON 数组格式返回，每条一句话以内，中文，格式如：["笑话1", "笑话2", ...]`,
      tip: `生成 ${count} 个技术小技巧/命令行技巧，每个用 JSON 数组格式返回，每条一句话以内，中文，格式如：["技巧1", "技巧2", ...]`,
      news: `列出 ${count} 个最近的技术新闻摘要，每个用 JSON 数组格式返回，每条一句话以内，中文，格式如：["新闻1", "新闻2", ...]`,
      chitchat: `生成 ${count} 条可爱的闲聊语句（宠物对程序员说的话），用 JSON 数组格式返回，每条一句话以内，中文，格式如：["语句1", "语句2", ...]`,
    }

    const model = activeProfile.haikuModel?.trim() || activeProfile.model?.trim() || 'claude-haiku-4-5'

    try {
      const body = JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompts[category] ?? prompts.chitchat }],
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
      if (json.error) return { items: [], error: json.error.message ?? 'API error' }

      const rawText = json.content?.[0]?.text ?? ''
      // 尝试解析 JSON 数组
      try {
        const items = JSON.parse(rawText) as string[]
        if (Array.isArray(items)) return { items }
      } catch {
        // 解析失败，尝试提取内容
        const lines = rawText.split('\n').filter((l) => l.trim())
        return { items: lines.slice(0, count) }
      }
      return { items: [] }
    } catch (e) {
      console.error('[content-bank:generate] error:', e)
      return { items: [], error: String(e) }
    }
  })

  // ── Git Worktree ───────────────────────────────────────────────
  ipcMain.handle(IPC.GIT_IS_REPO, async (_e, { path }) => {
    try {
      const { execSync } = await import('child_process')
      execSync('git rev-parse --git-dir', { cwd: path, stdio: 'pipe' })
      return { isRepo: true }
    } catch {
      return { isRepo: false }
    }
  })

  ipcMain.handle(IPC.GIT_BRANCH_LIST, async (_e, { repoPath }) => {
    try {
      const { execSync } = await import('child_process')
      // 获取本地分支
      const local = execSync('git branch --format=%(refname:short)%(HEAD)', { cwd: repoPath, encoding: 'utf-8' })
      // 获取远程分支
      const remote = execSync('git branch -r --format=%(refname:short)', { cwd: repoPath, encoding: 'utf-8' })

      const currentBranch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim()

      const branches = [
        ...local.trim().split('\n').filter(Boolean).map((line) => {
          const isCurrent = line.endsWith('*')
          const name = line.replace('*', '').trim()
          return { name, isCurrent, isRemote: false }
        }),
        ...remote.trim().split('\n').filter(Boolean).map((name) => ({
          name: name.trim(),
          isCurrent: false,
          isRemote: true
        }))
      ]

      return { branches, currentBranch, error: undefined }
    } catch (e) {
      return { branches: [], currentBranch: '', error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_WORKTREE_LIST, async (_e, { repoPath }) => {
    try {
      const { execSync } = await import('child_process')
      const output = execSync('git worktree list --porcelain', { cwd: repoPath, encoding: 'utf-8' })

      const lines = output.trim().split('\n')
      const worktrees: Array<{ path: string; branch: string; commit: string; isMain: boolean }> = []
      let current: { path?: string; branch?: string; commit?: string } = {}

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path) {
            worktrees.push({
              path: current.path,
              branch: current.branch ?? '',
              commit: current.commit ?? '',
              isMain: worktrees.length === 0
            })
          }
          current = { path: line.slice(9) }
        } else if (line.startsWith('HEAD ')) {
          current.commit = line.slice(5)
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7)
        }
      }
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? '',
          commit: current.commit ?? '',
          isMain: worktrees.length === 0
        })
      }

      const mainPath = worktrees[0]?.path ?? repoPath
      return { worktrees, mainPath, error: undefined }
    } catch (e) {
      return { worktrees: [], mainPath: '', error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_WORKTREE_CREATE, async (_e, payload) => {
    const { mainRepoPath, branchName, worktreePath, createBranch, baseBranch } = payload as {
      mainRepoPath: string
      branchName: string
      worktreePath?: string
      createBranch?: boolean
      baseBranch?: string
    }
    try {
      const { execSync } = await import('child_process')
      const path = await import('path')

      // 默认 worktree 路径：主仓库父目录 + 分支名
      const wtPath = worktreePath ?? path.join(path.dirname(mainRepoPath), branchName.replace(/\//g, '-'))

      let cmd = `git worktree add "${wtPath}"`
      if (createBranch) {
        cmd += ` -b "${branchName}"${baseBranch ? ` "${baseBranch}"` : ''}`
      } else {
        cmd += ` "${branchName}"`
      }

      execSync(cmd, { cwd: mainRepoPath, encoding: 'utf-8' })

      return { worktreePath: wtPath, branch: branchName, error: undefined }
    } catch (e) {
      return { worktreePath: '', branch: '', error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_WORKTREE_REMOVE, async (_e, payload) => {
    const { worktreePath, force } = payload as { worktreePath: string; force?: boolean }
    try {
      const { execSync } = await import('child_process')
      execSync(`git worktree remove "${worktreePath}"${force ? ' --force' : ''}`, { encoding: 'utf-8' })
      return { success: true, error: undefined }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_MERGE_BRANCH, async (_e, payload) => {
    const { repoPath, branch } = payload as { repoPath: string; branch: string }
    try {
      const { execSync } = await import('child_process')
      // 合并指定分支到当前分支
      const output = execSync(`git merge "${branch}"`, { cwd: repoPath, encoding: 'utf-8' })
      return { success: true, output, error: undefined }
    } catch (e) {
      // 合并可能有冲突，返回错误信息
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_UNMERGED_COMMITS, async (_e, payload) => {
    const { repoPath, branch } = payload as { repoPath: string; branch: string }
    try {
      const { execSync } = await import('child_process')
      // 获取当前分支名
      const currentBranch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim()
      // 检查 branch 是否有领先于当前分支的提交（未合并的提交）
      const countStr = execSync(`git rev-list --count HEAD..${branch}`, { cwd: repoPath, encoding: 'utf-8' }).trim()
      const count = parseInt(countStr, 10) || 0

      if (count === 0) {
        return { count: 0, commits: [], error: undefined }
      }

      // 获取未合并的提交详情
      const logOutput = execSync(
        `git log HEAD..${branch} --format="%H|%s|%an|%ad" --date=short`,
        { cwd: repoPath, encoding: 'utf-8' }
      ).trim()

      const commits = logOutput.split('\n').filter(Boolean).map((line) => {
        const [hash, message, author, date] = line.split('|')
        return { hash: hash ?? '', message: message ?? '', author: author ?? '', date: date ?? '' }
      })

      return { count, commits, error: undefined }
    } catch (e) {
      return { count: 0, commits: [], error: String(e) }
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

  // ── Auto Update ───────────────────────────────────────────────
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    checkForUpdates()
    return { success: true }
  })
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    downloadUpdate()
    return { success: true }
  })
  ipcMain.handle(IPC.UPDATE_INSTALL, async () => {
    installUpdate()
    return { success: true }
  })
}
