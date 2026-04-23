import * as pty from 'node-pty'
import { join } from 'path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { ClaudeSettings, SettingsStore } from './settingsStore'
import { DEFAULT_SETTINGS } from './settingsStore'

// Detect cmd.exe shell prompt: any path ending with ">"
// e.g. "E:\git3\claude-gui>" or "C:\Users\foo>"
const SHELL_PROMPT_RE = /[A-Za-z]:\\[^\r\n]*>\s*$/m

// Isolated config dir: <userData>/claude-session
// Prevents conflict with the user's global ~/.claude OAuth login
const CLAUDE_CONFIG_DIR = join(app.getPath('userData'), 'claude-session')

/** [2026-04-23] 原固定 `claude\\r`；现按设置附加 --permission-mode（Claude Code 官方 CLI） */
function claudeLaunchLine(settings: ClaudeSettings): string {
  const mode = settings.permissionPreset ?? DEFAULT_SETTINGS.permissionPreset
  return `claude --permission-mode ${mode}\r`
}

interface PtySession {
  id: string
  ptyProcess: pty.IPty
  workdir: string
  claudeRunning: boolean
  buffer: string
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
      env: {
        ...process.env,
        ...claudeEnv,
        CLAUDE_CONFIG_DIR,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PATH: process.env.PATH
      } as Record<string, string>
    })

    // Auto-launch claude CLI after shell is ready
    setTimeout(() => {
      ptyProcess.write(claudeLaunchLine(s))
    }, 300)

    const session: PtySession = { id: sessionId, ptyProcess, workdir, claudeRunning: true, buffer: '' }

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
      if (session.claudeRunning && SHELL_PROMPT_RE.test(session.buffer)) {
        session.claudeRunning = false
        session.buffer = ''
        // Re-launch claude after a short delay
        setTimeout(() => {
          if (this.sessions.has(sessionId)) {
            session.claudeRunning = true
            const settings = this.settingsStore.get()
            ptyProcess.write(claudeLaunchLine(settings))
          }
        }, 500)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (!this.win.isDestroyed()) {
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
