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

/** 与上一条快照做差，避免多条 assistant 行携带相同 usage 时被渲染层反复 add */
function usageDeltaSince(prev: ParsedUsage, cur: ParsedUsage): ParsedUsage {
  return {
    input: Math.max(0, cur.input - prev.input),
    output: Math.max(0, cur.output - prev.output),
    cacheCreate: Math.max(0, cur.cacheCreate - prev.cacheCreate),
    cacheRead: Math.max(0, cur.cacheRead - prev.cacheRead)
  }
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
  /** 每条 jsonl 内上一条 assistant usage 快照，用于下发增量、对齐 /cost 会话口径 */
  lastUsageByFile: Map<string, ParsedUsage>
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

    console.log(`[TokenWatcher] watchSession ${sessionId} → ${projectDir}`)

    const sw: SessionWatch = {
      sessionId,
      projectDir,
      fileByteOffsets: new Map(),
      lastUsageByFile: new Map(),
      latestFile: null,
      timer: null
    }

    // Pre-populate byte offsets for files that already exist so we never
    // re-process historical token entries.
    this.scanExisting(sw)
    console.log(`[TokenWatcher] scanExisting done — ${sw.fileByteOffsets.size} files, latestFile=${sw.latestFile}`)

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
          console.log(`[TokenWatcher] new JSONL detected: ${filePath} isNewConversation=${isNewConversation}`)
          sw.fileByteOffsets.set(filePath, 0)
          sw.lastUsageByFile.delete(filePath)
          sw.latestFile = filePath
        }

        this.processNewBytes(sw, filePath, isNewConversation)
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

        const usage = parseLine(line)
        if (!usage) continue

        const prev = sw.lastUsageByFile.get(filePath) ?? ZERO_USAGE
        const prevSum = usageSum(prev)
        const curSum = usageSum(usage)
        /*
         * [2026-04-24] 原先把每行 usage 原样 add 到前端，Claude 常在同一轮写多条 assistant 行且
         * message.usage 为「该次请求上下文」快照（数值重复或单调增），导致侧栏 input 约为内置 Session 数倍。
         */
        let baseline = prev
        if (prevSum > 0 && curSum + 500 < prevSum) {
          baseline = ZERO_USAGE
        }
        const d = usageDeltaSince(baseline, usage)
        sw.lastUsageByFile.set(filePath, usage)

        if (usageSum(d) === 0) {
          needReset = false
          continue
        }

        console.log(
          `[TokenWatcher] emit token delta: in=${d.input} out=${d.output} cr=${d.cacheRead} reset=${needReset} (raw in=${usage.input})`
        )
        this.emit({
          sessionId: sw.sessionId,
          input: d.input,
          output: d.output,
          cacheCreate: d.cacheCreate,
          cacheRead: d.cacheRead,
          reset: needReset
        })
        needReset = false
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
