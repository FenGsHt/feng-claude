import chokidar, { FSWatcher } from 'chokidar'
import { existsSync, openSync, fstatSync, readSync, closeSync } from 'fs'
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
  /**
   * Byte offset into each JSONL file up to which we have already processed.
   * On each `change` event only the new bytes are read — avoids re-reading
   * the entire file every time Claude appends a line.
   */
  fileByteOffsets: Map<string, number>
  /** Path of the most recently seen JSONL — used to detect new claude sessions */
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
    const pattern = join(projectDir, '*.jsonl').replace(/\\/g, '/')

    const sw: SessionWatch = {
      sessionId,
      watcher: chokidar.watch(pattern, {
        ignoreInitial: true,
        persistent: true,
        // Wait for file to stabilise (avoids partial-line reads on rapid flushes)
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 80 }
      }),
      fileByteOffsets: new Map(),
      latestFile: null
    }

    sw.watcher.on('add', (filePath) => {
      // A new JSONL file means claude started a new conversation
      const isNewConversation = sw.latestFile !== null
      sw.latestFile = filePath
      sw.fileByteOffsets.set(filePath, 0)
      this.processNewBytes(sw, filePath, isNewConversation)
    })

    sw.watcher.on('change', (filePath) => {
      this.processNewBytes(sw, filePath, false)
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

  /**
   * Read only the bytes appended since last check, parse complete JSONL lines,
   * and emit token usage events. Partial trailing lines (no newline yet) are
   * skipped and will be included in the next call.
   */
  private processNewBytes(sw: SessionWatch, filePath: string, resetFirst: boolean): void {
    let fd: number | null = null
    try {
      if (!existsSync(filePath)) return

      fd = openSync(filePath, 'r')
      const { size: fileSize } = fstatSync(fd)
      const prevOffset = sw.fileByteOffsets.get(filePath) ?? 0

      if (fileSize <= prevOffset) return  // nothing new

      const newByteCount = fileSize - prevOffset
      const buf = Buffer.alloc(newByteCount)
      readSync(fd, buf, 0, newByteCount, prevOffset)

      const text = buf.toString('utf-8')

      // Only process up to the last complete newline — skip a partial trailing line
      const lastNL = text.lastIndexOf('\n')
      if (lastNL === -1) return  // no complete line yet

      const completeText = text.slice(0, lastNL + 1)
      // Advance offset by the actual byte length of the processed text
      sw.fileByteOffsets.set(filePath, prevOffset + Buffer.byteLength(completeText, 'utf-8'))

      const lines = completeText.split('\n').filter((l) => l.trim().length > 0)

      let needReset = resetFirst
      for (const line of lines) {
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
        needReset = false
      }
    } catch {
      // Silently ignore — file may be locked or malformed
    } finally {
      if (fd !== null) {
        try { closeSync(fd) } catch { /* ignore */ }
      }
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
