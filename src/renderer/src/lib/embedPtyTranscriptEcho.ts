import { stripAnsi } from './stripAnsi'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'
import { useTranscriptStore } from '../store/transcriptStore'

/** [2026-05-06] 外嵌模式无 xterm，PTY 输出需写入转录区；/mcp 等走终端流而非 JSONL */
/** 若始终转发全部 PTY，会与 JSONL 助手正文重复，故仅在用户发送 `/…` 命令后转发 */

const slashEchoSessions = new Set<string>()
const DEBUG_EMBED_MCP = true

/** 由 submitEmbedSessionInput 根据是否斜杠命令切换；关闭前 flush，避免残留字节丢失 */
export function setEmbedSlashPtyEchoActive(sessionId: string, active: boolean): void {
  if (!active) {
    flushSessionSync(sessionId)
    const b = buffers.get(sessionId)
    if (b?.timer) clearTimeout(b.timer)
    buffers.delete(sessionId)
    slashEchoSessions.delete(sessionId)
    return
  }
  slashEchoSessions.add(sessionId)
}

/**
 * [2026-05-06] 每条新 `/…` 命令开始前：flush 上一轮末尾，再清空 raw。
 * 否则 PTY 缓冲跨多次 /mcp 无限累积，且 JSONL 插入助手气泡后新 ptyEcho 块会整屏重复。
 */
export function beginSlashPtyEchoRound(sessionId: string): void {
  flushSessionSync(sessionId)
  let b = buffers.get(sessionId)
  if (b?.timer) clearTimeout(b.timer)
  if (b) {
    b.raw = ''
    b.sentCleanLen = 0
    b.timer = null
    b.lastMcpScreen = ''
    b.screenLines = ['']
    b.cursorRow = 0
    b.cursorCol = 0
    b.savedCursorRow = 0
    b.savedCursorCol = 0
  } else {
    buffers.set(sessionId, {
      raw: '',
      timer: null,
      sentCleanLen: 0,
      lastMcpScreen: '',
      screenLines: [''],
      cursorRow: 0,
      cursorCol: 0,
      savedCursorRow: 0,
      savedCursorCol: 0
    })
  }
  slashEchoSessions.add(sessionId)
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][round-begin]', { sessionId })
  }
}

interface Buf {
  raw: string
  timer: ReturnType<typeof setTimeout> | null
  /** stripAnsi(raw) 已发出的长度 */
  sentCleanLen: number
  /** [2026-05-06] /mcp 交互模式缓存上一帧完整屏幕，避免方向键分块导致整屏退化 */
  lastMcpScreen: string
  /** [2026-05-06] 通用终端屏幕缓冲（不依赖 /mcp 关键词） */
  screenLines: string[]
  cursorRow: number
  cursorCol: number
  savedCursorRow: number
  savedCursorCol: number
}

const buffers = new Map<string, Buf>()
const FLUSH_MS = 90

function preview(text: string, n = 80): string {
  const compact = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  if (compact.length <= n * 2) return compact
  return `${compact.slice(0, n)} ... ${compact.slice(-n)}`
}

const SCREEN_MAX_ROWS = 220

function ensureRow(b: Buf, row: number): void {
  while (b.screenLines.length <= row) b.screenLines.push('')
}

function writeCharAtCursor(b: Buf, ch: string): void {
  ensureRow(b, b.cursorRow)
  const line = b.screenLines[b.cursorRow] ?? ''
  if (b.cursorCol > line.length) {
    b.screenLines[b.cursorRow] = line + ' '.repeat(b.cursorCol - line.length) + ch
  } else {
    b.screenLines[b.cursorRow] =
      line.slice(0, b.cursorCol) + ch + (b.cursorCol < line.length ? line.slice(b.cursorCol + 1) : '')
  }
  b.cursorCol += 1
}

function keepScreenTail(b: Buf): void {
  if (b.screenLines.length <= SCREEN_MAX_ROWS) return
  const drop = b.screenLines.length - SCREEN_MAX_ROWS
  b.screenLines = b.screenLines.slice(drop)
  b.cursorRow = Math.max(0, b.cursorRow - drop)
}

function parseCsiParams(raw: string): number[] {
  const parts = raw.split(';')
  const out: number[] = []
  for (const p of parts) {
    const n = Number.parseInt(p, 10)
    out.push(Number.isFinite(n) ? n : 0)
  }
  return out
}

function applyCsi(b: Buf, paramsRaw: string, final: string): void {
  const p = parseCsiParams(paramsRaw)
  const n = (v: number | undefined, d: number): number => {
    const x = v ?? d
    return x <= 0 ? d : x
  }
  if (final === 'A') {
    b.cursorRow = Math.max(0, b.cursorRow - n(p[0], 1))
    return
  }
  if (final === 'B') {
    b.cursorRow += n(p[0], 1)
    ensureRow(b, b.cursorRow)
    keepScreenTail(b)
    return
  }
  if (final === 'E') {
    b.cursorRow += n(p[0], 1)
    b.cursorCol = 0
    ensureRow(b, b.cursorRow)
    keepScreenTail(b)
    return
  }
  if (final === 'F') {
    b.cursorRow = Math.max(0, b.cursorRow - n(p[0], 1))
    b.cursorCol = 0
    return
  }
  if (final === 'C') {
    b.cursorCol += n(p[0], 1)
    return
  }
  if (final === 'D') {
    b.cursorCol = Math.max(0, b.cursorCol - n(p[0], 1))
    return
  }
  if (final === 'G') {
    b.cursorCol = Math.max(0, n(p[0], 1) - 1)
    return
  }
  if (final === 'H' || final === 'f') {
    const row = Math.max(0, n(p[0], 1) - 1)
    const col = Math.max(0, n(p[1], 1) - 1)
    b.cursorRow = row
    b.cursorCol = col
    ensureRow(b, b.cursorRow)
    keepScreenTail(b)
    return
  }
  if (final === 'J') {
    const mode = p[0] ?? 0
    if (mode === 2) {
      b.screenLines = ['']
      b.cursorRow = 0
      b.cursorCol = 0
      return
    }
    ensureRow(b, b.cursorRow)
    if (mode === 1) {
      /* [2026-05-06] 原只识别整屏清空；方向键重绘可能用局部清屏，导致旧箭头残留或新箭头落不到快照。 */
      // if (mode === 2) {
      //   b.screenLines = ['']
      //   b.cursorRow = 0
      //   b.cursorCol = 0
      // }
      for (let i = 0; i < b.cursorRow; i += 1) b.screenLines[i] = ''
      b.screenLines[b.cursorRow] = (b.screenLines[b.cursorRow] ?? '').slice(b.cursorCol)
      b.cursorCol = 0
      return
    }
    if (mode === 0) {
      b.screenLines[b.cursorRow] = (b.screenLines[b.cursorRow] ?? '').slice(0, b.cursorCol)
      b.screenLines = b.screenLines.slice(0, b.cursorRow + 1)
      return
    }
    return
  }
  if (final === 'K') {
    ensureRow(b, b.cursorRow)
    const line = b.screenLines[b.cursorRow] ?? ''
    const mode = p[0] ?? 0
    if (mode === 2) {
      b.screenLines[b.cursorRow] = ''
      b.cursorCol = 0
      return
    }
    if (mode === 1) {
      b.screenLines[b.cursorRow] = ' '.repeat(b.cursorCol) + line.slice(b.cursorCol)
      return
    }
    b.screenLines[b.cursorRow] = line.slice(0, b.cursorCol)
    return
  }
  if (final === 's') {
    b.savedCursorRow = b.cursorRow
    b.savedCursorCol = b.cursorCol
    return
  }
  if (final === 'u') {
    b.cursorRow = b.savedCursorRow
    b.cursorCol = b.savedCursorCol
    ensureRow(b, b.cursorRow)
  }
}

function applyTerminalChunk(b: Buf, chunk: string): void {
  let i = 0
  while (i < chunk.length) {
    const ch = chunk[i]
    if (ch === '\x1b') {
      const next = chunk[i + 1]
      if (next === '[') {
        let j = i + 2
        while (j < chunk.length && !/[@-~]/.test(chunk[j])) j += 1
        if (j < chunk.length) {
          const paramsRaw = chunk.slice(i + 2, j)
          const final = chunk[j]
          applyCsi(b, paramsRaw, final)
          i = j + 1
          continue
        }
      } else if (next === ']') {
        let j = i + 2
        while (j < chunk.length) {
          if (chunk[j] === '\u0007') break
          if (chunk[j] === '\x1b' && chunk[j + 1] === '\\') {
            j += 1
            break
          }
          j += 1
        }
        i = Math.min(j + 1, chunk.length)
        continue
      } else if (next === '7') {
        b.savedCursorRow = b.cursorRow
        b.savedCursorCol = b.cursorCol
        i += 2
        continue
      } else if (next === '8') {
        b.cursorRow = b.savedCursorRow
        b.cursorCol = b.savedCursorCol
        ensureRow(b, b.cursorRow)
        i += 2
        continue
      }
      i += 1
      continue
    }
    if (ch === '\r') {
      b.cursorCol = 0
      i += 1
      continue
    }
    if (ch === '\n') {
      b.cursorRow += 1
      ensureRow(b, b.cursorRow)
      keepScreenTail(b)
      b.cursorCol = 0
      i += 1
      continue
    }
    if (ch === '\b') {
      b.cursorCol = Math.max(0, b.cursorCol - 1)
      i += 1
      continue
    }
    if (ch >= ' ') writeCharAtCursor(b, ch)
    i += 1
  }
}

function screenToText(b: Buf): string {
  const lines = b.screenLines.map((l) => l.replace(/[ \t]+$/g, ''))
  let first = 0
  while (first < lines.length && lines[first].trim().length === 0) first += 1
  let last = lines.length - 1
  while (last >= first && lines[last].trim().length === 0) last -= 1
  if (last < first) return ''
  return lines.slice(first, last + 1).join('\n')
}

function countMenuLines(text: string): number {
  let n = 0
  if (/browser-tools/.test(text)) n += 1
  if (/visual-agent/.test(text)) n += 1
  if (/plugin:github:github/.test(text)) n += 1
  return n
}

function findSelectedLine(text: string): string {
  return text.split('\n').find((line) => /^\s*[❯>]\s*/.test(line))?.trim() ?? ''
}

function cropLatestCompleteMcpBlock(text: string): { text: string; reason: string; startLine: number } {
  const lines = text.split('\n')
  const navIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/(?:↕|↑↓) to navigate · Enter to confirm · Esc to cancel/.test(lines[i])) return i
    }
    return -1
  })()
  if (navIdx < 0 || !/User MCPs|Built-in MCPs|Manage MCP servers/.test(text)) {
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

  // [2026-05-06] 上一版“缺菜单就补行”会把旧帧孤立选项追加到完整区块前方；这里只裁掉完整 MCP 区块前的残影。
  // if (countMenuLines(snapshot) < 2 && countMenuLines(b.lastMcpScreen) >= 2) {
  //   snapshot = mergeMissingMenuLines(b.lastMcpScreen, snapshot)
  // }
  return {
    text: lines.slice(sectionStart.index, navIdx + 1).join('\n'),
    reason: sectionStart.reason,
    startLine: sectionStart.index
  }
}

/** [2026-05-06] 斜杠命令外嵌：去掉 BEL、压缩过长空行，减轻 /help 等非结构化流的噪声 */
function normalizeSlashPtyEchoPlaintext(s: string): string {
  return s
    .replace(/\u0007/g, '')
    .replace(/\n{5,}/g, '\n\n\n\n')
}

function stripAnsiKeepCr(input: string): string {
  if (!input) return ''
  let s = input
  // [2026-05-06] 原 stripAnsi 会把 \r 转为 \n，/mcp 菜单重绘会被错误追加成长日志
  // const s = stripAnsi(input)
  s = s.replace(/\u001b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
  s = s.replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
  s = s.replace(/\u001b[\][()#%][\x20-\x7e]/g, '')
  s = s.replace(/\u001b[\][()#%]/g, '')
  s = s.replace(/\u001b[@-_]/g, '')
  s = s.replace(/\u001b(?=[^\u005b\u005d])/g, '')
  return s.replace(/\r\n/g, '\n')
}

function renderTerminalLike(text: string): string {
  const lines: string[] = ['']
  let row = 0
  let col = 0
  const writeChar = (ch: string): void => {
    const line = lines[row] ?? ''
    if (col > line.length) {
      lines[row] = line + ' '.repeat(col - line.length) + ch
    } else {
      lines[row] = line.slice(0, col) + ch + (col < line.length ? line.slice(col + 1) : '')
    }
    col += 1
  }
  for (const ch of text) {
    if (ch === '\r') {
      col = 0
      continue
    }
    if (ch === '\n') {
      row += 1
      if (!lines[row]) lines[row] = ''
      col = 0
      continue
    }
    if (ch === '\b') {
      if (col > 0) col -= 1
      continue
    }
    if (ch >= ' ') writeChar(ch)
  }
  return lines.join('\n')
}

function isMcpInteractiveText(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  return (
    /managemcpservers|usermcps|built-inmcps|builtinmcps/.test(compact) ||
    /viewtools|reconnect|disable|entertoconfirm/.test(compact) ||
    /plugin:github:github|browser-tools|visual-agent/.test(compact) ||
    /connected·\d+tools|connected\d+tools/.test(compact)
  )
}

function extractLatestMcpScreen(text: string): string {
  const m = text.lastIndexOf('\nManage MCP servers')
  const u = text.lastIndexOf('\nUser MCPs')
  const start = m >= 0 ? m + 1 : u >= 0 ? u + 1 : 0
  const trimmed = start > 0 ? text.slice(start) : text
  const endRe = /\n(?:↕|↑↓) to navigate · Enter to confirm · Esc to cancel/
  const end = endRe.exec(trimmed)
  let body = trimmed
  if (end && end.index >= 0) {
    const from = end.index + 1
    const rel = trimmed.slice(from).indexOf('\n')
    body = rel >= 0 ? trimmed.slice(0, from + rel) : trimmed
  }
  return body.split('\n').slice(-120).join('\n')
}

function restoreMcpLineBreaks(text: string): string {
  let out = text
  if (!out.includes('\n')) {
    out = out
      .replace(/(Manage MCP servers)/g, '\n$1')
      .replace(/(User MCPs \([^)]+\))/g, '\n$1')
      .replace(/(Built-in MCPs \(always available\))/g, '\n$1')
      .replace(/(※ Run claude --debug to see error logs)/g, '\n$1')
      .replace(/(https:\/\/code\.claude\.com\/docs\/en\/mcp for help)/g, '\n$1')
      .replace(/((?:↕|↑↓) to navigate · Enter to confirm · Esc to cancel)/g, '\n$1')
      .replace(/([❯> ]*browser-tools ·\s*connected ·\s*\d+\s*tools)/g, '\n$1')
      .replace(/([❯> ]*visual-agent ·\s*connected ·\s*\d+\s*tool[s]?)/g, '\n$1')
      .replace(/(plugin:github:github ·\s*failed)/g, '\n$1')
  }
  /* [2026-05-06] 菜单重绘常把 “...tool❯ plugin...” 粘连，拆回下一行箭头 */
  out = out
    .replace(/(tools?)\s*([❯>])\s*(plugin:github:github)/g, '$1\n$2 $3')
    .replace(/(tools?)\s*([❯>])\s*(visual-agent)/g, '$1\n$2 $3')
    .replace(/(tools?)\s*([❯>])\s*(browser-tools)/g, '$1\n$2 $3')
  /* [2026-05-06] 孤立箭头行（仅 “❯”）与下一行合并，避免看起来箭头错位 */
  out = out.replace(/\n❯\s*\n([^\n]+)/g, '\n❯ $1')
  return out.replace(/\n{4,}/g, '\n\n\n').trimStart()
}

function isPartialMcpSnapshot(text: string): boolean {
  const hasHeader = /Manage MCP servers|User MCPs|Built-in MCPs/.test(text)
  const hasItems = /browser-tools|visual-agent|plugin:github:github/.test(text)
  return !hasHeader && hasItems
}

function mergeMcpSnapshots(prevFull: string, partial: string): string {
  if (!prevFull.trim()) return partial
  const prevLines = prevFull.split('\n')
  const incomingLines = partial.split('\n')
  const pick = (re: RegExp): string | undefined => incomingLines.find((l) => re.test(l))
  const browser = pick(/[❯> ]*browser-tools/)
  const visual = pick(/[❯> ]*visual-agent/)
  const plugin = pick(/plugin:github:github/)
  let selectedLine = pick(/^ *[❯>]\s*(browser-tools|visual-agent|plugin:github:github)/)
  if (!selectedLine) {
    const joined = incomingLines.join(' ')
    if (/[❯>] *plugin:github:github/.test(joined)) selectedLine = '❯ plugin:github:github'
    else if (/[❯>] *visual-agent/.test(joined)) selectedLine = '❯ visual-agent'
    else if (/[❯>] *browser-tools/.test(joined)) selectedLine = '❯ browser-tools'
  }
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][merge-snapshot]', {
      browser,
      visual,
      plugin,
      selectedLine
    })
  }
  return prevLines
    .map((line) => {
      if (browser && /browser-tools/.test(line)) return browser
      if (visual && /visual-agent/.test(line)) return visual
      if (plugin && /plugin:github:github/.test(line)) return plugin
      /* [2026-05-06] 原仅按关键词覆盖，不保证箭头行迁移；若 incoming 提供选中行，优先替换对应项 */
      if (selectedLine && /(browser-tools|visual-agent|plugin:github:github)/.test(line)) {
        if (selectedLine.includes('browser-tools') && /browser-tools/.test(line)) return selectedLine
        if (selectedLine.includes('visual-agent') && /visual-agent/.test(line)) return selectedLine
        if (selectedLine.includes('plugin:github:github') && /plugin:github:github/.test(line)) return selectedLine
      }
      return line
    })
    .join('\n')
}

/** 同步写出增量；定时器路径与手动 flush 共用 */
function flushSessionSync(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (!b || !b.raw.length) {
    if (b?.timer) b.timer = null
    return
  }
  /* [2026-05-06] 原逻辑按 /mcp 关键词分支 + 正则拼接，换 /skill 等命令易失真；改为通用终端屏幕渲染 */
  // const plainKeepCr = stripAnsiKeepCr(b.raw)
  const rawChunk = b.raw
  b.raw = ''
  b.timer = null
  applyTerminalChunk(b, rawChunk)
  let snapshot = normalizeSlashPtyEchoPlaintext(screenToText(b))
  const crop = cropLatestCompleteMcpBlock(snapshot)
  snapshot = crop.text
  b.lastMcpScreen = snapshot
  if (snapshot.trim().length > 0) {
    useTranscriptStore.getState().setLatestPtyEchoChunk(sessionId, snapshot)
  }
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][flush:screen]', {
      sessionId,
      rawLen: rawChunk.length,
      screenRows: b.screenLines.length,
      cursor: [b.cursorRow, b.cursorCol],
      menuLineCount: countMenuLines(snapshot),
      selectedLine: findSelectedLine(snapshot),
      cropStartReason: crop.reason,
      cropStartLine: crop.startLine,
      snapshotLen: snapshot.length,
      rawPreview: preview(rawChunk),
      snapshotPreview: preview(snapshot)
    })
  }
  return

  const plainKeepCr = stripAnsiKeepCr(b.raw)
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][flush:start]', {
      sessionId,
      rawLen: b.raw.length,
      sentCleanLen: b.sentCleanLen,
      hasCr: plainKeepCr.includes('\r'),
      looksMcp: isMcpInteractiveText(plainKeepCr),
      rawPreview: preview(b.raw)
    })
  }
  if (isMcpInteractiveText(plainKeepCr)) {
    const rendered = renderTerminalLike(plainKeepCr)
    let latest = extractLatestMcpScreen(
      restoreMcpLineBreaks(normalizeSlashPtyEchoPlaintext(rendered))
    )
    /* [2026-05-06] 原始增量分块常仅含选项行，直接覆盖会把完整菜单降级成两行；改为与上一帧合并 */
    // useTranscriptStore.getState().setLatestPtyEchoChunk(sessionId, latest)
    if (isPartialMcpSnapshot(latest) && b.lastMcpScreen.trim().length > 0) {
      latest = mergeMcpSnapshots(b.lastMcpScreen, latest)
    }
    b.lastMcpScreen = latest
    b.timer = null
    if (latest.trim().length > 0) {
      useTranscriptStore.getState().setLatestPtyEchoChunk(sessionId, latest)
    }
    if (DEBUG_EMBED_MCP) {
      console.log('[embed-mcp][flush:mcp]', {
        sessionId,
        renderedLen: rendered.length,
        latestLen: latest.length,
        latestPreview: preview(latest)
      })
    }
    /* [2026-05-06] 原仅在超大时截断 raw，导致 MCP 重绘帧持续累积（rawLen 单调上涨） */
    // if (b.raw.length > 240_000) {
    //   b.raw = b.raw.slice(-120_000)
    // }
    b.raw = ''
    b.sentCleanLen = 0
    return
  }
  const clean = stripAnsi(b.raw)
  /* [2026-05-06] 原 sentCleanLen > len 时置 0，会把整段 clean 再 append 一遍（stripAnsi 变短或截断时暴刷重复） */
  if (b.sentCleanLen > clean.length) b.sentCleanLen = clean.length
  let piece = clean.slice(b.sentCleanLen)
  b.sentCleanLen = clean.length
  b.timer = null
  if (piece.length > 0) {
    piece = normalizeSlashPtyEchoPlaintext(piece)
    if (piece.length > 0) {
      useTranscriptStore.getState().appendPtyEchoChunk(sessionId, piece)
      if (DEBUG_EMBED_MCP) {
        console.log('[embed-mcp][flush:append]', {
          sessionId,
          pieceLen: piece.length,
          piecePreview: preview(piece)
        })
      }
    }
  }
  if (b.raw.length > 400_000) {
    b.raw = b.raw.slice(-200_000)
    b.sentCleanLen = stripAnsi(b.raw).length
  }
}

/** PTY 原始块（可能含跨 chunk 的 ANSI） */
export function ingestEmbedPtyEcho(sessionId: string, data: string): void {
  if (!useEmbedOutputBetaStore.getState().enabled || !data) return
  if (!slashEchoSessions.has(sessionId)) return
  let b = buffers.get(sessionId)
  if (!b) {
    b = {
      raw: '',
      timer: null,
      sentCleanLen: 0,
      lastMcpScreen: '',
      screenLines: [''],
      cursorRow: 0,
      cursorCol: 0,
      savedCursorRow: 0,
      savedCursorCol: 0
    }
    buffers.set(sessionId, b)
  }
  b.raw += data
  if (DEBUG_EMBED_MCP) {
    console.log('[embed-mcp][ingest]', {
      sessionId,
      chunkLen: data.length,
      rawLen: b.raw.length,
      hasCr: data.includes('\r'),
      hasAltEnter: /\x1b\[\?(1049|1047)h/.test(data),
      hasAltExit: /\x1b\[\?(1049|1047)l/.test(data),
      chunkPreview: preview(data)
    })
  }
  if (b.timer) clearTimeout(b.timer)
  b.timer = setTimeout(() => {
    flushSessionSync(sessionId)
  }, FLUSH_MS)
}

export function clearEmbedPtyEchoBuffer(sessionId: string): void {
  flushSessionSync(sessionId)
  const b = buffers.get(sessionId)
  if (b?.timer) clearTimeout(b.timer)
  buffers.delete(sessionId)
  slashEchoSessions.delete(sessionId)
}
