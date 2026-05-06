import * as pty from 'node-pty'
import { createHash } from 'crypto'
import { spawnSync, spawn as spawnProc } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import * as net from 'net'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { ClaudeSettings, SettingsStore, ApiProfile } from './settingsStore'
import { DEFAULT_SETTINGS } from './settingsStore'
import { getConfigDir } from './configDir'
import { getProxyPort } from './apiProxyServer'
import { getBrowserServerPort } from './browserViewManager'

/* [2026-04-23] 壳提示符检测：原 SHELL_PROMPT_RE、CLAUDE_READY_RE 已替换为 stripAnsi + looksLikeShellPrompt；resume 改用 CLI `--continue`。 */

/** 去掉常见 ANSI/OSC 序列，便于跨终端匹配裸提示符（仅用于就绪/壳检测，不改变原始输出）。 */
function stripAnsiForPromptMatch(s: string): string {
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
}

/** 回到交互式 shell：Windows cmd 路径>；Unix 常见行尾 `$`（bash）、`%`（zsh）、`#`（root）。 */
function looksLikeShellPrompt(buffer: string): boolean {
  const tail = stripAnsiForPromptMatch(buffer).slice(-512)
  if (/[A-Za-z]:\\[^\r\n]*>\s*$/m.test(tail)) return true
  if (process.platform !== 'win32') {
    if (/[\r\n][^\r\n]*?\$\s*$/m.test(tail)) return true
    if (/[\r\n][^\r\n]*?%\s*$/m.test(tail)) return true
    if (/[\r\n]#[ \t]*$/m.test(tail)) return true
  }
  return false
}

/* 续会话：首启使用 `claude --continue`；若极旧版 Windows 上仍见 sandbox 与 --continue 冲突，需升级 Claude Code 或见官方 issue。 */

/** 上游 IDE/CI 会带这些变量，Chalk「supports-color」会关色，Claude Code 全屏发灰 */
const PTY_ENV_STRIP = [
  // CI / color-disable vars
  'NO_COLOR',
  'CI',
  'NODE_DISABLE_COLORS',
  'GITHUB_ACTIONS',
  'CIRCLECI',
  'TEAMCITY_VERSION',
  'TF_BUILD',
  'TRAVIS',
  'JENKINS_URL',
  // Auth vars that would conflict with our injected API key.
  // CLAUDE_CODE_OAUTH_TOKEN comes from a global `claude login` or from a
  // previously stored credentials.json in the parent process env.
  'CLAUDE_CODE_OAUTH_TOKEN',
  // Strip these too so our injected values always win
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL'
] as const

function buildPtyEnv(claudeEnv: Record<string, string>): Record<string, string> {
  const e = { ...(process.env as Record<string, string>) }
  for (const k of PTY_ENV_STRIP) {
    delete e[k]
  }
  return {
    ...e,
    ...claudeEnv, // our settings (API key, base URL, model, etc.)
    /* [2026-04-29] 使用用户全局 ~/.claude 目录，让 Claude Code 能读取全局技能、MCP、OAuth 等配置。
     * 应用自身设置仍通过 electron-store 保存在独立目录，互不干扰。 */
    CLAUDE_CONFIG_DIR: join(homedir(), '.claude'),
    // 当前实例内嵌浏览器的 HTTP API 端口（动态分配），供 browser-tools MCP 使用
    // 每个 feng-claude 实例端口不同，多实例互不影响
    FENG_CLAUDE_BROWSER_PORT: String(getBrowserServerPort() || 3100),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '3',
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    PATH: process.env.PATH ?? ''
  }
}

/** `--add-dir` 路径：cmd.exe 与 bash 引号规则不同 */
function quoteAddDirPath(arg: string, isWindows: boolean): string {
  const t = arg.trim()
  if (!t) return ''
  if (isWindows) {
    if (/[\s"]/.test(t)) return `"${t.replace(/"/g, '""')}"`
    return t
  }
  if (/[^\w/.~+-]/i.test(t) || /\s/.test(t)) {
    return `'${t.replace(/'/g, `'\\''`)}'`
  }
  return t
}

/**
 * `--add-dir` 解析顺序：
 * 1. 设置里手动填写的 sharedSkillAddDir（优先）
 *    - 容错：若目录含 `skills` 但不含 `.claude/skills`，自动创建 junction
 * 2. 仅打包版：resources 目录下存在 `.claude` / `.claude/skills`（可与 app.asar 同层放技能）
 * 3. 仅打包版：可执行文件所在目录下存在 `.claude`（便携 exe 旁随包分发）
 */
function resolveClaudeAddDir(settings: ClaudeSettings): string {
  const manual = (settings.sharedSkillAddDir ?? DEFAULT_SETTINGS.sharedSkillAddDir).trim()
  if (manual) {
    // [2026-04-29] 容错：用户直接在根目录放了 skills 文件夹，而非 .claude/skills
    const claudeSkills = join(manual, '.claude', 'skills')
    const claudeDir = join(manual, '.claude')
    const skillsDir = join(manual, 'skills')
    const commandsDir = join(manual, 'commands')

    // 标准结构：已有 .claude/skills 或 .claude
    if (existsSync(claudeSkills) || existsSync(claudeDir)) {
      return manual
    }

    // 容错结构：根目录下有 skills 或 commands 文件夹
    const fallbackDir = existsSync(skillsDir) ? skillsDir : (existsSync(commandsDir) ? commandsDir : null)
    if (fallbackDir) {
      // 自动创建 .claude/skills 作为 junction 指向用户的 skills/commands 目录
      try {
        mkdirSync(claudeDir, { recursive: true })
        // Windows 用 junction（不需要管理员权限），其他平台用 symlink
        const linkType = process.platform === 'win32' ? 'junction' : 'dir'
        symlinkSync(fallbackDir, claudeSkills, linkType)
        return manual
      } catch {
        // junction 创建失败，仍返回原目录（CLI 可能无法识别技能）
        return manual
      }
    }

    return manual
  }

  if (!app.isPackaged) return ''

  try {
    const resRoot = process.resourcesPath
    if (resRoot) {
      const rSkills = join(resRoot, '.claude', 'skills')
      const rClaude = join(resRoot, '.claude')
      if (existsSync(rSkills) || existsSync(rClaude)) {
        return resRoot
      }
    }

    const exeDir = dirname(app.getPath('exe'))
    const eSkills = join(exeDir, '.claude', 'skills')
    const eClaude = join(exeDir, '.claude')
    if (existsSync(eSkills) || existsSync(eClaude)) {
      return exeDir
    }
  } catch {
    //
  }
  return ''
}

const MAX_SCROLLBACK_BYTES = 200 * 1024

/** 首次自动启动 claude 后短时间内，启动日志里可能出现类似 cmd 的 `盘符:\...>` 行，勿当作「已退回 shell」 */
const SHELL_RELAUNCH_GRACE_MS = 4500

function scrollbackDir(): string {
  return join(getConfigDir(), 'scrollback')
}

function scrollbackPath(workdir: string): string {
  const hash = createHash('md5').update(workdir.replace(/\\/g, '/').toLowerCase()).digest('hex')
  return join(scrollbackDir(), `${hash}.log`)
}

/** [2026-04-23] 原固定 `claude\\r`；现按设置附加 --permission-mode（Claude Code 官方 CLI）
 * [2026-04-23] resume 时使用官方 `claude --continue`（当前 cwd 接上最近一次会话）；原先就绪后再发 `/resume` 常打开会话选择器，无法等价于 `--continue`。 */
function claudeLaunchLine(
  settings: ClaudeSettings,
  isWindows: boolean,
  opts?: { continueSession?: boolean }
): string {
  const mode = settings.permissionPreset ?? DEFAULT_SETTINGS.permissionPreset
  let line = `claude --permission-mode ${mode}`
  if (opts?.continueSession) {
    line += ' --continue'
  }
  const addDir = resolveClaudeAddDir(settings).trim()
  if (addDir) {
    line += ` --add-dir ${quoteAddDirPath(addDir, isWindows)}`
  }
  return `${line}\r`
}

interface PtySession {
  id: string
  ptyProcess?: pty.IPty     // undefined for daemon sessions
  workdir: string
  claudeRunning: boolean
  buffer: string
  relaunchPending: boolean
  firstAutoLaunchAt: number
  scrollbackChunks: Buffer[]
  scrollbackSize: number
  usedContinue: boolean
  continueFallbackDone: boolean
  /** [2026-05-06] daemon mode: socket connection instead of direct PTY */
  daemonSocket?: net.Socket
  daemonStatePath?: string
}

// ── Daemon helpers ────────────────────────────────────────────────────

function daemonDir(): string {
  return join(getConfigDir(), 'pty-daemons')
}

function daemonStatePath(workdir: string): string {
  const hash = createHash('md5').update(workdir.replace(/\\/g, '/').toLowerCase()).digest('hex')
  return join(daemonDir(), `${hash}.json`)
}

interface DaemonState {
  pid: number
  pipe: string
  shell: string
  cwd: string
  startedAt: number
}

function readDaemonState(statePath: string): DaemonState | null {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as DaemonState
  } catch {
    return null
  }
}

/** Try to connect to an existing daemon socket. Returns socket on success, null otherwise. */
function tryConnectDaemon(pipePath: string): Promise<net.Socket | null> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    const timer = setTimeout(() => { socket.destroy(); resolve(null) }, 2000)
    socket.once('connect', () => { clearTimeout(timer); resolve(socket) })
    socket.once('error', () => { clearTimeout(timer); resolve(null) })
    socket.connect(pipePath)
  })
}

/** Wait for daemon to write its state file after spawning. Polls every 50ms up to 8s. */
function waitForDaemonState(statePath: string): Promise<DaemonState | null> {
  return new Promise(resolve => {
    const deadline = Date.now() + 8000
    const check = (): void => {
      const state = readDaemonState(statePath)
      if (state?.pid && state?.pipe) { resolve(state); return }
      if (Date.now() > deadline) { resolve(null); return }
      setTimeout(check, 50)
    }
    setTimeout(check, 50)
  })
}

/** Resolve and copy pty-daemon.js to userData so the subprocess can execute it. */
function resolveDaemonScript(): string | null {
  const dest = join(app.getPath('userData'), 'pty-daemon.js')
  const candidates = [
    join(app.getAppPath(), 'scripts', 'pty-daemon.js'),
    join(process.cwd(), 'scripts', 'pty-daemon.js'),
    join(__dirname, '..', '..', 'scripts', 'pty-daemon.js')
  ]
  const src = candidates.find(p => existsSync(p))
  if (!src) {
    console.warn('[pty-daemon] script not found. Tried:', candidates)
    return null
  }
  try {
    writeFileSync(dest, readFileSync(src, 'utf8'), 'utf8')
    return dest
  } catch (e) {
    console.warn('[pty-daemon] failed to copy script:', e)
    return null
  }
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()
  private win: BrowserWindow
  private settingsStore: SettingsStore

  constructor(win: BrowserWindow, settingsStore: SettingsStore) {
    this.win = win
    this.settingsStore = settingsStore
  }

  async createSession(
    sessionId: string,
    workdir: string,
    profile: ApiProfile,
    settings?: ClaudeSettings,
    resume?: boolean,
    shellOnly?: boolean
  ): Promise<{ pid: number }> {
    const s = settings ?? this.settingsStore.get()
    // [2026-04-30] 代理开启时使用本地代理 URL
    const proxyUrl = s.enableApiProxy ? `http://127.0.0.1:${getProxyPort()}` : undefined
    const claudeEnv = this.settingsStore.profileToEnvWithProxy(profile, proxyUrl)

    const isWindows = process.platform === 'win32'
    const customShell = s.terminal?.shell?.trim()
    const shell = customShell || (isWindows ? 'cmd.exe' : (process.env.SHELL ?? 'bash'))
    const ptyEnv = buildPtyEnv(claudeEnv)

    // [2026-05-06] Daemon mode: shell survives Electron restart on all platforms
    if (shellOnly && s.terminal?.useTmux) {
      return this.createDaemonSession(sessionId, workdir, shell, ptyEnv)
    }

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workdir,
      env: ptyEnv
    })

    // Auto-launch claude CLI after shell is ready
    /* [2026-04-23] 须在首次 write 之后再置 true：原先初始为 true 时，cmd/bash 会先打出壳提示符，
     * looksLikeShellPrompt 误判为「Claude 已退出」并在 ~500ms 再次 claudeLaunchLine，与上方 300ms 首启叠加 → 终端里出现第二条启动命令 */
    const session: PtySession = {
      id: sessionId,
      ptyProcess,
      workdir,
      /* [2026-04-23] 原 true — 见上 setTimeout 注释；壳提示符早于首次自动启动会触发「重回 shell → 重跑 claude」逻辑 */
      claudeRunning: false,
      buffer: '',
      relaunchPending: false,
      firstAutoLaunchAt: 0,
      scrollbackChunks: [],
      scrollbackSize: 0,
      usedContinue: !!resume,
      continueFallbackDone: false
    }

    // [2026-05-06] Shell-only 会话不自动启动 Claude Code，直接保持 shell 状态
    if (!shellOnly) {
      setTimeout(() => {
        session.firstAutoLaunchAt = Date.now()
        ptyProcess.write(claudeLaunchLine(s, isWindows, { continueSession: !!resume }))
        session.claudeRunning = true
      }, 300)
    } else if (s.terminal?.useTmux) {
      // [2026-05-06] tmux 持久化：先确认 tmux 可用，再 attach/新建会话
      const tmuxAvailable = spawnSync('tmux', ['-V'], { timeout: 2000 }).status === 0
      if (tmuxAvailable) {
        const tmuxId = `cg-${createHash('md5').update(workdir.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 12)}`
        setTimeout(() => {
          ptyProcess.write(`tmux new-session -A -s ${tmuxId}\r`)
        }, 300)
      }
    }

    ptyProcess.onData((data: string) => {
      if (this.win.isDestroyed()) return

      this.win.webContents.send(IPC.PTY_OUTPUT, {
        sessionId,
        data,
        timestamp: Date.now()
      })

      // Accumulate scrollback buffer (rolling, max MAX_SCROLLBACK_BYTES)
      const chunk = Buffer.from(data)
      session.scrollbackChunks.push(chunk)
      session.scrollbackSize += chunk.length
      while (session.scrollbackSize > MAX_SCROLLBACK_BYTES && session.scrollbackChunks.length > 1) {
        const removed = session.scrollbackChunks.shift()!
        session.scrollbackSize -= removed.length
      }

      // Detect if we've dropped back to the shell prompt (claude exited)
      // Keep a rolling buffer of recent output to match multi-chunk prompts
      session.buffer = (session.buffer + data).slice(-512)

      // [2026-04-28] --continue 失败时 Claude 打印 "No conversation found to continue" 并退回 shell
      // 检测到后立即降级为不带 --continue 重新启动，避免停在空 shell。
      if (
        session.usedContinue &&
        !session.continueFallbackDone &&
        !session.relaunchPending &&
        session.buffer.includes('No conversation found to continue')
      ) {
        session.continueFallbackDone = true
        session.claudeRunning = false
        session.relaunchPending = true
        session.buffer = ''
        setTimeout(() => {
          session.relaunchPending = false
          if (this.sessions.has(sessionId)) {
            session.claudeRunning = true
            session.firstAutoLaunchAt = Date.now()
            const settings = this.settingsStore.get()
            ptyProcess.write(claudeLaunchLine(settings, process.platform === 'win32'))
          }
        }, 300)
        return
      }

      /* [2026-04-23] 曾在此检测就绪后发 `/resume`；已改为首启命令行 `claude --continue`（见 claudeLaunchLine）。 */

      const sinceFirstLaunch = session.firstAutoLaunchAt ? Date.now() - session.firstAutoLaunchAt : 0
      if (
        session.claudeRunning &&
        !session.relaunchPending &&
        sinceFirstLaunch >= SHELL_RELAUNCH_GRACE_MS &&
        looksLikeShellPrompt(session.buffer)
      ) {
        session.claudeRunning = false
        session.relaunchPending = true
        session.buffer = ''
        // Re-launch claude after a short delay
        setTimeout(() => {
          session.relaunchPending = false
          if (this.sessions.has(sessionId)) {
            session.claudeRunning = true
            session.firstAutoLaunchAt = Date.now()
            const settings = this.settingsStore.get()
            // Relaunch without --continue: only the initial launch uses it
            ptyProcess.write(claudeLaunchLine(settings, process.platform === 'win32'))
          }
        }, 500)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (!this.win.isDestroyed()) {
        // Write a visible error line to the terminal before updating status
        if (exitCode !== 0) {
          this.win.webContents.send(IPC.PTY_OUTPUT, {
            sessionId,
            data: `\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
            timestamp: Date.now()
          })
        }
        this.win.webContents.send(IPC.PTY_STATUS, {
          sessionId,
          status: exitCode === 0 ? 'exited' : 'error',
          exitCode
        })
      }
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, session)
    return { pid: ptyProcess.pid }
  }

  private async createDaemonSession(
    sessionId: string,
    workdir: string,
    shell: string,
    ptyEnv: Record<string, string>
  ): Promise<{ pid: number }> {
    mkdirSync(daemonDir(), { recursive: true })
    const statePath = daemonStatePath(workdir)
    const session: PtySession = {
      id: sessionId,
      workdir,
      claudeRunning: false,
      buffer: '',
      relaunchPending: false,
      firstAutoLaunchAt: 0,
      scrollbackChunks: [],
      scrollbackSize: 0,
      usedContinue: false,
      continueFallbackDone: false,
      daemonStatePath: statePath
    }
    this.sessions.set(sessionId, session)

    // Try to reconnect to an existing daemon
    const existing = readDaemonState(statePath)
    if (existing?.pipe) {
      const socket = await tryConnectDaemon(existing.pipe)
      if (socket) {
        this.routeDaemonSocket(sessionId, session, socket)
        return { pid: existing.pid }
      }
    }

    // No running daemon — spawn a new one
    const scriptPath = resolveDaemonScript()
    if (!scriptPath) {
      this.sessions.delete(sessionId)
      throw new Error('[pty-daemon] Script not found; cannot create persistent session')
    }

    // Remove stale state file before spawning
    try { unlinkSync(statePath) } catch { /* ignore */ }

    // Compute the exact node-pty path so the daemon can load it regardless of __dirname
    const nodePtyPath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty')
      : join(app.getAppPath(), 'node_modules', 'node-pty')

    const electronExe = process.execPath
    const daemonHash = createHash('md5').update(workdir.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 12)
    const child = spawnProc(electronExe, [scriptPath,
      '--id', daemonHash,
      '--shell', shell,
      '--cwd', workdir,
      '--cols', '120',
      '--rows', '40',
      '--state-file', statePath,
      '--resources-path', process.resourcesPath ?? '',
      '--node-pty-path', nodePtyPath
    ], {
      detached: true,
      stdio: 'ignore',
      env: { ...ptyEnv, ELECTRON_RUN_AS_NODE: '1' }
    })
    child.unref()

    const state = await waitForDaemonState(statePath)
    if (!state) {
      this.sessions.delete(sessionId)
      throw new Error('[pty-daemon] Timed out waiting for daemon to start')
    }

    const socket = await tryConnectDaemon(state.pipe)
    if (!socket) {
      this.sessions.delete(sessionId)
      throw new Error('[pty-daemon] Daemon started but could not connect to pipe')
    }

    this.routeDaemonSocket(sessionId, session, socket)
    return { pid: state.pid }
  }

  private routeDaemonSocket(sessionId: string, session: PtySession, socket: net.Socket): void {
    session.daemonSocket = socket
    let lineBuf = ''

    socket.on('data', (chunk: Buffer) => {
      if (this.win.isDestroyed()) return
      lineBuf += chunk.toString('utf8')
      const lines = lineBuf.split('\n')
      lineBuf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as { t: string; d?: string; code?: number; c?: number; r?: number }
          if (msg.t === 's' && msg.d) {
            // Initial scrollback replay — decode and forward as terminal output
            const raw = Buffer.from(msg.d, 'base64').toString()
            this.win.webContents.send(IPC.PTY_OUTPUT, { sessionId, data: raw, timestamp: Date.now() })
          } else if (msg.t === 'o' && msg.d) {
            this.win.webContents.send(IPC.PTY_OUTPUT, { sessionId, data: msg.d, timestamp: Date.now() })
          } else if (msg.t === 'x') {
            if (!this.win.isDestroyed()) {
              this.win.webContents.send(IPC.PTY_STATUS, { sessionId, status: 'exited', exitCode: msg.code ?? 0 })
            }
            this.sessions.delete(sessionId)
          }
        } catch { /* bad JSON */ }
      }
    })

    socket.on('close', () => {
      const still = this.sessions.get(sessionId)
      if (still && still.daemonSocket === socket) {
        if (!this.win.isDestroyed()) {
          this.win.webContents.send(IPC.PTY_STATUS, { sessionId, status: 'error', exitCode: -1 })
        }
        this.sessions.delete(sessionId)
      }
    })

    socket.on('error', () => { try { socket.destroy() } catch { /* ignore */ } })
  }

  sendInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.daemonSocket) {
      session.daemonSocket.write(JSON.stringify({ t: 'i', d: data }) + '\n')
    } else {
      session.ptyProcess?.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.daemonSocket) {
      session.daemonSocket.write(JSON.stringify({ t: 'r', c: cols, r: rows }) + '\n')
    } else {
      session.ptyProcess?.resize(cols, rows)
    }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      if (session.daemonSocket) {
        // Daemon sessions: disconnect but leave daemon running
        try { session.daemonSocket.destroy() } catch { /* ignore */ }
      } else {
        this.flushScrollback(session)
        try { session.ptyProcess?.kill() } catch { /* already dead */ }
      }
      this.sessions.delete(sessionId)
    }
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.closeSession(id)
    }
  }

  private flushScrollback(session: PtySession): void {
    if (session.scrollbackChunks.length === 0) return
    try {
      mkdirSync(scrollbackDir(), { recursive: true })
      writeFileSync(scrollbackPath(session.workdir), Buffer.concat(session.scrollbackChunks))
    } catch { /* ignore */ }
  }

  readScrollback(workdir: string): string | null {
    const p = scrollbackPath(workdir)
    if (!existsSync(p)) return null
    try {
      return readFileSync(p).toString('base64')
    } catch {
      return null
    }
  }

  flushAll(): void {
    for (const session of this.sessions.values()) {
      this.flushScrollback(session)
    }
  }
}
