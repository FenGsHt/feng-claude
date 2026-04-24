import chokidar, { FSWatcher } from 'chokidar'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { TokenUsageUpdatePayload } from '../renderer/src/types/ipc'

export type { TokenUsageUpdatePayload }

/**
 * Claude Code project directory naming:
 *   Replace every `:`, `\`, `/` in the workdir path with `-`
 *   e.g. "E:\git3\claude-gui" → "E--git3-claude-gui"
 */
function workdirToProjectDirName(workdir: string): string {
  return workdir.replace(/[:\\/]/g, '-')
}

interface ClaudeJSONLEntry {
  type: string
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

interface ParsedUsage {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
}

interface SessionWatch {
  sessionId: string
  watcher: FSWatcher
  /** lines already processed per JSONL file */
  fileLineCounts: Map<string, number>
  /** path of the most recently seen JSONL — used to detect new claude sessions */
  latestFile: string | null
}

export class ClaudeSessionWatcher {
  private win: BrowserWindow
  private claudeConfigDir: string
  private sessions = new Map<string, SessionWatch>()

  constructor(win: BrowserWindow, claudeConfigDir: string) {
    this.win = win
    this.claudeConfigDir = claudeConfigDir
  }

  watchSession(sessionId: string, workdir: string): void {
    const projectDirName = workdirToProjectDirName(workdir)
    const projectDir = join(this.claudeConfigDir, 'projects', projectDirName)
    // Glob pattern: <projectDir>/*.jsonl (UUID-named conversation files)
    const pattern = join(projectDir, '*.jsonl').replace(/\\/g, '/')

    const sw: SessionWatch = {
      sessionId,
      watcher: chokidar.watch(pattern, {
        ignoreInitial: true,    // only watch NEW writes during this GUI session
        persistent: true,
        // Wait for file to stabilise before emitting (avoids partial-line reads)
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 80 }
      }),
      fileLineCounts: new Map(),
      latestFile: null
    }

    sw.watcher.on('add', (filePath) => {
      // A new JSONL file means claude started a new conversation
      const isNewConversation = sw.latestFile !== null
      sw.latestFile = filePath
      sw.fileLineCounts.set(filePath, 0)
      this.processNewLines(sw, filePath, isNewConversation)
    })

    sw.watcher.on('change', (filePath) => {
      this.processNewLines(sw, filePath, false)
    })

    this.sessions.set(sessionId, sw)
  }

  unwatchSession(sessionId: string): void {
    const sw = this.sessions.get(sessionId)
    if (sw) {
      void sw.watcher.close()
      this.sessions.delete(sessionId)
    }
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.unwatchSession(id)
    }
  }

  // ── private ────────────────────────────────────────────────

  private processNewLines(sw: SessionWatch, filePath: string, resetFirst: boolean): void {
    try {
      if (!existsSync(filePath)) return

      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      const prevCount = sw.fileLineCounts.get(filePath) ?? 0
      const newLines = lines.slice(prevCount)
      sw.fileLineCounts.set(filePath, lines.length)

      let needReset = resetFirst
      for (const line of newLines) {
        const usage = parseLine(line)
        if (!usage) continue

        this.emit({
          sessionId: sw.sessionId,
          input: usage.input,
          output: usage.output,
          cacheCreate: usage.cacheCreate,
          cacheRead: usage.cacheRead,
          reset: needReset
        })
        // Reset only fires on the first token event of the new conversation
        needReset = false
      }
    } catch {
      // Silently ignore — file may be locked or malformed
    }
  }

  private emit(payload: TokenUsageUpdatePayload): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.TOKEN_USAGE_UPDATE, payload)
    }
  }
}

// ── Pure helpers ─────────────────────────────────────────────

function parseLine(line: string): ParsedUsage | null {
  try {
    const entry = JSON.parse(line) as ClaudeJSONLEntry
    if (entry.type !== 'assistant') return null
    const u = entry.message?.usage
    if (!u) return null
    const input = Number(u.input_tokens ?? 0)
    const output = Number(u.output_tokens ?? 0)
    const cacheCreate = Number(u.cache_creation_input_tokens ?? 0)
    const cacheRead = Number(u.cache_read_input_tokens ?? 0)
    if (input + output + cacheCreate + cacheRead === 0) return null
    return { input, output, cacheCreate, cacheRead }
  } catch {
    return null
  }
}
