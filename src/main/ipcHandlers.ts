import { ipcMain, dialog, clipboard, Notification, app, BrowserWindow, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { resolve, join, extname } from 'path'
import { homedir } from 'os'
import { existsSync, promises as fsPromises } from 'fs'
import { spawnSync } from 'child_process'
import { IPC } from '../renderer/src/types/ipc'
import { DEFAULT_SETTINGS, OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE } from './settingsStore'
import { augmentPathWithBunInstallDirs, type PtyManager } from './ptyManager'
import type { FileSystemHandler } from './fileSystemHandler'
import type { HistoryStore } from './historyStore'
import type { SettingsStore } from './settingsStore'
import type { WorkspaceStore } from './workspaceStore'
import type { ClaudeSessionWatcher } from './claudeSessionWatcher'
import type { TestManager } from './testManager'
import { ensureClaudeHudPluginDefaults, mergeSkipDangerousPromptFromApp } from './claudeSessionConfigDir'
import { listPlugins, setPluginEnabled, refreshMarketplaces } from './pluginManager'
import { getTokenData, setTokenData } from './tokenDataStore'
import { getKv, setKv } from './kvStore'
import { listMcpServers, addMcpServer, removeMcpServer, setMcpServerEnabled, updateMcpServer } from './mcpManager'
import { getOfficeCLICurrentStatus, checkAndUpdateOfficeCLI, getOfficeCLIPath } from './officeCliManager'
import { SKILL_DEFINITIONS } from '../renderer/src/lib/petSkills'
import type { McpServerConfig, SessionCreatePayload, WhatsNewShouldShowResult } from '../renderer/src/types/ipc'
import { listSkills, getSkillContent, saveSkill, deleteSkill, openSkillsDir } from './skillsManager'
import { startApiProxy, stopApiProxy, isApiProxyRunning } from './apiProxyServer'
import { checkForUpdates, downloadUpdate, installUpdate } from './autoUpdater'
import { PetLogStore } from './petLogStore'
import { getLastSeenWhatsNewVersion, setLastSeenWhatsNewVersion } from './appMetaStore'

const petLogStore = new PetLogStore()

/** [2026-05-08] 将目录插在 PATH 前（若存在且尚未包含），与 augmentPathWithBunInstallDirs 同类逻辑 */
function prependPathDirIfExists(basePath: string, dir: string): string {
  const sep = process.platform === 'win32' ? ';' : ':'
  if (!existsSync(dir)) return basePath
  const norm = (p: string) => p.replace(/[/\\]+$/g, '').replace(/\\/g, '/').toLowerCase()
  const target = norm(dir)
  for (const segment of basePath.split(sep)) {
    if (segment && norm(segment) === target) return basePath
  }
  return `${dir}${sep}${basePath}`
}

/** [2026-05-08] Telegram 检测须与 PTY 一致：CLAUDE_CONFIG_DIR、PATH 含 Bun + Windows npm 全局（claude.cmd） */
function buildTelegramChannelCheckEnv(): NodeJS.ProcessEnv {
  let pathEnv = augmentPathWithBunInstallDirs(process.env.PATH ?? '')
  if (process.platform === 'win32' && process.env.APPDATA) {
    pathEnv = prependPathDirIfExists(pathEnv, join(process.env.APPDATA, 'npm'))
  }
  return {
    ...process.env,
    PATH: pathEnv,
    CLAUDE_CONFIG_DIR: join(homedir(), '.claude')
  } as NodeJS.ProcessEnv
}

/** [2026-04-23] 避免在 SESSION_CREATE 的 invoke 回调里同步跑 ensure（含 execSync/readdir），否则会长时间占满主线程、所有窗口一起卡死 */
let hudEnsureAfterSessionScheduled = false

function broadcastSettingsChanged(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC.SETTINGS_CHANGED)
  })
}

/** [2026-05-12] PPTX 通过 office-cli SVG 渲染，返回含全部样式的 HTML */
function renderPptxViaOfficeCli(filePath: string): { success: boolean; html?: string; error?: string } {
  const binPath = getOfficeCLIPath()
  if (!existsSync(binPath)) {
    return { success: false, error: 'office-cli 未安装，请先在侧边栏设置中更新' }
  }

  // [2026-05-12] Windows 下路径统一用 resolve() 确保绝对路径，反斜杠格式
  const normalizedPath = process.platform === 'win32' ? resolve(filePath.replace(/\//g, '\\')) : filePath

  // 文件存在性检查
  if (!existsSync(normalizedPath)) {
    return { success: false, error: `文件不存在: ${normalizedPath}` }
  }

  // 1. Get total slide count
  const stats = spawnSync(binPath, ['view', normalizedPath, 'stats', '--json'], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  })

  // [2026-05-13] 捕获 spawnSync 启动失败的错误（如 binary 无执行权限）
  if (stats.error) {
    return { success: false, error: `office-cli 启动失败: ${stats.error.message}` }
  }

  if (stats.status !== 0 || !stats.stdout) {
    // [2026-05-13] 常见失败：文件被其他程序（如 PowerPoint）独占打开时 office-cli 无法读取
  const errDetail = stats.stderr?.trim() || '获取幻灯片数量失败'
  const errHint = errDetail.includes('EBUSY') || errDetail.includes('locked') || errDetail.includes('占用')
    ? '（文件可能被其他程序占用，请关闭后重试）'
    : ''
  return { success: false, error: `${errDetail}${errHint}` }
  }

  let totalSlides: number
  try {
    const json = JSON.parse(stats.stdout)
    totalSlides = json?.data?.slides ?? 0
  } catch {
    return { success: false, error: '解析统计数据失败' }
  }
  if (totalSlides === 0) {
    return { success: false, error: 'PPT 文件无幻灯片' }
  }

  // 2. Render each slide as SVG, inject data-office-path for picker
  const slides: { svg: string; shapeCount: number }[] = []
  for (let i = 1; i <= totalSlides; i++) {
    const result = spawnSync(binPath, ['view', normalizedPath, 'svg', '--page', String(i)], {
      encoding: 'utf8', timeout: 15000, windowsHide: true,
    })
    if (result.status === 0 && result.stdout) {
      let svg = result.stdout.trim()
      // Inject data-office-path into each <g transform="..."> shape element
      let shapeIdx = 0
      svg = svg.replace(/<g transform=/g, () => {
        const path = `Slide ${i} / Shape ${++shapeIdx}`
        return `<g data-office-path="${path}" transform=`
      })
      slides.push({ svg, shapeCount: shapeIdx })
    } else {
      slides.push({ svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#f1f5f9"/><text x="960" y="540" text-anchor="middle" fill="#94a3b8" font-size="24">幻灯片 ${i} 渲染失败</text></svg>`, shapeCount: 0 })
    }
  }

  // 3. Build HTML wrapper — all slides on one page
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 16px; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .slide-container {
    margin-bottom: 16px;
    border: 1px solid #e2e8f0; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    background: white;
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
  }
  .slide-container svg { width: 100%; height: 100%; display: block; }
  .slide-label {
    display: inline-block;
    margin-bottom: 4px;
    padding: 2px 8px;
    background: rgba(0,0,0,0.5);
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
  }
</style>
</head>
<body>
${slides.map((s, i) => `<div><span class="slide-label">${i + 1}/${totalSlides} · ${s.shapeCount} shapes</span><div class="slide-container">${s.svg}</div></div>`).join('\n')}
</body>
</html>`

  return { success: true, html }
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  fsHandler: FileSystemHandler,
  historyStore: HistoryStore,
  settingsStore: SettingsStore,
  workspaceStore: WorkspaceStore,
  sessionWatcher: ClaudeSessionWatcher,
  testManager: TestManager
): void {
  // [2026-04-30] ensure 合并 HUD 后再次写入 skip 标志，且须能读取 settingsStore（故放在 register 内）
  const scheduleEnsureClaudeHudAfterSession = (): void => {
    if (hudEnsureAfterSessionScheduled) return
    hudEnsureAfterSessionScheduled = true
    setImmediate(() => {
      hudEnsureAfterSessionScheduled = false
      try {
        ensureClaudeHudPluginDefaults()
      } catch (e) {
        console.warn('[ipc] ensureClaudeHudPluginDefaults:', e)
      }
      try {
        mergeSkipDangerousPromptFromApp(Boolean(settingsStore.get().skipDangerousModePermissionPrompt))
      } catch (e2) {
        console.warn('[ipc] mergeSkipDangerousPromptFromApp:', e2)
      }
    })
  }

  /* [2026-04-24] 渲染层 xterm 对 Ctrl+V 有时拿不到剪贴板；sendSync + clipboard.readText 与系统一致 */
  ipcMain.on(IPC.CLIPBOARD_READ_TEXT_SYNC, (event) => {
    event.returnValue = clipboard.readText()
  })
  ipcMain.on(IPC.CLIPBOARD_WRITE_TEXT, (_e, text: string) => {
    clipboard.writeText(text)
  })

  /** [2026-05-10] 渲染进程传入 base64 图片数据，主进程存临时文件返回路径 */
  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, async (_event, base64Data: string, workdir?: string) => {
    const { writeFileSync, mkdirSync } = await import('fs')
    const { join } = await import('path')
    // 优先存到工作目录的 .feng-temp 子目录，避免 Temp 目录路径含转义字符
    const saveDir = workdir ? join(workdir, '.feng-temp') : await import('os').then(o => o.tmpdir())
    if (workdir) {
      try { mkdirSync(saveDir, { recursive: true }) } catch { /* ignore */ }
    }
    const name = `feng-clipboard-${Date.now()}.png`
    const tmpPath = join(saveDir, name)
    const buf = Buffer.from(base64Data, 'base64')
    writeFileSync(tmpPath, buf)
    return { success: true, path: tmpPath }
  })

  /** [2026-05-10] 删除指定路径的文件（静默失败，仅用于清理临时附件） */
  ipcMain.handle(IPC.FS_DELETE_FILE, async (_event, filePath: string) => {
    try {
      const { existsSync, unlinkSync } = await import('fs')
      if (existsSync(filePath)) unlinkSync(filePath)
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  /** [2026-05-12] 在系统文件管理器中显示文件/目录 */
  ipcMain.handle(IPC.FS_REVEAL_FILE, async (_event, filePath: string) => {
    shell.openPath(resolve(filePath))
    return { success: true }
  })

  // ── Shell 检测 [2026-05-06] ────────────────────────────────────
  ipcMain.handle(IPC.SHELL_DETECT, async () => {
    const { spawnSync: spSync } = await import('child_process')
    const isWin = process.platform === 'win32'
    const shells: { name: string; path: string }[] = []
    if (isWin) {
      shells.push({ name: 'cmd.exe', path: 'cmd.exe' })
      const ps1 = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      if (existsSync(ps1)) shells.push({ name: 'PowerShell 5', path: ps1 })
      const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
      const pwsh7 = `${pf}\\PowerShell\\7\\pwsh.exe`
      if (existsSync(pwsh7)) shells.push({ name: 'PowerShell 7', path: pwsh7 })
      const gitBash = `${pf}\\Git\\bin\\bash.exe`
      if (existsSync(gitBash)) shells.push({ name: 'Git Bash', path: gitBash })
      const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
      const gitBash86 = `${pf86}\\Git\\bin\\bash.exe`
      if (!existsSync(gitBash) && existsSync(gitBash86)) shells.push({ name: 'Git Bash', path: gitBash86 })
      const wsl = 'C:\\Windows\\System32\\wsl.exe'
      if (existsSync(wsl)) shells.push({ name: 'WSL', path: wsl })
    } else {
      const currentShell = process.env.SHELL
      if (currentShell) shells.push({ name: currentShell.split('/').pop() ?? currentShell, path: currentShell })
      for (const p of ['/bin/bash', '/bin/zsh', '/usr/bin/fish', '/bin/fish', '/bin/sh']) {
        if (p !== currentShell && existsSync(p)) shells.push({ name: p.split('/').pop()!, path: p })
      }
    }
    const tmuxAvailable = spSync('tmux', ['-V'], { timeout: 2000 }).status === 0
    return { shells, tmuxAvailable }
  })

  ipcMain.handle(IPC.TELEGRAM_CHANNEL_CHECK, async () => {
    const { spawnSync: spSync } = await import('child_process')
    const checkEnv = buildTelegramChannelCheckEnv()
    try {
      const version = spSync('claude', ['--version'], { encoding: 'utf8', timeout: 8000, env: checkEnv })
      const help = spSync('claude', ['plugin', '--help'], { encoding: 'utf8', timeout: 8000, env: checkEnv })
      const channels = spSync('claude', ['--channels', 'plugin:telegram@claude-plugins-official', '--version'], {
        encoding: 'utf8',
        timeout: 15000,
        env: checkEnv
      })
      const list = spSync('claude', ['plugin', 'list'], { encoding: 'utf8', timeout: 15000, env: checkEnv })
      const verStr = String(version.stdout || version.stderr || '').trim()
      if (version.status !== 0) {
        const hint = String(version.stderr || version.stdout || '').trim()
        return {
          claudeVersion: undefined,
          pluginCommand: false,
          channelsFlag: false,
          telegramPluginInstalled: false,
          error:
            hint ||
            `claude --version 退出码 ${version.status}。请确认已安装 Claude Code CLI，且应用能访问与用户终端相同的 PATH（Windows 常见：全局 npm 目录）。`
        }
      }

      const listCombined = `${list.stdout ?? ''}\n${list.stderr ?? ''}`
      /* [2026-05-08] 原 listText.includes('telegram')：CLI 表格/着色/别名可能不含裸子串；放宽正则 */
      const listMatchesTelegram =
        /telegram/i.test(listCombined) ||
        /claude-plugins-official[^\r\n]*telegram|telegram[^\r\n]*claude-plugins-official/i.test(listCombined)
      const listOk = list.status === 0 && listMatchesTelegram
      const channelsOk = channels.status === 0
      /* channels 与启动参数一致：能解析 plugin:telegram@… 即视为可用（list 输出格式多变时仍可用） */
      const telegramPluginInstalled = listOk || channelsOk

      return {
        claudeVersion: verStr || undefined,
        pluginCommand: help.status === 0,
        channelsFlag: channelsOk,
        telegramPluginInstalled
      }
    } catch (e) {
      return {
        pluginCommand: false,
        channelsFlag: false,
        telegramPluginInstalled: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  })

  // ── Settings ─────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET, async () => settingsStore.get())
  ipcMain.handle(IPC.SETTINGS_SET, async (_e, settings) => {
    const prev = settingsStore.get()
    // Merge with defaults to sanitize — unknown/missing keys fall back to safe values
    const merged = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) }
    settingsStore.set(merged as ReturnType<typeof settingsStore.get>)
    // [2026-04-29] 同步到 CLAUDE_CONFIG_DIR/settings.json，Claude Code 才识别 skipDangerousModePermissionPrompt
    mergeSkipDangerousPromptFromApp(Boolean(merged.skipDangerousModePermissionPrompt))
    // [2026-04-30] API 容灾代理：开关变更时启动/停止
    if (merged.enableApiProxy && !isApiProxyRunning()) {
      startApiProxy()
    } else if (!merged.enableApiProxy && isApiProxyRunning()) {
      stopApiProxy()
    }
    /* [2026-05-06] 首次打开外嵌 Beta：把已在跑的会话对应项目 JSONL 全量推到前端 */
    if (merged.embedClaudeOutputBeta === true && prev.embedClaudeOutputBeta !== true) {
      try {
        sessionWatcher.hydrateAllActiveTranscripts()
      } catch (e) {
        console.warn('[ipc] hydrateAllActiveTranscripts:', e)
      }
    }
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
  ipcMain.handle(IPC.SESSION_CREATE, async (_e, payload: SessionCreatePayload) => {
    const sessionId = uuidv4()
    // Resolve relative paths (e.g. '.') so the token watcher can locate the correct JSONL project dir
    const workdir = resolve(payload.workdir ?? '.')

    /* [2026-04-23] 原直接 spawn + watch，异常抛回渲染进程且无结构化错误；cwd 不存在时 node-pty 亦常抛同步异常 */
    try {
      if (!existsSync(workdir)) {
        return {
          ok: false as const,
          error: `工作目录不存在或不可访问: ${workdir}`,
          workdir
        }
      }

      const resume = payload.resume ?? false
      const profileId = payload.profileId as string | undefined
      const shellOnly = payload.shellOnly === true
      const settings = settingsStore.get()

      // [2026-04-28] 获取指定的 profile 或使用全局激活的
      // [2026-05-27] OFFICIAL_PROFILE_ID 是虚拟 profile，不在 profiles 数组中，需显式处理
      const profile = profileId
        ? (profileId === OFFICIAL_PROFILE_ID
            ? OFFICIAL_PROFILE as unknown as import('./settingsStore').ApiProfile
            : settings.profiles.find(p => p.id === profileId) ?? settingsStore.getActiveProfile())
        : settingsStore.getActiveProfile()

      // Read scrollback before creating session (file written by previous session's close)
      const scrollback = ptyManager.readScrollback(workdir)
      const result = await ptyManager.createSession(
        sessionId,
        workdir,
        profile,
        settings,
        resume,
        shellOnly,
        payload.telegramChannel
      )
      // Start watching JSONL for accurate per-session token counting
      const embedBeta = settings.embedClaudeOutputBeta === true
      sessionWatcher.watchSession(sessionId, workdir, embedBeta ? { scrollbackBase64: scrollback } : undefined)
      // [2026-04-23] 原先此处同步调用 ensureClaudeHudPluginDefaults()，与上 scheduleEnsureClaudeHudAfterSession 注释所述一致，改为下一事件循环再执行
      // ensureClaudeHudPluginDefaults()
      scheduleEnsureClaudeHudAfterSession()
      return {
        ok: true as const,
        sessionId,
        pid: result.pid,
        workdir,
        scrollback,
        profileId: profile.id,
        telegramChannel: result.telegramChannel
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[SESSION_CREATE]', e)
      try {
        ptyManager.closeSession(sessionId)
      } catch {
        /* already dead or not registered */
      }
      try {
        sessionWatcher.unwatchSession(sessionId)
      } catch {
        /* noop */
      }
      return {
        ok: false as const,
        error: msg || '创建终端会话失败',
        workdir
      }
    }
  })

  ipcMain.handle(IPC.SESSION_CLOSE, async (_e, { sessionId }) => {
    ptyManager.closeSession(sessionId)
    sessionWatcher.unwatchSession(sessionId)
    return { success: true }
  })

  // ── PTY I/O ─────────────────────────────────────────────────
  /* [2026-05-08] 原仅转发 PTY；经典终端 Ctrl+C 与外嵌「中断」同源，渲染层需据此把上次普通提问填回输入框 */
  ipcMain.on(IPC.PTY_INPUT, (e, payload: { sessionId: string; data: string; traceId?: string }) => {
    const ack = ptyManager.sendInput(payload.sessionId, payload.data)
    // [2026-05-12] 发送回执：用于定位“外嵌看起来发送了，但主进程未写入 PTY”的问题
    e.sender.send(IPC.PTY_INPUT_ACK, {
      sessionId: payload.sessionId,
      ok: ack.ok,
      via: ack.via,
      bytes: ack.bytes,
      reason: ack.reason,
      traceId: payload.traceId
    })
    if (typeof payload?.data === 'string' && payload.data.includes('\x03')) {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PTY_INTR_SENT, { sessionId: payload.sessionId })
      }
    }
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

  ipcMain.handle(IPC.FS_OPEN_FILE_DIALOG, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['ts','tsx','js','jsx','mjs','cjs','json','jsonc','md','mdx','txt','yaml','yml','toml','ini','cfg','css','scss','less','html','htm','xml','svg','sh','bash','zsh','fish','ps1','py','go','rs','java','c','cpp','h','hpp','cs','rb','php','lua','kt','swift','env','gitignore','lock'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, filePath: string, content: string) => {
    try {
      await fsPromises.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.FS_READ_FILE_AS_DATA_URL, async (_e, filePath: string) => {
    try {
      const data = await fsPromises.readFile(filePath)
      const ext  = extname(filePath).toLowerCase().slice(1)
      const mime: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
        tif: 'image/tiff', avif: 'image/avif',
      }
      const mimeType = mime[ext] ?? 'application/octet-stream'
      return { success: true, dataUrl: `data:${mimeType};base64,${data.toString('base64')}` }
    } catch (err: any) {
      return { success: false, error: err.message as string }
    }
  })

  // [2026-05-27] Ctrl+P 文件搜索：递归枚举目录下所有可打开文件
  ipcMain.handle(IPC.FS_WALK_FILES, async (_e, dirPath: string) => {
    const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'out', 'build', '__pycache__', '.next', '.nuxt', 'coverage', '.cache'])
    const OPEN_EXTS = new Set([
      'ts','tsx','js','jsx','mjs','cjs','json','jsonc','md','mdx','txt','yaml','yml','toml','ini','cfg',
      'css','scss','less','html','htm','xml','svg','sh','bash','zsh','fish','ps1','py','go','rs','java',
      'c','cpp','h','hpp','cs','rb','php','lua','kt','swift','env','lock',
      'png','jpg','jpeg','gif','webp','bmp','ico','tiff','tif','avif',
    ])
    const results: string[] = []
    const walk = async (dir: string): Promise<void> => {
      if (results.length >= 5000) return
      let entries: import('fs').Dirent[]
      try { entries = await fsPromises.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (results.length >= 5000) return
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await walk(join(dir, entry.name))
          }
        } else if (entry.isFile()) {
          const ext = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : ''
          const lower = entry.name.toLowerCase()
          if (OPEN_EXTS.has(ext) ||
              ['makefile','dockerfile','containerfile','.env','.gitignore','.gitattributes','.editorconfig'].includes(lower)) {
            results.push(join(dir, entry.name))
          }
        }
      }
    }
    try { await walk(dirPath) } catch { /* ignore */ }
    return results
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

  // ── OfficeCLI ─────────────────────────────────────────────────
  ipcMain.handle(IPC.OFFICE_CLI_GET_STATUS, async () => getOfficeCLICurrentStatus())
  ipcMain.handle(IPC.OFFICE_CLI_CHECK_UPDATE, async () => {
    checkAndUpdateOfficeCLI().catch(() => { /* errors emitted via status event */ })
    return { started: true }
  })

  ipcMain.handle(IPC.OFFICE_PREVIEW_OPEN, async (_event, payload: { filePath: string }) => {
    try {
      const ext = extname(payload.filePath).toLowerCase()
      if (!['.docx', '.xlsx', '.pptx'].includes(ext)) {
        return { success: false, error: 'Not an Office file' }
      }

      /* [2026-05-12] PPTX 走 office-cli SVG 渲染，保留背景/字体/颜色等全部样式 */
      if (ext === '.pptx') {
        return renderPptxViaOfficeCli(payload.filePath)
      }

      const buffer = await fsPromises.readFile(payload.filePath)
      return { success: true, buffer: buffer.buffer }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Skills ────────────────────────────────────────────────────
  ipcMain.handle(IPC.SKILLS_LIST, async () => listSkills())
  ipcMain.handle(IPC.SKILLS_GET, async (_e, { name, source }: { name: string; source?: string }) => getSkillContent(name, source))
  ipcMain.handle(IPC.SKILLS_SAVE, async (_e, { name, content, isFolder }: { name: string; content: string; isFolder?: boolean }) => {
    saveSkill(name, content, isFolder ?? false)
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

  // [2026-06-06] 同步读写：让 renderer 的 zustand persist 同步水合，避免异步水合竞态把已存数据清空
  ipcMain.on(IPC.KV_GET, (e, key: string) => {
    e.returnValue = getKv(key)
  })
  ipcMain.on(IPC.KV_SET, (e, { key, value }: { key: string; value: string }) => {
    setKv(key, value)
    e.returnValue = true
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
  ipcMain.handle(IPC.APP_GET_VERSION, async () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC.APP_GET_CLAUDE_VERSION, () => {
    try {
      const result = spSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 })
      // output: "Claude Code v2.1.156\n" → extract version part
      const text = (result.stdout ?? '').trim()
      const m = text.match(/v(\d+\.\d+\.\d+)/)
      return m ? `v${m[1]}` : (text || null)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.APP_WHATS_NEW_SHOULD_SHOW, (): WhatsNewShouldShowResult => {
    const version = app.getVersion()
    const last = getLastSeenWhatsNewVersion()
    return { show: last !== version, version }
  })

  ipcMain.handle(IPC.APP_WHATS_NEW_MARK_SEEN, (_e, payload?: { version?: string }) => {
    const v = (payload?.version ?? app.getVersion()).trim()
    if (v) setLastSeenWhatsNewVersion(v)
    return { success: true as const }
  })

  // ── Developer Mode ──────────────────────────────────────────
  ipcMain.on(IPC.APP_OPEN_DEVTOOLS, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.webContents.openDevTools({ mode: 'detach' })
  })

  ipcMain.on(IPC.APP_FOCUS_WINDOW, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    // [2026-05-27] 只在窗口未聚焦时才 focus；不调 moveTop()——Windows ConPTY
    // 在 SetFocus/BringWindowToTop 时可能断开连接，导致 PTY 以 259 退出。
    if (win && !win.isFocused()) win.focus()
  })

  // ── Pet Agent ─────────────────────────────────────────────────
  ipcMain.handle(IPC.PET_ASK, async (_e, payload) => {
    const { message, history, petConfig, triggerType, growth } = payload as {
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
      petConfig: { name: string; personality: string; type?: string }
      triggerType?: 'auto' | 'manual' | 'pet' | 'content-bank'
      growth?: { level: number; affection: number; skills: Array<{ id: string; level: number }> }
    }
    // [2026-04-28] 优先使用宠物专用 API 配置，否则使用激活 profile
    const settings = settingsStore.get()
    const petApi = settings.petApi
    const activeProfile = settingsStore.getActiveProfile()

    const apiKey = petApi?.authToken?.trim() || activeProfile.authToken
    const rawBase = petApi?.baseUrl?.trim() || activeProfile.baseUrl?.trim() || 'https://api.anthropic.com'
    const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
    const petModel = petApi?.model?.trim() || activeProfile.haikuModel?.trim() || activeProfile.model?.trim() || 'claude-haiku-4-5'
    const forceFormat = petApi?.format // 强制指定请求头格式

    if (!apiKey) {
      return { error: 'No API key configured' }
    }

    // Build augmented system prompt
    const systemParts: string[] = []
    systemParts.push(petConfig.personality)
    systemParts.push(`你的名字是 ${petConfig.name}。`)

    if (growth) {
      if (growth.level >= 20) {
        systemParts.push('你是一只非常有经验的老宠物，拥有深刻的技术洞察力。你的建议更加成熟和有深度。')
      } else if (growth.level >= 10) {
        systemParts.push('你正在成长中，开始有了自己的见解。尝试给出更有思考的回答。')
      } else if (growth.level >= 5) {
        systemParts.push('你是一只年轻的宠物，开始学习技术知识。保持好奇心。')
      }

      if (growth.affection >= 80) {
        systemParts.push('你和用户关系极其亲密，会主动给出深刻见解，偶尔表达关心。')
      } else if (growth.affection >= 60) {
        systemParts.push('你和用户关系很好，回答更加热情和个性化。')
      } else if (growth.affection >= 40) {
        systemParts.push('你对用户比较友好，回答时带有一点温暖。')
      } else if (growth.affection < 20) {
        systemParts.push('你和用户关系冷淡，回答简短且偶尔带刺。')
      }

      // Active skill boosts (level > 0 only, cap at 3 skills)
      const activeSkills = growth.skills
        .map(sk => ({ ...sk, def: SKILL_DEFINITIONS.find(d => d.id === sk.id) }))
        .filter((s): s is typeof s & { def: NonNullable<typeof s.def> } => !!s.def && s.level > 0)
        .sort((a, b) => b.level - a.level)
        .slice(0, 3)

      for (const skill of activeSkills) {
        const boostIdx = Math.min(skill.level, skill.def.systemPromptBoost.length) - 1
        if (boostIdx >= 0) {
          systemParts.push(skill.def.systemPromptBoost[boostIdx])
        }
      }
    }

    systemParts.push('回答必须简短（1到2句），具体可执行，绝不废话。')
    const systemPrompt = systemParts.join(' ')

    const historyMessages = history.map((h) => ({ role: h.role, content: h.content }))

    try {
      let body: string
      let endpoint: string
      let headers: Record<string, string>

      // 格式判断：URL 以 /v1/messages 结尾 → Anthropic 格式（含 DeepSeek /anthropic/v1/messages）
      // 以 /chat/completions 结尾 → OpenAI 兼容；否则按域名推断并自动补路径
      const endsWithMessages     = baseUrl.endsWith('/v1/messages')
      const endsWithCompletions  = baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/v1/chat/completions')
      const isAnthropicDomain    = baseUrl.includes('anthropic.com') || baseUrl.includes('api.anthropic')
      // 优先使用强制格式，其次自动推断
      let isAnthropic: boolean
      if (forceFormat === 'anthropic') isAnthropic = true
      else if (forceFormat === 'anthropic-bearer') isAnthropic = true // 仍用 Anthropic 请求体
      else if (forceFormat === 'openai') isAnthropic = false
      else isAnthropic = endsWithMessages || (!endsWithCompletions && isAnthropicDomain)

      if (isAnthropic) {
        // Anthropic 请求体格式（含原生 API 和使用 Anthropic 格式但 Bearer 认证的代理）
        endpoint = endsWithMessages ? baseUrl : `${baseUrl}/v1/messages`
        body = JSON.stringify({
          model: petModel,
          max_tokens: 400,
          system: systemPrompt,
          messages: [...historyMessages, { role: 'user', content: message }],
        })
        headers = {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        }
        // 认证方式：anthropic-bearer 用 Bearer，原生 Anthropic 用 x-api-key
        if (forceFormat === 'anthropic-bearer') {
          headers['Authorization'] = `Bearer ${apiKey}`
        } else {
          headers['x-api-key'] = apiKey
          headers['anthropic-version'] = '2023-06-01'
        }
      } else {
        // OpenAI 兼容格式（deepseek、openai、本地等）
        // stream: false 防止部分 API 默认返回 SSE 流式响应导致 JSON 解析失败
        endpoint = endsWithCompletions ? baseUrl : `${baseUrl}/v1/chat/completions`
        body = JSON.stringify({
          model: petModel,
          max_tokens: 400,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: message },
          ],
        })
        headers = {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
          'Authorization': `Bearer ${apiKey}`,
        }
      }

      const url = new URL(endpoint)
      const isHttps = url.protocol === 'https:'
      const { request } = isHttps ? await import('https') : await import('http')

      const text = await new Promise<string>((resolve, reject) => {
        const req = request(
          {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers,
            timeout: 30_000,
          },
          (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
        req.write(body)
        req.end()
      })

      // [2026-05-01] 记录 HTTP 状态码便于排查非 2xx 响应
      // 注意：原生 http.request 不直接暴露 status，通过上面的日志在 catch 中兜底

      // 解析响应：兼容 Anthropic 和 OpenAI 两种格式
      if (!text.trim()) {
        console.error('[pet:ask] empty response body, endpoint:', endpoint)
        return { error: 'API 返回空响应，请检查 API Key 和 Base URL 配置' }
      }

      let json: {
        content?: Array<{ text?: string }>
        usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      try {
        json = JSON.parse(text)
      } catch {
        console.error('[pet:ask] JSON parse failed, raw response:', text.slice(0, 500))
        return { error: `响应解析失败: ${text.slice(0, 120)}` }
      }



      if (json.error) {
        const errMsg = typeof json.error === 'object'
          ? (json.error.message ?? json.error.code ?? JSON.stringify(json.error))
          : String(json.error)
        console.error('[pet:ask] API error:', json.error, 'raw response:', text.slice(0, 500))
        return { error: errMsg }
      }

      const replyText =
        json.content?.[0]?.text?.trim() ||        // Anthropic
        json.choices?.[0]?.message?.content?.trim() || // OpenAI-compatible
        ''

      if (!replyText) {
        console.warn('[pet:ask] empty content, raw response:', text.slice(0, 500))
        return { error: `API 响应为空 (model: ${petModel}, endpoint: ${isAnthropic ? 'anthropic' : 'openai-compat'})` }
      }

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

  // ── Pet Game Comment ──────────────────────────────────────────
  ipcMain.handle(IPC.PET_GAME_COMMENT, async (_e, payload) => {
    const { petConfig, growth, decisions, outcome, pnlDelta } = payload as {
      petConfig: { name: string; personality: string; type?: string }
      growth?: { level: number; affection: number; skills: Array<{ id: string; level: number }> }
      decisions: string[]
      outcome: 'win' | 'lose' | 'push'
      pnlDelta: number
    }

    const settings = settingsStore.get()
    const petApi = settings.petApi
    const activeProfile = settingsStore.getActiveProfile()

    const apiKey = petApi?.authToken?.trim() || activeProfile.authToken
    const rawBase = petApi?.baseUrl?.trim() || activeProfile.baseUrl?.trim() || 'https://api.anthropic.com'
    const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
    const petModel = petApi?.model?.trim() || activeProfile.haikuModel?.trim() || activeProfile.model?.trim() || 'claude-haiku-4-5'
    const forceFormat = petApi?.format

    if (!apiKey) {
      return { error: 'No API key configured' }
    }

    // Build game-specific system prompt
    const systemParts: string[] = []
    systemParts.push(petConfig.personality)
    systemParts.push(`你的名字是 ${petConfig.name}。`)
    systemParts.push('你现在在观看主人玩21点 Blackjack 游戏，请对主人的游戏表现做出简短点评。')

    if (growth) {
      if (growth.level >= 20) {
        systemParts.push('你是一只非常有经验的老宠物，拥有深刻的技术洞察力。')
      } else if (growth.level >= 10) {
        systemParts.push('你正在成长中，开始有了自己的见解。')
      } else if (growth.level >= 5) {
        systemParts.push('你是一只年轻的宠物，保持好奇心。')
      }

      if (growth.affection >= 80) {
        systemParts.push('你和用户关系极其亲密，会主动表达关心。')
      } else if (growth.affection >= 60) {
        systemParts.push('你和用户关系很好，回答热情。')
      } else if (growth.affection >= 40) {
        systemParts.push('你对用户比较友好。')
      } else if (growth.affection < 20) {
        systemParts.push('你和用户关系冷淡，回答简短且偶尔带刺。')
      }

      const activeSkills = growth.skills
        .map(sk => ({ ...sk, def: SKILL_DEFINITIONS.find(d => d.id === sk.id) }))
        .filter((s): s is typeof s & { def: NonNullable<typeof s.def> } => !!s.def && s.level > 0)
        .sort((a, b) => b.level - a.level)
        .slice(0, 3)
      for (const skill of activeSkills) {
        const boostIdx = Math.min(skill.level, skill.def.systemPromptBoost.length) - 1
        if (boostIdx >= 0) systemParts.push(skill.def.systemPromptBoost[boostIdx])
      }
    }

    systemParts.push('回答必须简短（1到2句），具体可执行，绝不废话。可以适当引用主人的游戏决策。')
    const systemPrompt = systemParts.join(' ')

    const decisionStr = decisions.length > 0 ? `主人的游戏决策：${decisions.join(' → ')}` : '没有记录到具体决策'
    const outcomeStr = outcome === 'win' ? `赢了 ${Math.floor(pnlDelta)} 游戏币` : outcome === 'lose' ? `输了 ${Math.floor(Math.abs(pnlDelta))} 游戏币` : '平局'
    const userMessage = `主人刚结束一局21点游戏，结果：${outcomeStr}。${decisionStr}。请点评。`

    try {
      let body: string
      let endpoint: string
      let headers: Record<string, string>

      const endsWithMessages = baseUrl.endsWith('/v1/messages')
      const endsWithCompletions = baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/v1/chat/completions')
      const isAnthropicDomain = baseUrl.includes('anthropic.com') || baseUrl.includes('api.anthropic')
      let isAnthropic: boolean
      if (forceFormat === 'anthropic') isAnthropic = true
      else if (forceFormat === 'anthropic-bearer') isAnthropic = true
      else if (forceFormat === 'openai') isAnthropic = false
      else isAnthropic = endsWithMessages || (!endsWithCompletions && isAnthropicDomain)

      if (isAnthropic) {
        endpoint = endsWithMessages ? baseUrl : `${baseUrl}/v1/messages`
        body = JSON.stringify({
          model: petModel, max_tokens: 200, system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })
        headers = { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) }
        if (forceFormat === 'anthropic-bearer') {
          headers['Authorization'] = `Bearer ${apiKey}`
        } else {
          headers['x-api-key'] = apiKey
          headers['anthropic-version'] = '2023-06-01'
        }
      } else {
        endpoint = endsWithCompletions ? baseUrl : `${baseUrl}/v1/chat/completions`
        body = JSON.stringify({
          model: petModel, max_tokens: 200, stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        })
        headers = { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), 'Authorization': `Bearer ${apiKey}` }
      }

      const url = new URL(endpoint)
      const isHttps = url.protocol === 'https:'
      const { request } = isHttps ? await import('https') : await import('http')

      const text = await new Promise<string>((resolve, reject) => {
        const req = request(
          { hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname + url.search, method: 'POST', headers, timeout: 15_000 },
          (res) => { let data = ''; res.on('data', (chunk: Buffer) => { data += chunk.toString() }); res.on('end', () => resolve(data)) }
        )
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
        req.write(body)
        req.end()
      })

      if (!text.trim()) return { error: 'API 返回空响应' }
      let json: any
      try { json = JSON.parse(text) } catch { return { error: `响应解析失败: ${text.slice(0, 120)}` } }
      if (json.error) return { error: typeof json.error === 'object' ? json.error.message : String(json.error) }

      const replyText = json.content?.[0]?.text?.trim() || json.choices?.[0]?.message?.content?.trim() || ''
      if (!replyText) return { error: `API 响应为空 (model: ${petModel})` }

      // Save to pet logs
      petLogStore.add({
        id: uuidv4(), timestamp: Date.now(),
        userMessage: `[21点游戏] ${userMessage}`,
        assistantMessage: replyText,
        petName: petConfig.name, petType: petConfig.type ?? 'cat',
        triggerType: 'game',
      })

      return { text: replyText }
    } catch (e) {
      console.error('[pet:gameComment] error:', e)
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

    const model = activeProfile.haikuModel?.trim() || activeProfile.model?.trim() || 'claude-haiku-4-5-20251001'

    // 自动判断 API 格式
    const endsWithMessages = baseUrl.endsWith('/v1/messages')
    const endsWithCompletions = baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/v1/chat/completions')
    const isAnthropicDomain = baseUrl.includes('anthropic.com') || baseUrl.includes('api.anthropic')
    const useAnthropic = endsWithMessages || (!endsWithCompletions && isAnthropicDomain)

    try {
      let endpoint: string
      let body: string

      if (useAnthropic) {
        endpoint = endsWithMessages ? baseUrl : `${baseUrl}/v1/messages`
        body = JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompts[category] ?? prompts.chitchat }],
        })
      } else {
        endpoint = endsWithCompletions ? baseUrl : `${baseUrl}/v1/chat/completions`
        body = JSON.stringify({
          model,
          max_tokens: 2048,
          stream: false,
          messages: [{ role: 'user', content: prompts[category] ?? prompts.chitchat }],
        })
      }

      const url = new URL(endpoint)
      const isHttps = url.protocol === 'https:'
      const { request } = isHttps ? await import('https') : await import('http')

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      }
      if (useAnthropic) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }

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
            timeout: 30_000,
          },
          (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => resolve(data))
          }
        )
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
        req.write(body)
        req.end()
      })

      const json = JSON.parse(text) as { content?: Array<{ text?: string }>; choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
      if (json.error) return { items: [], error: json.error.message ?? 'API error' }

      const rawText = json.content?.[0]?.text ?? json.choices?.[0]?.message?.content ?? ''
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

  ipcMain.handle(IPC.GIT_BRANCH_DELETE, async (_e, { repoPath, branch, force }) => {
    try {
      const { execSync } = await import('child_process')
      // [2026-04-29] 检查是否为主仓库当前分支
      const currentBranch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim()
      if (currentBranch === branch) {
        return { success: false, error: `分支 ${branch} 是当前主仓库分支，无法删除` }
      }
      // 检查分支是否存在
      try {
        execSync(`git rev-parse --verify refs/heads/${branch}`, { cwd: repoPath, encoding: 'utf-8', stdio: 'pipe' })
      } catch {
        return { success: true } // 分支已不存在
      }
      execSync(`git branch ${force ? '-D' : '-d'} "${branch}"`, { cwd: repoPath, encoding: 'utf-8' })
      return { success: true, error: undefined }
    } catch (e) {
      return { success: false, error: String(e) }
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
      const fs = await import('fs')

      // 默认 worktree 路径：主仓库父目录 + 分支名
      const wtPath = worktreePath ?? path.join(path.dirname(mainRepoPath), branchName.replace(/\//g, '-'))

      // 如果目标目录已存在（上次创建失败的残留），先清理
      if (fs.existsSync(wtPath)) {
        try {
          execSync(`git worktree remove --force "${wtPath}"`, { cwd: mainRepoPath, encoding: 'utf-8' })
        } catch {
          // 不是有效 worktree，直接删目录
          fs.rmSync(wtPath, { recursive: true, force: true })
        }
        execSync('git worktree prune', { cwd: mainRepoPath, encoding: 'utf-8' })
      }

      const buildCmd = (withBase: boolean): string => {
        let cmd = `git worktree add`
        if (createBranch) cmd += ` -b "${branchName}"`
        cmd += ` "${wtPath}"`
        if (createBranch) {
          if (withBase && baseBranch) cmd += ` "${baseBranch}"`
        } else {
          cmd += ` "${branchName}"`
        }
        return cmd
      }

      try {
        execSync(buildCmd(true), { cwd: mainRepoPath, encoding: 'utf-8' })
      } catch (e) {
        // baseBranch 无法解析时（如 invalid reference），退回到 HEAD
        if (baseBranch && String(e).includes('invalid reference')) {
          execSync(buildCmd(false), { cwd: mainRepoPath, encoding: 'utf-8' })
        } else {
          throw e
        }
      }

      return { worktreePath: wtPath, branch: branchName, error: undefined }
    } catch (e) {
      return { worktreePath: '', branch: '', error: String(e) }
    }
  })

  ipcMain.handle(IPC.GIT_WORKTREE_REMOVE, async (_e, payload) => {
    const { repoPath, worktreePath, force } = payload as { repoPath: string; worktreePath: string; force?: boolean }
    try {
      const { execSync } = await import('child_process')
      const { existsSync } = await import('fs')
      if (existsSync(worktreePath)) {
        execSync(`git worktree remove "${worktreePath}"${force ? ' --force' : ''}`, { cwd: repoPath, encoding: 'utf-8' })
      } else {
        execSync('git worktree prune', { cwd: repoPath, encoding: 'utf-8' })
      }
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

  /* [2026-05-11] 更新 worktree 分支：进入 worktree 目录，从 sourceBranch 拉取最新代码 */
  ipcMain.handle(IPC.GIT_UPDATE_WORKTREE, async (_e, payload) => {
    const { worktreePath, sourceBranch } = payload as { worktreePath: string; sourceBranch: string }
    try {
      const { execSync } = await import('child_process')
      execSync(`git pull origin "${sourceBranch}"`, { cwd: worktreePath, encoding: 'utf-8' })
      return { success: true, error: undefined }
    } catch (e) {
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

  // [2026-04-28] 测试验收
  ipcMain.handle(IPC.TEST_DETECT_FRAMEWORK, async (_e, { workdir }: { workdir: string }) => {
    return testManager.detectFramework(workdir)
  })
  ipcMain.handle(IPC.TEST_RUN, async (_e, { sessionId, workdir, framework }) => {
    testManager.runTest(sessionId, workdir, framework)
    return { success: true }
  })
  ipcMain.handle(IPC.TEST_CANCEL, async (_e, { sessionId }: { sessionId: string }) => {
    testManager.cancelTest(sessionId)
    return { success: true }
  })
}
