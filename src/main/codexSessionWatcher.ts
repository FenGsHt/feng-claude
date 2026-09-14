import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { IPC, type TokenUsageUpdatePayload } from '../renderer/src/types/ipc'

interface CodexWatch {
  sessionId: string
  workdir: string
  startedAt: number
  rolloutPath?: string
  byteOffset: number
  timer?: ReturnType<typeof setInterval>
  model?: string
}

interface CodexRolloutEntry {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

/**
 * Tracks classic Codex TUI usage from its own rollout JSONL files.
 *
 * [2026-09-14] The message gateway receives app-server token events directly,
 * but classic terminal sessions do not. Codex writes the same per-turn token
 * counters into ~/.codex/sessions, which is both more accurate and safer than
 * trying to recover usage from ANSI terminal output.
 */
export class CodexSessionWatcher {
  private readonly sessions = new Map<string, CodexWatch>()
  private readonly sessionsRoot = join(homedir(), '.codex', 'sessions')

  constructor(private readonly win: BrowserWindow) {}

  watchSession(sessionId: string, workdir: string): void {
    this.unwatchSession(sessionId)
    const watch: CodexWatch = {
      sessionId,
      workdir,
      // A new rollout is normally created just before the PTY is ready. Keep a
      // small grace window so its first token_count event is not missed.
      startedAt: Date.now() - 10_000,
      byteOffset: 0
    }
    watch.timer = setInterval(() => this.poll(watch), 500)
    this.sessions.set(sessionId, watch)
    this.poll(watch)
  }

  unwatchSession(sessionId: string): void {
    const watch = this.sessions.get(sessionId)
    if (!watch) return
    if (watch.timer) clearInterval(watch.timer)
    this.sessions.delete(sessionId)
  }

  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) this.unwatchSession(sessionId)
  }

  private poll(watch: CodexWatch): void {
    if (this.win.isDestroyed() || this.sessions.get(watch.sessionId) !== watch) return
    try {
      if (!watch.rolloutPath) watch.rolloutPath = this.findRollout(watch)
      if (watch.rolloutPath) this.readNewLines(watch)
    } catch (error) {
      console.warn('[CodexTokenWatcher] poll failed:', error)
    }
  }

  private findRollout(watch: CodexWatch): string | undefined {
    if (!existsSync(this.sessionsRoot)) return undefined
    const candidates = this.collectRollouts(this.sessionsRoot)
      .map((filePath) => ({ filePath, mtimeMs: this.mtimeMs(filePath) }))
      .filter((candidate) => candidate.mtimeMs >= watch.startedAt)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const candidate of candidates) {
      const metadata = this.readMetadata(candidate.filePath)
      if (metadata.cwd === watch.workdir) {
        watch.model = metadata.model
        console.log('[CodexTokenWatcher] bound rollout:', candidate.filePath)
        return candidate.filePath
      }
    }
    return undefined
  }

  private readNewLines(watch: CodexWatch): void {
    const filePath = watch.rolloutPath
    if (!filePath || !existsSync(filePath)) {
      watch.rolloutPath = undefined
      watch.byteOffset = 0
      return
    }

    let fd: number | undefined
    try {
      fd = openSync(filePath, 'r')
      const size = fstatSync(fd).size
      if (size <= watch.byteOffset) return
      const count = size - watch.byteOffset
      const buffer = Buffer.alloc(count)
      readSync(fd, buffer, 0, count, watch.byteOffset)
      const text = buffer.toString('utf8')
      const lastNewline = text.lastIndexOf('\n')
      if (lastNewline < 0) return
      const complete = text.slice(0, lastNewline + 1)
      watch.byteOffset += Buffer.byteLength(complete, 'utf8')

      for (const line of complete.split('\n')) {
        this.captureModel(watch, line)
        const usage = this.parseTokenUsage(line, watch.startedAt)
        if (usage) this.emit(watch, usage)
      }
    } finally {
      if (fd !== undefined) {
        try { closeSync(fd) } catch { /* ignore */ }
      }
    }
  }

  private parseTokenUsage(line: string, startedAt: number): Omit<TokenUsageUpdatePayload, 'sessionId' | 'model' | 'isPrimary'> | undefined {
    try {
      const entry = JSON.parse(line) as CodexRolloutEntry
      if (entry.type !== 'event_msg' || entry.payload?.type !== 'token_count') return undefined
      const timestamp = Date.parse(entry.timestamp ?? '')
      if (Number.isFinite(timestamp) && timestamp < startedAt) return undefined
      const info = entry.payload.info as Record<string, unknown> | undefined
      const raw = (info?.last_token_usage ?? info?.lastTokenUsage) as Record<string, unknown> | undefined
      if (!raw) return undefined
      const number = (value: unknown): number => Math.max(0, Math.trunc(Number(value) || 0))
      const payload = {
        input: number(raw.input_tokens ?? raw.inputTokens),
        output: number(raw.output_tokens ?? raw.outputTokens),
        cacheRead: number(raw.cached_input_tokens ?? raw.cachedInputTokens),
        cacheCreate: number(raw.cache_write_input_tokens ?? raw.cacheWriteInputTokens),
        reset: false
      }
      return payload.input || payload.output || payload.cacheRead || payload.cacheCreate ? payload : undefined
    } catch {
      return undefined
    }
  }

  private emit(watch: CodexWatch, usage: Omit<TokenUsageUpdatePayload, 'sessionId' | 'model' | 'isPrimary'>): void {
    if (this.win.isDestroyed()) return
    const payload: TokenUsageUpdatePayload = {
      ...usage,
      sessionId: watch.sessionId,
      model: watch.model,
      isPrimary: true
    }
    this.win.webContents.send(IPC.TOKEN_USAGE_UPDATE, payload)
  }

  private captureModel(watch: CodexWatch, line: string): void {
    try {
      const entry = JSON.parse(line) as CodexRolloutEntry
      const payload = entry.payload ?? {}
      const threadSettings = payload.thread_settings as Record<string, unknown> | undefined
      const model = threadSettings?.model ?? payload.model
      if (typeof model === 'string' && model) watch.model = model
    } catch { /* incomplete or unrelated rollout line */ }
  }

  private readMetadata(filePath: string): { cwd?: string; model?: string } {
    let fd: number | undefined
    try {
      fd = openSync(filePath, 'r')
      const buffer = Buffer.alloc(32 * 1024)
      const bytesRead = readSync(fd, buffer, 0, buffer.length, 0)
      const firstLine = buffer.toString('utf8', 0, bytesRead).split('\n', 1)[0]
      const entry = JSON.parse(firstLine) as CodexRolloutEntry
      const payload = entry.payload ?? {}
      return {
        cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
        model: typeof payload.model === 'string' ? payload.model : undefined
      }
    } catch {
      return {}
    } finally {
      if (fd !== undefined) {
        try { closeSync(fd) } catch { /* ignore */ }
      }
    }
  }

  private collectRollouts(directory: string): string[] {
    let entries: string[]
    try { entries = readdirSync(directory) } catch { return [] }
    const result: string[] = []
    for (const entry of entries) {
      const fullPath = join(directory, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) result.push(...this.collectRollouts(fullPath))
        else if (stat.isFile() && entry.startsWith('rollout-') && entry.endsWith('.jsonl')) result.push(fullPath)
      } catch { /* file disappeared while scanning */ }
    }
    return result
  }

  private mtimeMs(filePath: string): number {
    try { return statSync(filePath).mtimeMs } catch { return 0 }
  }
}
