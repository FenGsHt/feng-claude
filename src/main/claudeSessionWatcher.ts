import { existsSync, openSync, fstatSync, readSync, closeSync, readdirSync, statSync } from 'fs'
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
  projectDir: string
  /**
   * Per-file byte offsets — only bytes beyond this position are processed.
   * Pre-populated with current sizes of files that existed at watcher-start
   * time so historical content is never re-counted.
   */
  fileByteOffsets: Map<string, number>
  /** Most recently seen JSONL file — used to detect a new claude conversation */
  latestFile: string | null
  timer: ReturnType<typeof setInterval> | null
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

    const sw: SessionWatch = {
      sessionId,
      projectDir,
      fileByteOffsets: new Map(),
      latestFile: null,
      timer: null
    }

    // Pre-populate byte offsets for files that already exist so we never
    // re-process historical token entries.
    this.scanExisting(sw)

    // Poll every 1 s — reliable on Windows where FSEvents can be flaky.
    sw.timer = setInterval(() => this.poll(sw), 1000)

    this.sessions.set(sessionId, sw)
  }

  unwatchSession(sessionId: string): void {
    const sw = this.sessions.get(sessionId)
    if (sw) {
      if (sw.timer) clearInterval(sw.timer)
      this.sessions.delete(sessionId)
    }
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.unwatchSession(id)
    }
  }

  // ── private ────────────────────────────────────────────────

  /** Record current sizes of all existing JSONL files as "already seen". */
  private scanExisting(sw: SessionWatch): void {
    try {
      if (!existsSync(sw.projectDir)) return
      let latestMtime = 0
      for (const entry of readdirSync(sw.projectDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const filePath = join(sw.projectDir, entry.name)
        try {
          const st = statSync(filePath)
          sw.fileByteOffsets.set(filePath, st.size)
          if (st.mtimeMs > latestMtime) {
            latestMtime = st.mtimeMs
            sw.latestFile = filePath
          }
        } catch { /* ignore */ }
      }
    } catch { /* project dir may not exist yet */ }
  }

  /**
   * Called every second. Scans the project directory for JSONL files,
   * processes any bytes appended since last poll, and emits token events.
   */
  private poll(sw: SessionWatch): void {
    if (this.win.isDestroyed()) return
    try {
      if (!existsSync(sw.projectDir)) return

      const entries = readdirSync(sw.projectDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => join(sw.projectDir, e.name))

      for (const filePath of entries) {
        const isNewFile = !sw.fileByteOffsets.has(filePath)
        const isNewConversation = isNewFile && sw.latestFile !== null

        if (isNewFile) {
          // New JSONL file appeared → new claude conversation started
          sw.fileByteOffsets.set(filePath, 0)
          sw.latestFile = filePath
        }

        this.processNewBytes(sw, filePath, isNewConversation)
      }
    } catch { /* ignore transient errors */ }
  }

  /**
   * Read only the bytes appended since last check, parse complete JSONL lines,
   * and emit token usage events. Partial trailing lines are skipped and
   * included in the next poll.
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

      // Skip partial trailing line (no newline yet)
      const lastNL = text.lastIndexOf('\n')
      if (lastNL === -1) return

      const completeText = text.slice(0, lastNL + 1)
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
    } catch { /* silently ignore locked/malformed files */ } finally {
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
