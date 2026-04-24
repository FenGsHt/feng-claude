import * as pty from 'node-pty'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { ClaudeSettings, SettingsStore } from './settingsStore'
import { DEFAULT_SETTINGS } from './settingsStore'
import { claudeSessionConfigDir } from './claudeSessionConfigDir'

// Detect cmd.exe shell prompt: any path ending with ">"
// e.g. "E:\git3\claude-gui>" or "C:\Users\foo>"
const SHELL_PROMPT_RE = /[A-Za-z]:\\[^\r\n]*>\s*$/m

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
    /* 隔离配置目录，避免与全局 ~/.claude OAuth 冲突；与 claudeSessionConfigDir() 一致 */
    CLAUDE_CONFIG_DIR: claudeSessionConfigDir(),
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
 * 2. 仅打包版：resources 目录下存在 `.claude` / `.claude/skills`（可与 app.asar 同层放技能）
 * 3. 仅打包版：可执行文件所在目录下存在 `.claude`（便携 exe 旁随包分发）
 */
function resolveClaudeAddDir(settings: ClaudeSettings): string {
  const manual = (settings.sharedSkillAddDir ?? DEFAULT_SETTINGS.sharedSkillAddDir).trim()
  if (manual) return manual

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

/** [2026-04-23] 原固定 `claude\\r`；现按设置附加 --permission-mode（Claude Code 官方 CLI） */
function claudeLaunchLine(settings: ClaudeSettings, isWindows: boolean): string {
  const mode = settings.permissionPreset ?? DEFAULT_SETTINGS.permissionPreset
  let line = `claude --permission-mode ${mode}`
  const addDir = resolveClaudeAddDir(settings).trim()
  if (addDir) {
    line += ` --add-dir ${quoteAddDirPath(addDir, isWindows)}`
  }
  return `${line}\r`
}

interface PtySession {
  id: string
  ptyProcess: pty.IPty
  workdir: string
  claudeRunning: boolean
  buffer: string
  /** Prevents scheduling multiple re-launches if shell prompt appears in rapid succession */
  relaunchPending: boolean
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()
  private win: BrowserWindow
  private settingsStore: SettingsStore

  constructor(win: BrowserWindow, settingsStore: SettingsStore) {
    this.win = win
    this.settingsStore = settingsStore
  }

  createSession(sessionId: string, workdir: string, settings?: ClaudeSettings): { pid: number } {
    const s = settings ?? this.settingsStore.get()
    const claudeEnv = this.settingsStore.toEnv(s)

    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd.exe' : (process.env.SHELL ?? 'bash')

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workdir,
      env: buildPtyEnv(claudeEnv)
    })

    // Auto-launch claude CLI after shell is ready
    setTimeout(() => {
      ptyProcess.write(claudeLaunchLine(s, isWindows))
    }, 300)

    const session: PtySession = { id: sessionId, ptyProcess, workdir, claudeRunning: true, buffer: '', relaunchPending: false }

    ptyProcess.onData((data: string) => {
      if (this.win.isDestroyed()) return

      // Forward to renderer
      this.win.webContents.send(IPC.PTY_OUTPUT, {
        sessionId,
        data,
        timestamp: Date.now()
      })

      // Detect if we've dropped back to the shell prompt (claude exited)
      // Keep a rolling buffer of recent output to match multi-chunk prompts
      session.buffer = (session.buffer + data).slice(-256)
      if (session.claudeRunning && !session.relaunchPending && SHELL_PROMPT_RE.test(session.buffer)) {
        session.claudeRunning = false
        session.relaunchPending = true
        session.buffer = ''
        // Re-launch claude after a short delay
        setTimeout(() => {
          session.relaunchPending = false
          if (this.sessions.has(sessionId)) {
            session.claudeRunning = true
            const settings = this.settingsStore.get()
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

  sendInput(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.ptyProcess.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.ptyProcess.resize(cols, rows)
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      try {
        session.ptyProcess.kill()
      } catch {
        // already dead
      }
      this.sessions.delete(sessionId)
    }
  }

  closeAll(): void {
    for (const id of this.sessions.keys()) {
      this.closeSession(id)
    }
  }
}
