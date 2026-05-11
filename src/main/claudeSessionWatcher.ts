import { existsSync, openSync, fstatSync, readSync, closeSync, readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type {
  TokenUsageUpdatePayload,
  ToolCallPayload,
  ClaudeTranscriptEntry,
  ClaudeTranscriptPayload,
  ClaudeTurnTokenUsage
} from '../renderer/src/types/ipc'

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
  /** [2026-05-06] 部分 Claude Code 版本把 usage 放在根上，与 message 并列 */
  usage?: Record<string, unknown>
  message?: {
    id?: string
    model?: string
    content?: Array<{
      type: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }>
    usage?: Record<string, unknown>
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
   * [2026-05-06] 同一 projectDir 可能被多个标签共用 watcher；转录广播需发到每个 sessionId（token 路径仍用首 sessionId，保持原行为）
   */
  linkedSessionIds: Set<string>
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
  /** [2026-05-06] 默认 false：未开启 Beta 时不解析/不推送转录，逻辑与原先完全一致 */
  private readonly shouldEmitTranscript: () => boolean

  constructor(win: BrowserWindow, claudeConfigDir: string, shouldEmitTranscript?: () => boolean) {
    this.win = win
    this.claudeConfigDir = claudeConfigDir
    this.shouldEmitTranscript = shouldEmitTranscript ?? (() => false)
  }

  /**
   * [2026-05-06] 设置里刚打开外嵌 Beta 时：把当前所有会话对应项目的 JSONL 历史全量推到前端（replace）
   */
  hydrateAllActiveTranscripts(): void {
    if (!this.shouldEmitTranscript()) return
    const seenDir = new Set<string>()
    for (const sw of this.watchedProjectDirs.values()) {
      if (seenDir.has(sw.projectDir)) continue
      seenDir.add(sw.projectDir)
      const entries = readFullTranscriptEntriesFromDisk(sw.projectDir, null)
      for (const sid of sw.linkedSessionIds) {
        this.emitTranscriptReplaceOne(sid, entries)
      }
      this.scanExisting(sw)
    }
  }

  watchSession(sessionId: string, workdir: string, opts?: { scrollbackBase64?: string | null }): void {
    const projectDirName = workdirToProjectDirName(workdir)
    const projectDir = join(this.claudeConfigDir, 'projects', projectDirName)

    console.log('[Token] watchSession — workdir:', workdir, '→ projectDir:', projectDir)

    // If this projectDir is already being watched by another session,
    // reuse the existing watcher to avoid duplicate token counting.
    const existing = this.watchedProjectDirs.get(projectDir)
    if (existing) {
      existing.linkedSessionIds.add(sessionId)
      this.sessions.set(sessionId, existing)
      /* [2026-05-06] 同一目录新开标签：把该项目已有 JSONL 全量同步到新 session（无 scrollback，避免重复） */
      if (this.shouldEmitTranscript()) {
        const entries = readFullTranscriptEntriesFromDisk(existing.projectDir, null)
        this.emitTranscriptReplaceOne(sessionId, entries)
      }
      return
    }

    const sw: SessionWatch = {
      sessionId,
      projectDir,
      linkedSessionIds: new Set([sessionId]),
      fileByteOffsets: new Map(),
      timer: null,
      lastTokenTime: null,
      runningNotified: false
    }

    /* [2026-05-06] Beta：整文件读 JSONL + 可选 scrollback 回填；非 Beta：保持仅 scanExisting，不误扫 token 历史 */
    if (this.shouldEmitTranscript()) {
      const entries = readFullTranscriptEntriesFromDisk(sw.projectDir, opts?.scrollbackBase64 ?? null)
      for (const sid of sw.linkedSessionIds) {
        this.emitTranscriptReplaceOne(sid, entries)
      }
      this.scanExisting(sw)
    } else {
      this.scanExisting(sw)
    }

    // [2026-05-06] 原 1000ms；外嵌模式需要更快响应，改为 200ms 让助手回复尽快出现
    sw.timer = setInterval(() => {
      this.poll(sw)
    }, 200)
    console.log('[Token] timer started for projectDir:', projectDir)

    this.sessions.set(sessionId, sw)
    this.watchedProjectDirs.set(projectDir, sw)
  }

  unwatchSession(sessionId: string): void {
    const sw = this.sessions.get(sessionId)
    if (sw) {
      sw.linkedSessionIds.delete(sessionId)
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
      for (const filePath of this.collectJsonlFiles(sw.projectDir)) {
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

      const entries = this.collectJsonlFiles(sw.projectDir)

      for (const filePath of entries) {
        const isNewFile = !sw.fileByteOffsets.has(filePath)
        if (isNewFile) {
          sw.fileByteOffsets.set(filePath, 0)
        }
        this.processNewBytes(sw, filePath)
      }

      // Detect idle state: if no token usage for a short window, send 'idle' to all panes sharing this project
      if (sw.lastTokenTime && sw.runningNotified) {
        const elapsed = Date.now() - sw.lastTokenTime
        if (elapsed > 1500) {
          this.emitStatusForWatch(sw, 'idle')
          sw.runningNotified = false
        }
      }
    } catch (err) {
      console.error('[TokenWatcher] poll error:', err)
    }
  }

  /** Collect all JSONL files from projectDir and subagents/ subdirectory. */
  private collectJsonlFiles(projectDir: string): string[] {
    return collectJsonlFilesFromProjectDir(projectDir)
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
            this.emitStatusForWatch(sw, 'running')
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

        /* [2026-05-06] 仅 Beta 开启时解析 JSONL 对话行并 IPC；与全量回填同一套解析 + 未识别行 fallback */
        if (this.shouldEmitTranscript()) {
          const transcriptEntries = parseTranscriptLineForTranscript(line)
          if (transcriptEntries.length > 0) {
            this.emitTranscript(sw, transcriptEntries)
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
      this.win.webContents.send(IPC.PTY_STATUS, { sessionId, status })
    }
  }

  /** [2026-05-06] 同 project 多 session 须各发 PTY_STATUS，否则外嵌仅主标签会 idle */
  private emitStatusForWatch(sw: SessionWatch, status: 'running' | 'idle'): void {
    for (const sid of sw.linkedSessionIds) {
      this.emitStatus(sid, status)
    }
  }

  private emitToolCall(payload: ToolCallPayload): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.TOOL_CALL_UPDATE, payload)
    }
  }

  private emitTranscriptPayload(sessionId: string, entries: ClaudeTranscriptEntry[], replace: boolean): void {
    if (this.win.isDestroyed()) return
    if (!replace && entries.length === 0) return
    const payload: ClaudeTranscriptPayload = { sessionId, entries, replace }
    this.win.webContents.send(IPC.CLAUDE_TRANSCRIPT_UPDATE, payload)
  }

  private emitTranscript(sw: SessionWatch, entries: ClaudeTranscriptEntry[]): void {
    if (this.win.isDestroyed() || entries.length === 0) return
    for (const sid of sw.linkedSessionIds) {
      this.emitTranscriptPayload(sid, entries, false)
    }
  }

  private emitTranscriptReplaceOne(sessionId: string, entries: ClaudeTranscriptEntry[]): void {
    if (this.win.isDestroyed()) return
    this.emitTranscriptPayload(sessionId, entries, true)
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

/** [2026-05-06] 与 token IPC、项目内 pet API 一致，兼容 snake_case / camelCase / total_* */
function coerceUsageRecord(raw: unknown): ParsedUsage | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const n = (v: unknown): number => Math.trunc(Number(v) || 0)
  const input = n(
    o.input_tokens ?? o.inputTokens ?? o.total_input_tokens ?? o.prompt_tokens
  )
  const output = n(
    o.output_tokens ?? o.outputTokens ?? o.total_output_tokens ?? o.completion_tokens
  )
  const cacheCreate = n(o.cache_creation_input_tokens ?? o.cacheCreationInputTokens)
  const cacheRead = n(o.cache_read_input_tokens ?? o.cacheReadInputTokens)
  const total = input + output + cacheCreate + cacheRead
  if (total <= 0) return null
  return { input, output, cacheCreate, cacheRead }
}

/** 优先 message.usage，其次根级 usage（与 Claude Code JSONL 多种写法对齐） */
function parseUsageFromAssistantJsonlEntry(entry: Record<string, unknown>): ParsedUsage | null {
  if (String(entry.type ?? '') !== 'assistant') return null
  const msg = entry.message
  if (msg && typeof msg === 'object') {
    const m = msg as Record<string, unknown>
    if (m.usage != null) {
      const u = coerceUsageRecord(m.usage)
      if (u) return u
    }
  }
  if (entry.usage != null) {
    const u = coerceUsageRecord(entry.usage)
    if (u) return u
  }
  return null
}

/**
 * Parse assistant message and return usage.
 * [2026-04-30] Simplified: directly return usage like claude-hud does.
 */
function parseAssistantUsage(line: string): ParsedUsage | null {
  try {
    const entry = JSON.parse(line) as Record<string, unknown>
    const u = parseUsageFromAssistantJsonlEntry(entry)
    if (!u) return null
    console.log(
      '[Token] parseAssistantUsage — in:',
      u.input,
      'out:',
      u.output,
      'cacheCreate:',
      u.cacheCreate,
      'cacheRead:',
      u.cacheRead
    )
    return u
  } catch {
    return null
  }
}

function toIpcUsage(u: ParsedUsage): ClaudeTurnTokenUsage {
  return {
    input: u.input,
    output: u.output,
    cacheCreate: u.cacheCreate,
    cacheRead: u.cacheRead
  }
}

/** [2026-05-06] CC JSONL 既有 type:user，也有顶层 role:user（无 type） */
function resolveUserContentPayload(entry: Record<string, unknown>): Record<string, unknown> {
  const t = String(entry.type ?? '')
  const msg = entry.message as Record<string, unknown> | undefined
  if (t === 'user') {
    if (msg && typeof msg === 'object') return msg
    return entry
  }
  if (String(entry.role ?? '') === 'user') return entry
  if (msg && String(msg.role ?? '') === 'user') return msg
  return entry
}

/** [2026-05-06] 从单行 JSONL 提取用户/助手文本与工具名，供外嵌 Beta 面板展示 */
function parseTranscriptEntries(line: string): ClaudeTranscriptEntry[] {
  const out: ClaudeTranscriptEntry[] = []
  try {
    const entry = JSON.parse(line) as Record<string, unknown>
    const t = String(entry.type ?? '')
    const msg = entry.message as Record<string, unknown> | undefined
    const messageId =
      typeof msg?.id === 'string'
        ? msg.id
        : typeof entry.id === 'string'
          ? entry.id
          : undefined

    const isUserLine =
      t === 'user' ||
      String(entry.role ?? '') === 'user' ||
      (msg != null && String(msg.role ?? '') === 'user')

    if (isUserLine) {
      /* [2026-05-06] 原仅 t===user；现兼容 role:user，并从 resolveUserContentPayload 取 content */
      const payload = resolveUserContentPayload(entry)
      let text = extractUserMessageText(payload)
      if (!text) text = extractUserMessageText(msg)
      if (!text) text = extractUserMessageText(entry as Record<string, unknown>)
      if (!text) text = fallbackUserTextFromJsonlEntry(entry)
      if (text) out.push({ kind: 'user', text, messageId })
      return out
    }
    if (t === 'assistant') {
      const content = msg?.content
      if (!Array.isArray(content)) return out
      const parsedUsage = parseUsageFromAssistantJsonlEntry(entry)
      const turnUsage: ClaudeTurnTokenUsage | undefined =
        parsedUsage && usageSum(parsedUsage) > 0 ? toIpcUsage(parsedUsage) : undefined
      const textBuf: string[] = []
      const flushText = (): void => {
        if (textBuf.length === 0) return
        out.push({ kind: 'assistant', text: textBuf.join('\n\n'), messageId, usage: turnUsage })
        textBuf.length = 0
      }
      for (const c of content) {
        if (!c || typeof c !== 'object') continue
        const block = c as Record<string, unknown>
        const typ = String(block.type ?? '')
        if (typ === 'thinking' || typ === 'redacted_thinking') {
          flushText()
          const body = extractThinkingBody(block)
          if (body) {
            out.push({ kind: 'thinking', text: body, messageId })
          }
          continue
        }
        if (typ === 'text' && typeof block.text === 'string' && block.text.trim()) {
          textBuf.push(block.text.trim())
          continue
        }
        if (typ === 'tool_use' && typeof block.name === 'string' && block.name) {
          flushText()
          const toolName = block.name
          out.push({
            kind: 'tool',
            text: toolName,
            messageId,
            toolName,
            toolId: typeof block.id === 'string' ? block.id : undefined,
            requiresNativeTerminal: toolName === 'AskUserQuestion'
          })
          continue
        }
        /* [2026-05-06] 原 push tool_result 为「会话记录」event；产品要求外嵌不再展示此类原始块 */
        if (typ === 'tool_result') {
          flushText()
          continue
        }
      }
      flushText()
      return out
    }
  } catch {
    /* ignore malformed lines */
  }
  return out
}

function extractThinkingBody(block: Record<string, unknown>): string | null {
  const th = block.thinking
  if (typeof th === 'string' && th.trim()) return th.trim()
  const tx = block.text
  if (typeof tx === 'string' && tx.trim()) return tx.trim()
  const typ = String(block.type ?? '')
  if (typ === 'redacted_thinking') return '[thinking redacted]'
  return null
}

/** 与增量轮询共用：有结构化条目则用之；其余行不再生成「会话记录」event */
function parseTranscriptLineForTranscript(line: string): ClaudeTranscriptEntry[] {
  const parsed = parseTranscriptEntries(line)
  if (parsed.length > 0) return parsed
  /* [2026-05-06] 原未识别行整段作为 event；现一律不展示会话记录类兜底 */
  return []
}

function stripAnsiForDisplay(s: string): string {
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
}

function collectJsonlFilesFromProjectDir(projectDir: string): string[] {
  const files: string[] = []
  try {
    if (!existsSync(projectDir)) return files
    for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(join(projectDir, entry.name))
      }
    }
    const subagentsDir = join(projectDir, 'subagents')
    if (existsSync(subagentsDir)) {
      for (const entry of readdirSync(subagentsDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(join(subagentsDir, entry.name))
        }
      }
    }
  } catch {
    /* ignore */
  }
  return files
}

function readFullTranscriptEntriesFromDisk(
  projectDir: string,
  scrollbackBase64: string | null | undefined
): ClaudeTranscriptEntry[] {
  const entries: ClaudeTranscriptEntry[] = []
  if (scrollbackBase64) {
    try {
      const plain = Buffer.from(scrollbackBase64, 'base64').toString('utf-8')
      const stripped = stripAnsiForDisplay(plain).trimEnd()
      if (stripped.length > 0) {
        entries.push({ kind: 'history', text: stripped.slice(0, 500_000) })
      }
    } catch {
      /* ignore */
    }
  }

  if (!existsSync(projectDir)) return entries

  const paths = collectJsonlFilesFromProjectDir(projectDir).sort((a, b) => {
    try {
      return statSync(a).mtimeMs - statSync(b).mtimeMs
    } catch {
      return a.localeCompare(b)
    }
  })

  for (const filePath of paths) {
    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue
      entries.push(...parseTranscriptLineForTranscript(line))
    }
  }
  return entries
}

/** [2026-05-06] Claude Code user 行：content 可为字符串，或块数组（text / tool_use.input 等） */
function extractUserMessageText(msg: Record<string, unknown> | undefined): string {
  if (!msg) return ''
  /* [2026-05-06] 原忽略顶层 text / object-shaped content；CC 新版 JSONL 常见二者之一即可表达用户句 */
  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim()
  const content = msg.content
  if (typeof content === 'string') return content.trim()
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const o = content as Record<string, unknown>
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim()
    return ''
  }
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const c of content) {
    if (!c || typeof c !== 'object') continue
    const block = c as Record<string, unknown>
    const typ = String(block.type ?? '')
    /* [2026-05-08] tool_result 块是工具返回值（Glob 文件列表、Bash 输出、Read 内容等），
     * 不是用户输入，跳过避免在用户气泡中显示工具结果。 */
    if (typ === 'tool_result') continue
    if (
      (typ === 'text' || typ === 'input_text') &&
      typeof block.text === 'string' &&
      block.text.trim()
    ) {
      parts.push(block.text.trim())
      continue
    }
    if (typ === 'tool_use' && block.input && typeof block.input === 'object') {
      const inp = block.input as Record<string, unknown>
      for (const key of ['prompt', 'query', 'message', 'command', 'description'] as const) {
        const v = inp[key]
        if (typeof v === 'string' && v.trim()) {
          parts.push(v.trim())
          break
        }
      }
      continue
    }
    if (typeof block.content === 'string' && block.content.trim()) {
      parts.push(block.content.trim())
    }
  }
  return parts.join('\n').trim()
}

function fallbackUserTextFromJsonlEntry(entry: Record<string, unknown>): string {
  const msg = entry.message as Record<string, unknown> | undefined
  if (msg) {
    if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim()
    if (typeof msg.body === 'string' && msg.body.trim()) return msg.body.trim()
  }
  if (typeof entry.text === 'string' && entry.text.trim()) return entry.text.trim()
  return ''
}
