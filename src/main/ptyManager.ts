import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'

interface PtySession {
  id: string
  ptyProcess: pty.IPty
  workdir: string
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
  }

  createSession(sessionId: string, workdir: string): { pid: number } {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd.exe' : (process.env.SHELL ?? 'bash')

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workdir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Ensure claude is found even if PATH is minimal
        PATH: process.env.PATH
      } as Record<string, string>
    })

    // Auto-launch claude CLI after shell is ready
    setTimeout(() => {
      ptyProcess.write('claude\r')
    }, 300)

    ptyProcess.onData((data: string) => {
      if (this.win.isDestroyed()) return
      this.win.webContents.send(IPC.PTY_OUTPUT, {
        sessionId,
        data,
        timestamp: Date.now()
      })
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

    this.sessions.set(sessionId, { id: sessionId, ptyProcess, workdir })
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
