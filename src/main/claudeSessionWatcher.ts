import { existsSync, openSync, fstatSync, readSync, closeSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { TokenUsageUpdatePayload, ToolCallPayload } from '../renderer/src/types/ipc'

export type { TokenUsageUpdatePayload }

/**
 * Claude Code project directory naming:
 *   Replace every `:`, `\`, `/`, `_` in the workdir path with `-`
 *   e.g. "D:\git2\python_file\python_file\feng-test" → "D--git2-python-file-python-file-feng-test"
 */
function workdirToProjectDirName(workdir: string): string {
  return workdir.replace(/[:\\/_]/g, '-')
}

interface ClaudeJSONLEntry {
  type: string
  message?: {
    id?: string
    model?: string
    content?: Array<{
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }>
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

function usageSum(u: ParsedUsage): number {
  return u.input + u.output + u.cacheCreate + u.cacheRead
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
  timer: ReturnType<typeof setInterval> | null
  /** Last time we saw token usage — used to detect idle state for notifications */
  lastTokenTime: number | null
  /** Whether we've already sent 'running' status (avoid duplicate sends) */
  runningNotified: boolean
}

export class ClaudeSessionWatcher {
  private win: BrowserWindow
  private claudeConfigDir: string
  private sessions = new Map<string, SessionWatch>()
  /** [2026-04-27] Track which projectDirs are already being watched to avoid duplicate token counting */
  private watchedProjectDirs = new Map<string, SessionWatch>()

  constructor(win: BrowserWindow, claudeConfigDir: string) {
    this.win = win
    this.claudeConfigDir = claudeConfigDir
  }

  watchSession(sessionId: string, workdir: string): void {
    const projectDirName = workdirToProjectDirName(workdir)
    const projectDir = join(this.claudeConfigDir, 'projects', projectDirName)

    console.log('[Token] watchSession — workdir:', workdir, '→ projectDir:', projectDir)

    // If this projectDir is already being watched by another session,
    // reuse the existing watcher to avoid duplicate token counting.
    const existing = this.watchedProjectDirs.get(projectDir)
    if (existing) {
      this.sessions.set(sessionId, existing)
      return
    }

    const sw: SessionWatch = {
      sessionId,
      projectDir,
      fileByteOffsets: new Map(),
      timer: null,
      lastTokenTime: null,
      runningNotified: false
    }

    // Pre-populate byte offsets for files that already exist so we never
    // re-process historical token entries.
    this.scanExisting(sw)

    // Poll every 1 s — reliable on Windows where FSEvents can be flaky.
    sw.timer = setInterval(() => {
      this.poll(sw)
    }, 1000)
    console.log('[Token] timer started for projectDir:', projectDir)

    this.sessions.set(sessionId, sw)
    this.watchedProjectDirs.set(projectDir, sw)
  }

  unwatchSession(sessionId: string): void {
    const sw = this.sessions.get(sessionId)
    if (sw) {
      // [2026-04-27] Only stop timer and remove from watchedProjectDirs if no other sessions
      // are sharing this watcher
      const sharingCount = [...this.sessions.values()].filter(s => s === sw).length
      this.sessions.delete(sessionId)
      if (sharingCount === 1) {
        // This was the last session using this watcher
        if (sw.timer) clearInterval(sw.timer)
        this.watchedProjectDirs.delete(sw.projectDir)
      }
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
      for (const entry of readdirSync(sw.projectDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const filePath = join(sw.projectDir, entry.name)
        try {
          const st = statSync(filePath)
          sw.fileByteOffsets.set(filePath, st.size)
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
      if (!existsSync(sw.projectDir)) {
        return
      }

      const entries = readdirSync(sw.projectDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => join(sw.projectDir, e.name))

      for (const filePath of entries) {
        const isNewFile = !sw.fileByteOffsets.has(filePath)
        if (isNewFile) {
          sw.fileByteOffsets.set(filePath, 0)
        }
        this.processNewBytes(sw, filePath)
      }

      // Detect idle state: if no token usage for 3+ seconds, send 'idle' status
      if (sw.lastTokenTime && sw.runningNotified) {
        const elapsed = Date.now() - sw.lastTokenTime
        if (elapsed > 3000) {
          this.emitStatus(sw.sessionId, 'idle')
          sw.runningNotified = false
        }
      }
    } catch (err) {
      console.error('[TokenWatcher] poll error:', err)
    }
  }

  /**
   * Read only the bytes appended since last check, parse complete JSONL lines,
   * and emit token usage events. Partial trailing lines are skipped and
   * included in the next poll.
   */
  private processNewBytes(sw: SessionWatch, filePath: string): void {
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

      for (const line of lines) {
        // Emit tool calls for any tool_use blocks in this line
        for (const tc of parseToolCalls(line)) {
          this.emitToolCall({
            sessionId: sw.sessionId,
            toolId: tc.id,
            name: tc.name,
            input: tc.input,
            timestamp: Date.now()
          })
        }

        // Parse assistant message and emit usage directly
        const usage = parseAssistantUsage(line)
        if (usage && usageSum(usage) > 0) {
          if (!sw.runningNotified) {
            this.emitStatus(sw.sessionId, 'running')
            sw.runningNotified = true
          }
          sw.lastTokenTime = Date.now()
          console.log('[Token] emit — input:', usage.input, 'output:', usage.output)
          this.emit({
            sessionId: sw.sessionId,
            input: usage.input,
            output: usage.output,
            cacheCreate: usage.cacheCreate,
            cacheRead: usage.cacheRead,
            reset: false
          })
        }
      }
    } catch (err) {
      console.error('[TokenWatcher] processNewBytes error:', err)
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

  private emitStatus(sessionId: string, status: 'running' | 'idle'): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.PTY_STATUS, { sessionId, status })
    }
  }

  private emitToolCall(payload: ToolCallPayload): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.TOOL_CALL_UPDATE, payload)
    }
  }
}

// ── Pure helpers ─────────────────────────────────────────────

interface ToolCallBlock { id: string; name: string; input: Record<string, unknown> }

function parseToolCalls(line: string): ToolCallBlock[] {
  try {
    const entry = JSON.parse(line) as ClaudeJSONLEntry
    if (entry.type !== 'assistant') return []
    const content = entry.message?.content
    if (!Array.isArray(content)) return []
    return content
      .filter((c) => c.type === 'tool_use' && c.name)
      .map((c) => ({ id: c.id ?? '', name: c.name!, input: c.input ?? {} }))
  } catch {
    return []
  }
}

/**
 * Parse assistant message and return usage.
 * [2026-04-30] Simplified: directly return usage like claude-hud does.
 */
function parseAssistantUsage(line: string): ParsedUsage | null {
  try {
    const entry = JSON.parse(line) as ClaudeJSONLEntry
    if (entry.type !== 'assistant') return null
    const msg = entry.message
    if (!msg) return null
    const u = msg.usage
    if (!u) return null

    const input = Math.trunc(Number(u.input_tokens) || 0)
    const output = Math.trunc(Number(u.output_tokens) || 0)
    const cacheCreate = Math.trunc(Number(u.cache_creation_input_tokens) || 0)
    const cacheRead = Math.trunc(Number(u.cache_read_input_tokens) || 0)
    const total = input + output + cacheCreate + cacheRead
    if (total === 0) return null

    console.log('[Token] parseAssistantUsage — in:', input, 'out:', output, 'cacheCreate:', cacheCreate, 'cacheRead:', cacheRead, 'total:', total)
    return { input, output, cacheCreate, cacheRead }
  } catch {
    return null
  }
}
