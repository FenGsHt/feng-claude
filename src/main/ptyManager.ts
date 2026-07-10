import * as pty from 'node-pty'
import { getWindowsPtySpawnExtras } from './winPtySpawnExtras'
import { createHash } from 'crypto'
import { spawnSync, spawn as spawnProc } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import * as net from 'net'
import { request as httpsRequest } from 'https'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { ClaudeSettings, SettingsStore, ApiProfile } from './settingsStore'
import type { TelegramChannelSessionConfig } from '../renderer/src/types/settings'
import { DEFAULT_SETTINGS } from './settingsStore'
import { getConfigDir } from './configDir'
import { getProxyPort } from './apiProxyServer'
import { getBrowserServerPort, registerSessionWorkdir } from './browserViewManager'
import { hasClaudeConversationHistory } from './claudeSessionWatcher'

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
  'ANTHROPIC_MODEL',
  // [2026-06-01] 切换配置时防止旧配置的 model 变量残留（profile 无此字段时 filterEnvRecord 不会覆盖）
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL'
] as const

/** [2026-05-08] Bun 默认装在 ~/.bun/bin；Electron 包壳启动时常继承不到用户后来在终端里改的 PATH，Telegram 等官方插件会 spawn bun 失败。 */
export function augmentPathWithBunInstallDirs(basePath: string): string {
  const sep = process.platform === 'win32' ? ';' : ':'
  const bunBin = join(homedir(), '.bun', 'bin')
  if (!existsSync(bunBin)) return basePath
  const norm = (p: string) => p.replace(/[/\\]+$/g, '').replace(/\\/g, '/').toLowerCase()
  const target = norm(bunBin)
  for (const segment of basePath.split(sep)) {
    if (segment && norm(segment) === target) return basePath
  }
  return `${bunBin}${sep}${basePath}`
}

function buildPtyEnv(claudeEnv: Record<string, string>, isOfficialProfile = false, sessionId = ''): Record<string, string> {
  const e = { ...(process.env as Record<string, string>) }
  for (const k of PTY_ENV_STRIP) {
    // [2026-05-27] 官方配置保留 CLAUDE_CODE_OAUTH_TOKEN，让 Claude Code 使用自身 OAuth 凭证
    if (isOfficialProfile && k === 'CLAUDE_CODE_OAUTH_TOKEN') continue
    delete e[k]
  }
  /* [2026-05-08] 原末尾 PATH: process.env.PATH ?? ''：未把 ~/.bun/bin 并入，插件内调用 bun 因找不到命令失败。 */
  const pathAugmented = augmentPathWithBunInstallDirs(e.PATH ?? process.env.PATH ?? '')
  return {
    ...e,
    ...claudeEnv, // our settings (API key, base URL, model, etc.)
    /* [2026-04-29] 使用用户全局 ~/.claude 目录，让 Claude Code 能读取全局技能、MCP、OAuth 等配置。
     * 应用自身设置仍通过 electron-store 保存在独立目录，互不干扰。 */
    CLAUDE_CONFIG_DIR: join(homedir(), '.claude'),
    // 当前实例内嵌浏览器的 HTTP API 端口（动态分配），供 browser-tools MCP 使用
    // 每个 feng-claude 实例端口不同，多实例互不影响
    FENG_CLAUDE_BROWSER_PORT: String(getBrowserServerPort() || 3100),
    // [2026-06-12] 当前终端 session 的唯一 id，供 browser-tools MCP 按 session 隔离调试浏览器 tab
    FENG_CLAUDE_SESSION_ID: sessionId,
    // [2026-07-08] 禁用 CC 全屏 TUI 模式。全屏模式使用 alternate screen buffer + 自定义渲染，
    // 与 xterm.js wrapper 冲突导致截断/滚动失效/重复显示。纯文本输出更适配我们的 GUI。
    CLAUDE_NO_FULLSCREEN: '1',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '3',
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    PATH: pathAugmented
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

/** [2026-05-08] Windows：仅 pty.kill() 时 Bun/Node 等孙进程常残留；对 PTY 根 PID 做 /T 整树结束。 */
function killWindowsPtyProcessTree(pid: number): void {
  if (!Number.isFinite(pid) || pid <= 0) return
  try {
    spawnSync('taskkill', ['/PID', String(Math.floor(pid)), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 20_000
    })
  } catch {
    /* 进程已退出或权限不足时忽略 */
  }
}

function scrollbackPath(workdir: string): string {
  const hash = createHash('md5').update(workdir.replace(/\\/g, '/').toLowerCase()).digest('hex')
  return join(scrollbackDir(), `${hash}.log`)
}

/**
 * [2026-05-09] 仅注入路径，不含 Token。用户反馈：外嵌/插件侧 Read 仍落到 `channels\\telegram\\access.json`，
 * 因 Bun/工具子进程未继承 PTY 的 TELEGRAM_STATE_DIR；在启动行再写一遍，与 PTY env 双保险。
 */
function shellTelegramStateDirPrefix(absDir: string, isWindows: boolean, shell: string): string {
  const t = absDir.trim()
  if (!t) return ''
  const lower = shell.toLowerCase()
  const useUnixStyle = !isWindows || lower.includes('bash') || lower.includes('sh.exe') || lower.includes('msys')
  if (useUnixStyle) {
    const sh = t.replace(/'/g, `'\\''`)
    return `TELEGRAM_STATE_DIR='${sh}' `
  }
  if (lower.includes('pwsh') || lower.includes('powershell')) {
    const lit = t.replace(/'/g, "''")
    return `$env:TELEGRAM_STATE_DIR='${lit}'; `
  }
  const cmdEscaped = t.replace(/"/g, '""')
  return `set "TELEGRAM_STATE_DIR=${cmdEscaped}"&& `
}

/** [2026-04-23] 原固定 `claude\\r`；现按设置附加 --permission-mode（Claude Code 官方 CLI）
 * [2026-04-23] resume 时使用官方 `claude --continue`（当前 cwd 接上最近一次会话）；原先就绪后再发 `/resume` 常打开会话选择器，无法等价于 `--continue`。 */
function claudeLaunchLine(
  settings: ClaudeSettings,
  isWindows: boolean,
  opts?: {
    continueSession?: boolean
    telegramChannelEnabled?: boolean
    /** [2026-05-09] ~/.claude/channels/<id> 绝对路径，与 telegramChannelEnabled 同时为真时写入启动行前缀 */
    telegramStateDirAbs?: string
    /** [2026-05-09] PTY 使用的 shell，用于 Windows 下 cmd / PowerShell / Git Bash 语法分支 */
    ptyShell?: string
  }
): string {
  const mode = settings.permissionPreset ?? DEFAULT_SETTINGS.permissionPreset
  let line = `claude --permission-mode ${mode}`
  if (opts?.continueSession) {
    line += ' --continue'
  }
  if (opts?.telegramChannelEnabled) {
    /* [2026-05-08] 官方 Telegram Channel：插件负责长轮询/配对；模型调用仍走当前 Claude Code 环境变量。 */
    line += ' --channels plugin:telegram@claude-plugins-official'
  }
  const addDir = resolveClaudeAddDir(settings).trim()
  if (addDir) {
    line += ` --add-dir ${quoteAddDirPath(addDir, isWindows)}`
  }
  const prefix =
    opts?.telegramChannelEnabled && opts.telegramStateDirAbs
      ? shellTelegramStateDirPrefix(opts.telegramStateDirAbs, isWindows, opts.ptyShell ?? (isWindows ? 'cmd.exe' : ''))
      : ''
  return `${prefix}${line}\r`
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
  /** [2026-05-08] 与会话创建时 prepareTelegramChannel.launchEnabled 一致；shell 误判或 Claude 退出后的自动重跑须沿用，否则会丢掉 --channels */
  telegramChannelLaunchEnabled: boolean
  /** [2026-05-09] 供 claude 启动行再次注入 TELEGRAM_STATE_DIR（子进程未继承 PTY env 时仍指向正确 channels 子目录） */
  telegramStateDirAbs?: string
  /** [2026-05-09] 创建 PTY 时使用的 shell 路径，重跑 claude 时与首启语法一致 */
  ptyShell: string
  /** [2026-05-06] daemon mode: socket connection instead of direct PTY */
  daemonSocket?: net.Socket
  daemonStatePath?: string
}

interface PreparedTelegramChannel {
  config?: TelegramChannelSessionConfig
  env?: Record<string, string>
  launchEnabled: boolean
  /** [2026-05-09] 与 env.TELEGRAM_STATE_DIR 相同；仅 launchEnabled 时存在 */
  stateDirAbs?: string
}

function sanitizeTelegramStateId(value: string): string {
  const safe = value.trim().toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/-+/g, '-')
  return safe || `telegram-${Date.now()}`
}

/** [2026-05-08] 新建会话：启用后以 botPresets[0] 为准（无则回落旧版 defaultBotToken） */
function defaultTelegramFromGlobal(
  global: NonNullable<ClaudeSettings['telegramChannel']>
): TelegramChannelSessionConfig | undefined {
  if (!global.enabled) return undefined
  const tok =
    global.botPresets?.[0]?.botToken?.trim() || global.defaultBotToken?.trim()
  if (!tok) return undefined
  const stateRaw =
    global.botPresets?.[0]?.stateDirId?.trim() ||
    global.defaultStateDirId?.trim() ||
    'telegram'
  return {
    enabled: true,
    botToken: tok,
    stateDirId: stateRaw || 'telegram'
  }
}

function telegramStateDir(id: string): string {
  /* [2026-05-08] 原 join(getConfigDir(), 'telegram-channels', …)，文件落在 AppData\…\feng-claude\telegram-channels，
   * 用户按官方说明查看 %USERPROFILE%\.claude\channels\telegram 会认为「没自动生成」；插件与文档也以 ~/.claude/channels 为惯例。 */
  return join(homedir(), '.claude', 'channels', sanitizeTelegramStateId(id))
}

/** [2026-05-09] 非 Telegram 会话隔离目录：避免插件回落默认 channels/telegram 抢占长轮询 */
function nonChannelTelegramStateDir(sessionId: string): string {
  return telegramStateDir(`_feng_nonchannel_${sessionId}`)
}

/** [2026-06-13] 检查 pid 对应的进程是否为 telegram bot（包含 "telegram" 关键字）。
 *  防止 PID 复用：OS 复用已死的 bot PID 给无关进程时，不应保留 stale pid。 */
function isTelegramBotProcess(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/format:list'], { encoding: 'utf8', timeout: 3000 })
      return r.stdout?.toLowerCase().includes('telegram') ?? false
    } else {
      const r = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', timeout: 3000 })
      return r.stdout?.toLowerCase().includes('telegram') ?? false
    }
  } catch { return false }
}

/**
 * [2026-06-15] 枚举并 kill 所有 telegram 插件相关的 bun 进程。
 *
 * 背景：插件 start = `bun install && bun server.ts`，从插件目录（.../claude-plugins-official/telegram/<ver>）启动。
 *   - launcher 进程命令行含 `claude-plugins-official`
 *   - 实际 channel server 命令行仅为 `bun server.ts`（不含插件路径，cwd 才是插件目录）
 * bot.pid 只记录单个 server PID，一旦出现「bot.pid 不知道的孤儿 server.ts」（多次启动/异常退出残留），
 * 多个 server 抢同一 Telegram token 的 getUpdates → 409 冲突 → 插件报 -32000。
 *
 * 注意：所有 token 的 bot 都跑同一份 `bun server.ts`，命令行无法区分 token，因此本函数会清掉**全部** telegram
 * 插件 bun 进程。仅用于用户显式触发的「强制重连」恢复动作，不在常规启动路径调用，避免误杀其它 token 的 bot。
 *
 * @returns 清掉的进程数（失败返回 0）
 */
function killTelegramPluginBunProcesses(): number {
  try {
    if (process.platform === 'win32') {
      const psCmd =
        "$p = Get-CimInstance Win32_Process -Filter \"Name='bun.exe'\"; " +
        "$t = $p | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'claude-plugins-official' -or $_.CommandLine -match 'server\\.ts\\s*$') }; " +
        "$t | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }; " +
        "($t | Measure-Object).Count"
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        encoding: 'utf8', timeout: 8000, windowsHide: true
      })
      return parseInt((r.stdout || '0').trim(), 10) || 0
    } else {
      // Unix：命令行含插件路径，或 bun 跑 server.ts
      spawnSync('pkill', ['-f', 'claude-plugins-official/telegram'], { encoding: 'utf8', timeout: 5000 })
      spawnSync('pkill', ['-f', 'bun.*server\\.ts'], { encoding: 'utf8', timeout: 5000 })
      return 1
    }
  } catch {
    return 0
  }
}

/** [2026-06-13] bot.pid 里的进程已死、或非 telegram 进程时删除（防止 PID 复用导致误保留） */
function cleanStaleBotPid(dir: string): void {
  const pidFile = join(dir, 'bot.pid')
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
    if (isNaN(pid)) { unlinkSync(pidFile); return }
    let alive = false
    try { process.kill(pid, 0); alive = true } catch { /* 进程已死 */ }
    if (!alive || !isTelegramBotProcess(pid)) {
      unlinkSync(pidFile) // 已死或 PID 被复用：删除残留
    }
  } catch { /* 文件不存在，忽略 */ }
}

/** [2026-06-15] 与 prepareTelegramChannel 一致地推导 token 的 stateDirId（供启动前跨实例锁检查复用） */
function resolveTelegramStateDirId(
  settings: ClaudeSettings,
  requested?: TelegramChannelSessionConfig
): { stateDirId: string; token?: string } {
  const global = settings.telegramChannel
  const config = requested ?? (global ? defaultTelegramFromGlobal(global) : undefined)
  if (!config) return { stateDirId: 'telegram' }
  const legacyGlobal = (config as TelegramChannelSessionConfig).useGlobalDefault === true
  const token = (legacyGlobal ? global?.defaultBotToken : config.botToken)?.trim()
  const stateDirId =
    config.stateDirId?.trim() ||
    (token ? `telegram-${createHash('md5').update(token).digest('hex').slice(0, 8)}` : 'telegram')
  return { stateDirId, token }
}

/**
 * [2026-06-15] 跨实例 Telegram owner 锁：lock 文件记录持有的「app 主进程 pid」。
 * 多窗口 = 多个独立 app 实例，各自内存锁互不可见；用文件锁让同一 token 全局只有一个实例轮询，
 * 避免多个 server.ts 抢同一 getUpdates（409 / -32000 / 消息投递到错误窗口）。
 * 锁有效性 = 持有 pid 仍存活；持有实例崩溃/退出后 pid 死亡 → 锁自动失效，可被接管。
 */
interface TelegramOwnerLock { pid: number; sessionId: string; ts: number }
function telegramOwnerLockFile(stateDir: string): string {
  return join(stateDir, 'feng-owner.lock')
}
function readTelegramOwnerLock(stateDir: string): TelegramOwnerLock | null {
  try {
    const o = JSON.parse(readFileSync(telegramOwnerLockFile(stateDir), 'utf8'))
    if (typeof o?.pid === 'number') return o as TelegramOwnerLock
  } catch { /* 无锁文件 */ }
  return null
}
/** 该 token 是否被「另一个仍存活的 app 实例」持有 */
function isTelegramOwnedByOtherInstance(stateDir: string): boolean {
  const lock = readTelegramOwnerLock(stateDir)
  if (!lock || lock.pid === process.pid) return false
  try { process.kill(lock.pid, 0) } catch { return false } // 持有进程已死 → 锁失效
  return true
}
function writeTelegramOwnerLock(stateDir: string, sessionId: string): void {
  try {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      telegramOwnerLockFile(stateDir),
      JSON.stringify({ pid: process.pid, sessionId, ts: Date.now() } as TelegramOwnerLock),
      'utf8'
    )
  } catch { /* ignore */ }
}
/** 释放锁：默认仅当本实例持有时删除；force=true 时无条件删除（强制重连夺锁用） */
function clearTelegramOwnerLock(stateDir: string, force = false): void {
  try {
    if (!force) {
      const lock = readTelegramOwnerLock(stateDir)
      if (lock && lock.pid !== process.pid) return
    }
    unlinkSync(telegramOwnerLockFile(stateDir))
  } catch { /* ignore */ }
}

/** [2026-05-09] 非 Telegram 会话显式去 token 化：确保插件拿不到历史 .env / bot.pid */
function ensureTokenlessTelegramStateDir(absDir: string): void {
  try {
    mkdirSync(absDir, { recursive: true })
    try { unlinkSync(join(absDir, '.env')) } catch { /* may not exist */ }
    try { unlinkSync(join(absDir, 'bot.pid')) } catch { /* may not exist */ }
  } catch (e) {
    console.warn('[telegram-channel] failed to prepare tokenless dir:', absDir, e)
  }
}

/** [2026-06-03] 判断该 session 是否会尝试启用 Telegram channel（不实际创建目录） */
function preparedWouldEnableTelegram(
  _sessionId: string,
  settings: ClaudeSettings,
  requested?: TelegramChannelSessionConfig,
  shellOnly?: boolean
): boolean {
  if (shellOnly) return false
  const config = requested ?? (settings.telegramChannel ? defaultTelegramFromGlobal(settings.telegramChannel) : undefined)
  if (!config?.enabled) return false
  const token = (config.botToken ?? settings.telegramChannel?.defaultBotToken)?.trim()
  return !!token
}

function prepareTelegramChannel(
  sessionId: string,
  settings: ClaudeSettings,
  requested?: TelegramChannelSessionConfig,
  shellOnly?: boolean
): PreparedTelegramChannel {
  const isolatedDir = nonChannelTelegramStateDir(sessionId)
  if (shellOnly) {
    ensureTokenlessTelegramStateDir(isolatedDir)
    return {
      config: requested,
      env: { TELEGRAM_STATE_DIR: isolatedDir },
      launchEnabled: false,
      stateDirAbs: isolatedDir
    }
  }
  const global = settings.telegramChannel
  /* [2026-05-08] 原 enableForNewSessions + 首条预设：改为 enabled + defaultTelegramFromGlobal */
  const config = requested ?? (global ? defaultTelegramFromGlobal(global) : undefined)
  if (!config) {
    ensureTokenlessTelegramStateDir(isolatedDir)
    return {
      env: { TELEGRAM_STATE_DIR: isolatedDir },
      launchEnabled: false,
      stateDirAbs: isolatedDir
    }
  }
  if (!config.enabled) {
    ensureTokenlessTelegramStateDir(isolatedDir)
    return {
      config,
      env: { TELEGRAM_STATE_DIR: isolatedDir },
      launchEnabled: false,
      stateDirAbs: isolatedDir
    }
  }
  const legacyGlobal = (config as TelegramChannelSessionConfig).useGlobalDefault === true
  const token = (legacyGlobal ? global?.defaultBotToken : config.botToken)?.trim()
  /*
   * [2026-05-09] 原 || 'telegram'：两个不同 bot token 若都未填 stateDirId，共享同一目录；
   * bot2 会用自己的 token 覆盖 .env 并删除 bot.pid，导致 bot1 长轮询断开。
   * 改为以 token 末 8 位哈希自动生成唯一目录，不同 token 互不干扰。
   * 显式填写 stateDirId 的场景继续沿用用户配置，向后兼容。
   */
  const stateDirId =
    config.stateDirId?.trim() ||
    (token
      ? `telegram-${createHash('md5').update(token).digest('hex').slice(0, 8)}`
      : 'telegram')
  const effectiveConfig: TelegramChannelSessionConfig = {
    ...config,
    stateDirId
  }
  if (!token) {
    console.warn('[telegram-channel] enabled but bot token is empty; channel launch skipped')
    ensureTokenlessTelegramStateDir(isolatedDir)
    return {
      config: effectiveConfig,
      env: { TELEGRAM_STATE_DIR: isolatedDir },
      launchEnabled: false,
      stateDirAbs: isolatedDir
    }
  }
  const dir = telegramStateDir(stateDirId)
  console.log('[telegram-channel] prepare', {
    sessionId,
    stateDirId,
    dir,
    tokenPreview: token.slice(0, 12) + '...',
    requestedBotToken: (requested?.botToken ?? '').slice(0, 12) + '...',
    requestedStateDirId: requested?.stateDirId
  })
  try {
    mkdirSync(dir, { recursive: true })
    /* [2026-05-08] 官方插件固定读取 TELEGRAM_STATE_DIR/.env；仅写入用户配置目录，避免 token 进仓库。 */
    writeFileSync(join(dir, '.env'), `TELEGRAM_BOT_TOKEN=${token}\n`, 'utf8')
    /* [2026-06-13] 仅清除已死进程的 bot.pid，避免误删正在运行的 bot。 */
    cleanStaleBotPid(dir)
  } catch (e) {
    console.warn('[telegram-channel] failed to prepare state dir:', e)
    ensureTokenlessTelegramStateDir(isolatedDir)
    return {
      config: effectiveConfig,
      env: { TELEGRAM_STATE_DIR: isolatedDir },
      launchEnabled: false,
      stateDirAbs: isolatedDir
    }
  }
  /* [2026-05-09] 旧逻辑仅在 launchEnabled 时设置 TELEGRAM_STATE_DIR，导致其它会话回落到 channels/telegram 干扰 bot1/bot2。 */
  // return {
  //   config: effectiveConfig,
  //   env: {
  //     TELEGRAM_STATE_DIR: dir,
  //     TELEGRAM_BOT_TOKEN: token
  //   },
  //   launchEnabled: true,
  //   stateDirAbs: dir
  // }
  return {
    config: effectiveConfig,
    env: {
      TELEGRAM_STATE_DIR: dir,
      TELEGRAM_BOT_TOKEN: token
    },
    launchEnabled: true,
    stateDirAbs: dir
  }
}

// ── Telegram pending-update drain ─────────────────────────────────────
/**
 * [2026-05-09] 每次新建 session 前清空 Telegram 积压消息。
 * grammy bot.start() 不带 drop_pending_updates=true，重启后从 offset=0 重拉所有未确认消息，
 * 全部堆给 Claude → 每条新消息打断上一条 → "Interrupted" 死循环。
 * 修复：先调 getUpdates?offset=-1 拿最新 update_id，再用 offset+1 确认所有旧消息，
 * 之后 plugin 启动时队列已清空，只会收到新消息。
 */
function drainTelegramPendingUpdates(token: string): Promise<void> {
  const apiBase = `https://api.telegram.org/bot${token}`
  const doGet = (path: string): Promise<string> =>
    new Promise((resolve) => {
      const req = httpsRequest(`${apiBase}${path}`, (res) => {
        let buf = ''
        res.on('data', (c: Buffer) => { buf += c.toString() })
        res.on('end', () => resolve(buf))
      })
      req.on('error', () => resolve(''))
      req.setTimeout(6000, () => { req.destroy(); resolve('') })
      req.end()
    })

  return doGet('/getUpdates?offset=-1&limit=1&timeout=0').then((raw) => {
    try {
      const parsed = JSON.parse(raw)
      if (!parsed.ok || !parsed.result?.length) return
      const latestId: number = parsed.result[parsed.result.length - 1].update_id
      console.log(`[telegram-channel] drain: latest update_id=${latestId}, acknowledging...`)
      return doGet(`/getUpdates?offset=${latestId + 1}&limit=1&timeout=0`).then(() => {
        console.log('[telegram-channel] drain: done, queue cleared')
      })
    } catch {
      // 解析失败忽略，不影响正常启动
    }
  })
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
  /** [2026-06-03] 同时只允许一个 session 持有 Telegram channel，防止多个 Claude 进程争抢同一 bot 消息 */
  private telegramOwnerSessionId: string | null = null

  constructor(win: BrowserWindow, settingsStore: SettingsStore) {
    this.win = win
    this.settingsStore = settingsStore
  }

  /** 当前持有 Telegram channel 的 sessionId（供 IPC 查询） */
  getTelegramOwnerSessionId(): string | null {
    return this.telegramOwnerSessionId
  }

  async createSession(
    sessionId: string,
    workdir: string,
    profile: ApiProfile,
    settings?: ClaudeSettings,
    resume?: boolean,
    shellOnly?: boolean,
    telegramChannel?: TelegramChannelSessionConfig
  ): Promise<{ pid: number; telegramChannel?: TelegramChannelSessionConfig }> {
    const s = settings ?? this.settingsStore.get()
    // [2026-07-08] macOS 上 workdir 不存在时 posix_spawn 会失败（posix_spawnp failed）。
    // [2026-07-09] 增强检查：确保是目录而非文件，否则回退到 home 目录。
    let resolvedWorkdir = homedir()
    try {
      const stat = require('fs').statSync(workdir)
      if (stat.isDirectory()) {
        resolvedWorkdir = workdir
      } else {
        console.warn('[PTY] workdir is not a directory, falling back to home:', workdir)
      }
    } catch {
      console.warn('[PTY] workdir not found, falling back to home:', workdir, '→', resolvedWorkdir)
    }
    // [2026-06-11] 仅当该目录确有 Claude 对话历史时才 --continue：
    // 无历史时带 --continue 会报 "No conversation found to continue" 并退回空 shell
    // （依赖事后检测降级，但叠加 --channels/--add-dir 等启动行时降级时序不稳定）。
    const effectiveResume = !!resume && hasClaudeConversationHistory(join(homedir(), '.claude'), workdir)
    if (resume && !effectiveResume) {
      console.log('[PTY] resume requested but no conversation history for', workdir, '— launching without --continue')
    }
    // [2026-06-01] 代理仅对全局激活配置生效：代理服务器只读 activeProfileId，
    // 非全局配置的 session 直接使用 profile 自身的 baseUrl，避免多配置时 baseUrl 被全局覆盖。
    const isGlobalActiveProfile = profile.id === s.activeProfileId || profile.isOfficial === true
    const proxyUrl = (s.enableApiProxy && isGlobalActiveProfile) ? `http://127.0.0.1:${getProxyPort()}` : undefined
    const claudeEnv = this.settingsStore.profileToEnvWithProxy(profile, proxyUrl)
    // [2026-06-01] 诊断日志：确认实际注入的 model 环境变量（排查多配置混用问题）
    console.log('[PTY] createSession profile:', profile.name, profile.id, {
      ANTHROPIC_MODEL: claudeEnv.ANTHROPIC_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: claudeEnv.ANTHROPIC_DEFAULT_SONNET_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: claudeEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: claudeEnv.ANTHROPIC_DEFAULT_OPUS_MODEL,
    })

    const isWindows = process.platform === 'win32'
    const customShell = s.terminal?.shell?.trim()
    let shell = customShell || (isWindows ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh'))

    // [2026-07-10] 验证 shell 是否存在，避免 posix_spawnp 失败
    if (!isWindows && shell && !existsSync(shell)) {
      console.warn('[PTY] shell not found:', shell, '— trying fallback')
      const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh']
      shell = fallbacks.find(fb => existsSync(fb)) || '/bin/sh'
      console.log('[PTY] using fallback shell:', shell)
    }

    // [2026-06-03] Telegram 单会话锁：已有其他 session 持有 bot，则本 session 用隔离目录，避免多进程争抢同一 Telegram bot
    // [2026-06-15] 增加跨实例文件锁：多窗口=多 app 实例，内存锁互不可见；同一 token 全局只允许一个实例轮询
    let effectiveTelegramChannel = telegramChannel
    if (preparedWouldEnableTelegram(sessionId, s, telegramChannel, shellOnly)) {
      const { stateDirId } = resolveTelegramStateDirId(s, telegramChannel)
      const tokenStateDir = telegramStateDir(stateDirId)
      const sameInstanceBlocked = !!(this.telegramOwnerSessionId && this.telegramOwnerSessionId !== sessionId && this.sessions.has(this.telegramOwnerSessionId))
      const otherInstanceOwns = this.telegramOwnerSessionId !== sessionId && isTelegramOwnedByOtherInstance(tokenStateDir)
      if (sameInstanceBlocked || otherInstanceOwns) {
        console.log('[telegram-channel] session', sessionId, 'blocked —',
          sameInstanceBlocked ? ('in-instance owner ' + this.telegramOwnerSessionId) : 'another app instance owns this token')
        effectiveTelegramChannel = { ...(telegramChannel ?? defaultTelegramFromGlobal(s.telegramChannel!)!), enabled: false }
      } else {
        this.telegramOwnerSessionId = sessionId
        writeTelegramOwnerLock(tokenStateDir, sessionId)
        console.log('[telegram-channel] session', sessionId, 'acquired Telegram owner lock (pid', process.pid, ')')
      }
    }
    const preparedTelegram = prepareTelegramChannel(sessionId, s, effectiveTelegramChannel, shellOnly)

    // [2026-05-09] 清空 Telegram 积压队列，防止旧消息在 bot 启动后被重新投递导致「Interrupted」级联
    if (preparedTelegram.launchEnabled && preparedTelegram.env?.TELEGRAM_BOT_TOKEN) {
      try {
        await drainTelegramPendingUpdates(preparedTelegram.env.TELEGRAM_BOT_TOKEN)
      } catch (e) {
        console.warn('[telegram-channel] drain failed (non-fatal):', e)
      }
    }

    const ptyEnv = {
      ...buildPtyEnv(claudeEnv, profile.isOfficial === true, sessionId),
      // [2026-05-29] 禁止 Claude Code 自动更新（防止降级后被自动升回）
      ...(s.disableAutoUpdate ? { DISABLE_AUTOUPDATER: '1' } : {}),
      ...(preparedTelegram.env ?? {})
    }
    // [2026-06-12] 登记 session→workdir，供调试浏览器 routine 按项目存取
    registerSessionWorkdir(sessionId, workdir)

    // [2026-05-06] Daemon mode: shell survives Electron restart on all platforms
    if (shellOnly && s.terminal?.useTmux) {
      // [2026-07-09] 用 resolvedWorkdir 而非原始 workdir，确保 daemon 路径也受 workdir 不存在时的 home 回退保护
      const result = await this.createDaemonSession(sessionId, resolvedWorkdir, shell, ptyEnv)
      return { ...result, telegramChannel: preparedTelegram.config }
    }

    // [2026-07-10] 诊断日志：posix_spawnp 失败时查看实际参数
    console.log('[PTY] spawn params:', {
      shell,
      shellExists: existsSync(shell),
      cwd: resolvedWorkdir,
      cwdExists: existsSync(resolvedWorkdir),
      customShell: customShell,
      envSHELL: process.env.SHELL,
      platform: process.platform
    })

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: resolvedWorkdir,
      env: ptyEnv,
      ...getWindowsPtySpawnExtras()
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
      usedContinue: effectiveResume,
      continueFallbackDone: false,
      telegramChannelLaunchEnabled: preparedTelegram.launchEnabled,
      telegramStateDirAbs: preparedTelegram.stateDirAbs,
      ptyShell: shell
    }

    // [2026-05-06] Shell-only 会话不自动启动 Claude Code，直接保持 shell 状态
    if (!shellOnly) {
      setTimeout(() => {
        session.firstAutoLaunchAt = Date.now()
        ptyProcess.write(claudeLaunchLine(s, isWindows, {
          continueSession: effectiveResume,
          telegramChannelEnabled: session.telegramChannelLaunchEnabled,
          telegramStateDirAbs: session.telegramStateDirAbs,
          ptyShell: session.ptyShell
        }))
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
            ptyProcess.write(claudeLaunchLine(settings, process.platform === 'win32', {
              telegramChannelEnabled: session.telegramChannelLaunchEnabled,
              telegramStateDirAbs: session.telegramStateDirAbs,
              ptyShell: session.ptyShell
            }))
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
            /* [2026-05-08] 原仅 claudeLaunchLine(settings, platform)，未带 telegramChannelEnabled，
             * 首次启动若很快出现类似 cmd 提示符的输出，会误判「已回 shell」并在 ~500ms 再写一行 claude，
             * 该行丢失 --channels，用户误以为 Telegram Channel 从未启用。 */
            ptyProcess.write(claudeLaunchLine(settings, process.platform === 'win32', {
              telegramChannelEnabled: session.telegramChannelLaunchEnabled,
              telegramStateDirAbs: session.telegramStateDirAbs,
              ptyShell: session.ptyShell
            }))
          }
        }, 500)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (!this.win.isDestroyed()) {
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
      if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, session)
    return { pid: ptyProcess.pid, telegramChannel: preparedTelegram.config }
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
      telegramChannelLaunchEnabled: false,
      ptyShell: shell,
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
      if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
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
      if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
      this.sessions.delete(sessionId)
      throw new Error('[pty-daemon] Timed out waiting for daemon to start')
    }

    const socket = await tryConnectDaemon(state.pipe)
    if (!socket) {
      if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
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
            if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
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
        if (this.telegramOwnerSessionId === sessionId) this.telegramOwnerSessionId = null
      this.sessions.delete(sessionId)
      }
    })

    socket.on('error', () => { try { socket.destroy() } catch { /* ignore */ } })
  }

  // [2026-06-04] ConPTY 单次写入缓冲约 4KB，超出会截断；分块写入避免丢字
  private static readonly PASTE_CHUNK = 2048

  private writeRaw(session: { daemonSocket?: import('net').Socket | null; ptyProcess?: import('node-pty').IPty | null }, data: string): void {
    if (session.daemonSocket) {
      session.daemonSocket.write(JSON.stringify({ t: 'i', d: data }) + '\n')
    } else {
      try {
        session.ptyProcess?.write(data)
      } catch (e) {
        if (e instanceof Error && (e as any).code === 'EPIPE') return
        throw e
      }
    }
  }

  private writeChunked(session: { daemonSocket?: import('net').Socket | null; ptyProcess?: import('node-pty').IPty | null }, data: string): void {
    const CHUNK = PtyManager.PASTE_CHUNK
    const BP_START = '\x1b[200~'
    const BP_END = '\x1b[201~'

    // Bracketed paste：每块独立包裹，避免 shell 收到破损的 BP 序列
    const isBP = data.startsWith(BP_START) && data.endsWith(BP_END)
    const inner = isBP ? data.slice(BP_START.length, data.length - BP_END.length) : data

    const chunks: string[] = []
    for (let i = 0; i < inner.length; i += CHUNK) {
      const part = inner.slice(i, i + CHUNK)
      chunks.push(isBP ? BP_START + part + BP_END : part)
    }

    this.writeRaw(session, chunks[0])
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i]
      setTimeout(() => { this.writeRaw(session, chunk) }, i * 15)
    }
  }

  sendInput(
    sessionId: string,
    data: string
  ): { ok: boolean; via?: 'daemon' | 'pty'; bytes: number; reason?: string } {
    const bytes = Buffer.byteLength(data ?? '', 'utf8')
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { ok: false, bytes, reason: 'session_not_found' }
    }
    try {
      const via: 'daemon' | 'pty' = session.daemonSocket ? 'daemon' : 'pty'
      if (data.length > PtyManager.PASTE_CHUNK) {
        this.writeChunked(session, data)
      } else {
        this.writeRaw(session, data)
      }
      return { ok: true, via, bytes }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false, bytes, reason }
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.daemonSocket) {
      session.daemonSocket.write(JSON.stringify({ t: 'r', c: cols, r: rows }) + '\n')
    } else {
      try { session.ptyProcess?.resize(cols, rows) } catch { /* ignore if process already exited */ }
    }
  }

  /** [2026-06-13] 强制重连 Telegram bot：kill 旧 bun → 删 bot.pid → 向 PTY 写 /plugin\r
   *  [2026-06-15] 不再只 kill bot.pid 里的单个 PID：枚举并清掉所有 telegram 插件 bun 进程（含 bot.pid
   *  追踪不到的孤儿 server.ts），根治多 server 抢同一 token 导致的 -32000 冲突。 */
  telegramForceReconnect(sessionId: string): { ok: boolean; error?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) return { ok: false, error: 'session not found' }
    const stateDir = session.telegramStateDirAbs
    if (!stateDir) return { ok: false, error: 'no telegram state dir for this session' }
    // 全量清掉 telegram 插件 bun 进程（launcher + 孤儿 server.ts）
    const killed = killTelegramPluginBunProcesses()
    console.log('[telegram-channel] force-reconnect killed bun processes:', killed)
    const pidFile = join(stateDir, 'bot.pid')
    try {
      const pidStr = readFileSync(pidFile, 'utf8').trim()
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid) && pid > 1) {
        try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
      }
      try { unlinkSync(pidFile) } catch { /* may not exist */ }
    } catch { /* no pid file, ok */ }
    // [2026-06-15] 夺取跨实例 owner 锁：让「执行强制重连的这个窗口」成为新 owner，
    // 其它实例下次启动会看到锁被本实例持有而退避，消息从此只投递到本窗口。
    clearTelegramOwnerLock(stateDir, true)
    this.telegramOwnerSessionId = sessionId
    writeTelegramOwnerLock(stateDir, sessionId)
    // 写 /plugin\r 触发 Claude Code 重连 MCP
    const pty = session.ptyProcess
    if (!pty && !session.daemonSocket) {
      return { ok: false, error: 'no active pty' }
    }
    /* [2026-06-15] 延时再写 /plugin：刚 kill 的旧 server 需要几秒释放 Telegram getUpdates 轮询槽，
     * 否则新连接仍可能撞 409 → -32000。延迟 2.5s 让 Telegram 侧释放。 */
    setTimeout(() => {
      const s = this.sessions.get(sessionId)
      if (!s) return
      if (s.ptyProcess) {
        s.ptyProcess.write('/plugin\r')
      } else if (s.daemonSocket) {
        s.daemonSocket.write(JSON.stringify({ type: 'input', data: '/plugin\r' }) + '\n')
      }
    }, 2500)
    return { ok: true }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      if (session.daemonSocket) {
        // Daemon sessions: disconnect but leave daemon running
        try { session.daemonSocket.destroy() } catch { /* ignore */ }
      } else {
        this.flushScrollback(session)
        const proc = session.ptyProcess
        if (proc) {
          if (process.platform === 'win32') {
            /* [2026-05-08] 先整树 taskkill 再 kill PTY：先 kill PTY 时 shell 已死，/T 可能对已孤儿化的 Bun 无效 */
            killWindowsPtyProcessTree(proc.pid)
            try { proc.kill() } catch { /* already dead */ }
          } else {
            try { proc.kill() } catch { /* already dead */ }
          }
        }
      }
      // [2026-06-15] 释放 owner：清内存锁 + 删跨实例文件锁（让其它窗口可接管）
      if (this.telegramOwnerSessionId === sessionId) {
        this.telegramOwnerSessionId = null
        if (session.telegramChannelLaunchEnabled && session.telegramStateDirAbs) {
          clearTelegramOwnerLock(session.telegramStateDirAbs)
        }
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
