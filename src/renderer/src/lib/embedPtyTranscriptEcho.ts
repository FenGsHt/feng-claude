import { Terminal } from 'xterm'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'
import { useTranscriptStore } from '../store/transcriptStore'

/**
 * [2026-05-07] 外嵌模式 PTY 输出转录
 * 用 headless xterm.js Terminal 替换自定义 screen emulator：
 * xterm 正确处理所有 ANSI 转义序列（含相对光标移动、CSI J/K/H 等），
 * 避免自研解析器的光标坐标偏移问题。Terminal 无需 open() 即可工作。
 */

const slashEchoSessions = new Set<string>()
const DEBUG_EMBED_MCP = true

/** PTY 固定列数（与 useEmbedPtyResize DEFAULT_COLS 一致） */
const TERM_COLS = 120
const TERM_ROWS = 50
/** 每次 write callback 后延迟 flush，确保 xterm 内部队列处理完毕 */
const FLUSH_MS = 120
/**
 * 从发出斜杠命令到首次看到交互式 TUI 的超时：超时后自动退出 slashInteractiveMode。
 * 针对 /clear /help 等不产生 TUI 的命令。
 */
const IDLE_AUTO_EXIT_MS = 1500

interface Buf {
  term: Terminal
  timer: ReturnType<typeof setTimeout> | null
  lastMcpScreen: string
  /** 本轮是否曾见到交互式 TUI 内容（用于检测 TUI 自然退出） */
  sawInteractive: boolean
  /** 无 TUI 内容时的兜底自动退出计时器 */
  idleTimer: ReturnType<typeof setTimeout> | null
}

const buffers = new Map<string, Buf>()

function makeBuf(): Buf {
  return {
    term: new Terminal({ cols: TERM_COLS, rows: TERM_ROWS, scrollback: 2000 }),
    timer: null,
    lastMcpScreen: '',
    sawInteractive: false,
    idleTimer: null
  }
}

// ─── 斜杠命令完成通知（供 EmbedSessionComposer 订阅）──────────────────────────

const slashDoneCallbacks = new Map<string, () => void>()

export function subscribeSlashDone(sessionId: string, cb: () => void): () => void {
  slashDoneCallbacks.set(sessionId, cb)
  return () => {
    if (slashDoneCallbacks.get(sessionId) === cb) slashDoneCallbacks.delete(sessionId)
  }
}

function signalSlashDone(sessionId: string): void {
  slashDoneCallbacks.get(sessionId)?.()
}

// ─── 判断内容是否属于交互式 TUI ──────────────────────────────────────────────

const INTERACTIVE_RE = [
  /(?:↕|↑↓) to navigate · Enter to confirm · Esc to cancel/,
  /Enter to continue · Esc to exit/,
  /Manage MCP servers/,
  /User MCPs/,
  /Built-in MCPs/,
]

function isInteractiveContent(text: string): boolean {
  return INTERACTIVE_RE.some((re) => re.test(text))
}

// ─── 读取 xterm buffer ────────────────────────────────────────────────────────

function readScreen(b: Buf): string {
  const active = b.term.buffer.active
  const total = active.length
  // 只读最近 2 屏，避免大量 scrollback 影响性能
  const start = Math.max(0, total - TERM_ROWS * 2)
  const lines: string[] = []
  for (let i = start; i < total; i++) {
    const line = active.getLine(i)
    lines.push(line ? line.translateToString(true) : '')
  }
  let first = 0
  while (first < lines.length && !lines[first].trim()) first++
  let last = lines.length - 1
  while (last >= first && !lines[last].trim()) last--
  if (last < first) return ''
  return lines.slice(first, last + 1).join('\n')
}

// ─── 文本处理（保留原有逻辑）────────────────────────────────────────────────

function preview(text: string, n = 80): string {
  const compact = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  if (compact.length <= n * 2) return compact
  return `${compact.slice(0, n)} ... ${compact.slice(-n)}`
}

function normalizeSlashPtyEchoPlaintext(s: string): string {
  return s.replace(//g, '').replace(/\n{5,}/g, '\n\n\n\n')
}

function countMenuLines(text: string): number {
  let n = 0
  if (/browser-tools/.test(text)) n += 1
  if (/visual-agent/.test(text)) n += 1
  if (/plugin:github:github/.test(text)) n += 1
  return n
}

function findSelectedLine(text: string): string {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*[❯>]\s*/.test(lines[i])) return lines[i].trim()
  }
  return ''
}

function dedupeMcpMenuCarets(text: string): string {
  const lines = text.split('\n')
  const serverRes = [/plugin:github:github/, /visual-agent/, /browser-tools/]
  const caretIdx: number[] = []
  lines.forEach((line, i) => {
    if (!/^\s*[❯>]/.test(line)) return
    if (serverRes.some((re) => re.test(line))) caretIdx.push(i)
  })
  if (caretIdx.length <= 1) return text
  const keep = caretIdx[caretIdx.length - 1]
  return lines
    .map((line, i) => {
      if (!caretIdx.includes(i) || i === keep) return line
      return line.replace(/^\s*[❯>]\s*/, '')
    })
    .join('\n')
}


function cropLatestCompleteMcpBlock(text: string): { text: string; reason: string; startLine: number } {
  const lines = text.split('\n')
  const navIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/(?:↕|↑↓) to navigate · Enter to confirm · Esc to cancel/.test(lines[i])) return i
    }
    return -1
  })()
  if (navIdx < 0) {
    if (!/User MCPs|Built-in MCPs|Manage MCP servers/.test(text)) {
      return { text, reason: 'none', startLine: 0 }
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/Manage MCP servers/.test(lines[i])) {
        return { text: lines.slice(i).join('\n'), reason: 'partial-no-nav', startLine: i }
      }
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/User MCPs/.test(lines[i])) {
        return { text: lines.slice(i).join('\n'), reason: 'partial-no-nav-user', startLine: i }
      }
    }
    return { text, reason: 'none', startLine: 0 }
  }
  const sectionStart = (() => {
    for (let i = navIdx; i >= 0; i -= 1) {
      if (/Manage MCP servers/.test(lines[i])) return { index: i, reason: 'manage-header' }
    }
    for (let i = navIdx; i >= 0; i -= 1) {
      if (/^\s*\d+\s+servers\b/i.test(lines[i])) return { index: i, reason: 'server-count' }
    }
    for (let i = navIdx; i >= 0; i -= 1) {
      if (/User MCPs/.test(lines[i])) return { index: i, reason: 'user-mcps' }
    }
    return { index: 0, reason: 'fallback' }
  })()
  return {
    text: lines.slice(sectionStart.index, navIdx + 1).join('\n'),
    reason: sectionStart.reason,
    startLine: sectionStart.index
  }
}

// ─── Flush ───────────────────────────────────────────────────────────────────

function scheduleFlush(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (!b) return
  if (b.timer) clearTimeout(b.timer)
  b.timer = setTimeout(() => doFlush(sessionId), FLUSH_MS)
}

function doFlush(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (!b) return
  b.timer = null
  if (!slashEchoSessions.has(sessionId)) return

  let snapshot = normalizeSlashPtyEchoPlaintext(readScreen(b))
  const crop = cropLatestCompleteMcpBlock(snapshot)
  snapshot = dedupeMcpMenuCarets(crop.text)

  const interactive = isInteractiveContent(snapshot)
  if (interactive) {
    // 进入/持续交互态：取消 idle 超时
    b.sawInteractive = true
    if (b.idleTimer) {
      clearTimeout(b.idleTimer)
      b.idleTimer = null
    }
  } else if (b.sawInteractive) {
    // 曾有交互 TUI，现在消失 → 斜杠命令自然结束
    _exitSlashEcho(sessionId, b)
    signalSlashDone(sessionId)
    return
  }

  b.lastMcpScreen = snapshot
  if (snapshot.trim().length > 0) {
    useTranscriptStore.getState().setLatestPtyEchoChunk(sessionId, snapshot)
  }
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][flush]', {
      sessionId,
      bufLen: b.term.buffer.active.length,
      interactive,
      menuLineCount: countMenuLines(snapshot),
      selectedLine: findSelectedLine(snapshot),
      cropReason: crop.reason,
      snapshotPreview: preview(snapshot)
    })
  }
}

/** 内部：清除 slash echo 状态（不删 xterm buffer，保留光标） */
function _exitSlashEcho(sessionId: string, b: Buf): void {
  if (b.timer) clearTimeout(b.timer)
  if (b.idleTimer) clearTimeout(b.idleTimer)
  b.timer = null
  b.idleTimer = null
  b.lastMcpScreen = ''
  b.sawInteractive = false
  slashEchoSessions.delete(sessionId)
  useTranscriptStore.getState().clearLatestPtyEchoChunk(sessionId)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function setEmbedSlashPtyEchoActive(sessionId: string, active: boolean): void {
  if (!active) {
    const b = buffers.get(sessionId)
    if (b) _exitSlashEcho(sessionId, b)
    else slashEchoSessions.delete(sessionId)
    return
  }
  slashEchoSessions.add(sessionId)
}

export function beginSlashPtyEchoRound(sessionId: string): void {
  let b = buffers.get(sessionId)
  if (b) {
    if (b.timer) clearTimeout(b.timer)
    if (b.idleTimer) clearTimeout(b.idleTimer)
    b.timer = null
    b.lastMcpScreen = ''
    b.sawInteractive = false
    // xterm terminal 保留当前 buffer 状态（光标位置正确），无需重置
  } else {
    b = makeBuf()
    buffers.set(sessionId, b)
  }
  slashEchoSessions.add(sessionId)

  // 兜底：1.5s 内没有出现交互式 TUI（/clear 等命令），自动退出 slashInteractiveMode
  b.idleTimer = setTimeout(() => {
    b!.idleTimer = null
    if (!b!.sawInteractive && slashEchoSessions.has(sessionId)) {
      _exitSlashEcho(sessionId, b!)
      signalSlashDone(sessionId)
    }
  }, IDLE_AUTO_EXIT_MS)

  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][round-begin]', { sessionId })
  }
}

export function ingestEmbedPtyEcho(sessionId: string, data: string): void {
  if (!useEmbedOutputBetaStore.getState().enabled || !data) return

  if (!slashEchoSessions.has(sessionId)) {
    // 非 slash 模式：写入 terminal 保持光标同步，不触发 flush
    const b = buffers.get(sessionId)
    if (b) b.term.write(data)
    return
  }

  let b = buffers.get(sessionId)
  if (!b) {
    b = makeBuf()
    buffers.set(sessionId, b)
  }

  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][ingest]', {
      sessionId,
      chunkLen: data.length,
      hasCr: data.includes('\r'),
      hasAltEnter: /\x1b\[\?(1049|1047)h/.test(data),
      hasAltExit: /\x1b\[\?(1049|1047)l/.test(data)
    })
  }

  // write callback 保证 xterm 解析完毕后再 schedule flush
  b.term.write(data, () => scheduleFlush(sessionId))
}

export function clearEmbedPtyEchoBuffer(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (b?.timer) clearTimeout(b.timer)
  buffers.delete(sessionId)
  slashEchoSessions.delete(sessionId)
}
