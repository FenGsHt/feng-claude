import { existsSync, openSync, fstatSync, readSync, closeSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { TokenUsageUpdatePayload, ToolCallPayload } from '../renderer/src/types/ipc'

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

const ZERO_USAGE: ParsedUsage = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }

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
  /**
   * Per-message-id last seen usage snapshot.
   * [2026-04-27] FIX: Claude streams multiple lines per message with different
   * usage values (thinking stage vs final response). We now take the LAST value
   * per message.id and emit it when the next message starts.
   */
  lastUsageByMessageId: Map<string, ParsedUsage>
  /** Currently processing message.id (to detect new message start) */
  currentMessageId: string | null
  /** Most recently seen JSONL file — used to detect a new claude conversation */
  latestFile: string | null
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

    console.log('[Token] watchSession start — sessionId:', sessionId, 'workdir:', workdir, '→ projectDir:', projectDir)
    console.log('[Token] claudeConfigDir:', this.claudeConfigDir)

    // [2026-04-27] BUG FIX: If this projectDir is already being watched by another session,
    // reuse the existing watcher to avoid duplicate token counting. Multiple sessions in
    // the same workdir share the same JSONL file; token usage should be counted once.
    const existing = this.watchedProjectDirs.get(projectDir)
    if (existing) {
      console.log(`[TokenWatcher] projectDir already watched by ${existing.sessionId}, sharing watcher`)
      this.sessions.set(sessionId, existing)
      return
    }

    const sw: SessionWatch = {
      sessionId,
      projectDir,
      fileByteOffsets: new Map(),
      lastUsageByMessageId: new Map(),
      currentMessageId: null,
      latestFile: null,
      timer: null,
      lastTokenTime: null,
      runningNotified: false
    }

    // Pre-populate byte offsets for files that already exist so we never
    // re-process historical token entries.
    this.scanExisting(sw)
    console.log(`[TokenWatcher] scanExisting done — ${sw.fileByteOffsets.size} files, latestFile=${sw.latestFile}`)

    // Poll every 1 s — reliable on Windows where FSEvents can be flaky.
    // Log once on first poll to help debug path issues
    let loggedPath = false
    sw.timer = setInterval(() => {
      if (!loggedPath) {
        console.log(`[TokenWatcher] polling: projectDir=${sw.projectDir} exists=${existsSync(sw.projectDir)}`)
        if (existsSync(sw.projectDir)) {
          try {
            const allFiles = readdirSync(sw.projectDir, { withFileTypes: true })
              .filter(e => e.isFile()).map(e => e.name)
            console.log(`[TokenWatcher] files in dir:`, allFiles)
          } catch {}
        }
        loggedPath = true
      }
      this.poll(sw)
    }, 1000)

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
      if (!existsSync(sw.projectDir)) {
        // Only log once per watcher lifetime, not every second
        if (!sw.runningNotified) {
          console.log(`[TokenWatcher] projectDir does not exist yet: ${sw.projectDir}`)
        }
        return
      }

      const entries = readdirSync(sw.projectDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => join(sw.projectDir, e.name))

      if (entries.length === 0) {
        console.log(`[TokenWatcher] no JSONL files found in: ${sw.projectDir}`)
      }

      for (const filePath of entries) {
        const isNewFile = !sw.fileByteOffsets.has(filePath)
        const isNewConversation = isNewFile && sw.latestFile !== null

        if (isNewFile) {
          // New JSONL file appeared → new claude conversation started
          console.log(`[TokenWatcher] new JSONL detected: ${filePath} isNewConversation=${isNewConversation}`)
          sw.fileByteOffsets.set(filePath, 0)
          sw.latestFile = filePath
        }

        this.processNewBytes(sw, filePath, isNewConversation)
      }

      // [2026-04-27] Detect idle state: if no token usage for 3+ seconds, send 'idle' status
      // This enables task completion notifications in the renderer
      if (sw.lastTokenTime && sw.runningNotified) {
        const elapsed = Date.now() - sw.lastTokenTime
        if (elapsed > 3000) {
          console.log(`[TokenWatcher] idle detected, elapsed=${elapsed}ms`)
          // Emit pending message's final usage before idle
          if (sw.currentMessageId) {
            const pendingUsage = sw.lastUsageByMessageId.get(sw.currentMessageId)
            if (pendingUsage && usageSum(pendingUsage) > 0) {
              console.log(
                `[TokenWatcher] emit pending message on idle: msgId=${sw.currentMessageId} in=${pendingUsage.input} out=${pendingUsage.output} cr=${pendingUsage.cacheRead}`
              )
              this.emit({
                sessionId: sw.sessionId,
                input: pendingUsage.input,
                output: pendingUsage.output,
                cacheCreate: pendingUsage.cacheCreate,
                cacheRead: pendingUsage.cacheRead,
                reset: false
              })
              sw.lastUsageByMessageId.delete(sw.currentMessageId)
              sw.currentMessageId = null
            }
          }
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
      console.log(`[TokenWatcher] processNewBytes ${filePath.split(/[\\/]/).pop()} offset=${prevOffset}→${prevOffset + Buffer.byteLength(completeText, 'utf-8')} lines=${lines.length}`)

      let needReset = resetFirst
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

        const parsed = parseLineWithId(line)
        if (!parsed) continue
        const { messageId, model, usage } = parsed

        // Skip synthetic model entries (Claude Code internal bookkeeping)
        if (model === '<synthetic>') continue

        // [2026-04-27] BUG FIX: Same message.id may appear multiple times with different
        // usage values (thinking stage vs final response). Each record is a snapshot,
        // NOT an increment. We should take the last value per message.id, not delta.
        //
        // Strategy: Store current message's usage. When we see a NEW message.id,
        // emit the PREVIOUS message's final usage (as a "completed" increment).
        const prevMsgId = sw.currentMessageId
        if (prevMsgId && prevMsgId !== messageId) {
          // New message started → emit previous message's final usage
          const prevUsage = sw.lastUsageByMessageId.get(prevMsgId)
          if (prevUsage && usageSum(prevUsage) > 0) {
            console.log(
              `[TokenWatcher] emit message complete: msgId=${prevMsgId} in=${prevUsage.input} out=${prevUsage.output} cc=${prevUsage.cacheCreate} cr=${prevUsage.cacheRead} reset=${needReset}`
            )
            if (!sw.runningNotified) {
              this.emitStatus(sw.sessionId, 'running')
              sw.runningNotified = true
            }
            sw.lastTokenTime = Date.now()
            this.emit({
              sessionId: sw.sessionId,
              input: prevUsage.input,
              output: prevUsage.output,
              cacheCreate: prevUsage.cacheCreate,
              cacheRead: prevUsage.cacheRead,
              reset: needReset
            })
            needReset = false
          }
          // Clear previous message from map (no longer needed)
          sw.lastUsageByMessageId.delete(prevMsgId)
        }

        // Update current message tracking
        sw.currentMessageId = messageId
        sw.lastUsageByMessageId.set(messageId, usage)

        // Cap map size
        if (sw.lastUsageByMessageId.size > 100) {
          // Keep only current message and recent ones
          const keys = [...sw.lastUsageByMessageId.keys()]
          for (const k of keys.slice(0, -10)) {
            if (k !== messageId) sw.lastUsageByMessageId.delete(k)
          }
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
      console.log(`[TokenWatcher] emit status: ${sessionId} ${status}`)
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

interface ParsedLine {
  messageId: string
  model: string
  usage: ParsedUsage
}

function parseLineWithId(line: string): ParsedLine | null {
  try {
    const entry = JSON.parse(line) as ClaudeJSONLEntry
    if (entry.type !== 'assistant') {
      // [DEBUG] Log non-assistant entry types to understand JSONL structure
      // console.log('[TokenWatcher] skip non-assistant type:', entry.type)
      return null
    }
    const msg = entry.message
    if (!msg) {
      // [DEBUG] assistant entry has no message field
      console.log('[TokenWatcher] assistant entry has no message:', line.slice(0, 200))
      return null
    }
    const messageId = msg.id
    if (!messageId) return null
    const u = msg.usage
    if (!u) {
      console.log('[TokenWatcher] assistant message has no usage, keys:', Object.keys(msg), 'line:', line.slice(0, 300))
      // [DEBUG] dump the first entry to understand JSONL structure
      return null
    }
    // [DEBUG] Log one usage entry to confirm format
    // console.log('[TokenWatcher] usage entry:', JSON.stringify({input: u.input_tokens, output: u.output_tokens}))
    const input = Number(u.input_tokens) || 0
    const output = Number(u.output_tokens) || 0
    const cacheCreate = Number(u.cache_creation_input_tokens) || 0
    const cacheRead = Number(u.cache_read_input_tokens) || 0
    if (input + output + cacheCreate + cacheRead === 0) return null
    return {
      messageId,
      model: msg.model ?? '',
      usage: { input, output, cacheCreate, cacheRead }
    }
  } catch {
    return null
  }
}
