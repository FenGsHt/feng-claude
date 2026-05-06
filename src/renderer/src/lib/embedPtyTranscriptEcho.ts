import { stripAnsi } from './stripAnsi'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'
import { useTranscriptStore } from '../store/transcriptStore'

/** [2026-05-06] 外嵌模式无 xterm，PTY 输出需写入转录区；/mcp 等走终端流而非 JSONL */
/** 若始终转发全部 PTY，会与 JSONL 助手正文重复，故仅在用户发送 `/…` 命令后转发 */

const slashEchoSessions = new Set<string>()

/** 由 submitEmbedSessionInput 根据是否斜杠命令切换 */
export function setEmbedSlashPtyEchoActive(sessionId: string, active: boolean): void {
  if (active) slashEchoSessions.add(sessionId)
  else slashEchoSessions.delete(sessionId)
}

interface Buf {
  raw: string
  timer: ReturnType<typeof setTimeout> | null
  /** stripAnsi(raw) 已发出的长度 */
  sentCleanLen: number
}

const buffers = new Map<string, Buf>()
const FLUSH_MS = 90

/** [2026-05-06] 斜杠命令外嵌：去掉 BEL、压缩过长空行，减轻 /help 等非结构化流的噪声 */
function normalizeSlashPtyEchoPlaintext(s: string): string {
  return s
    .replace(/\u0007/g, '')
    .replace(/\n{5,}/g, '\n\n\n\n')
}

function flushSession(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (!b || !b.raw.length) {
    if (b?.timer) b.timer = null
    return
  }
  const clean = stripAnsi(b.raw)
  if (b.sentCleanLen > clean.length) b.sentCleanLen = 0
  let piece = clean.slice(b.sentCleanLen)
  b.sentCleanLen = clean.length
  b.timer = null
  if (piece.length > 0) {
    piece = normalizeSlashPtyEchoPlaintext(piece)
    if (piece.length > 0) {
      useTranscriptStore.getState().appendPtyEchoChunk(sessionId, piece)
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
    b = { raw: '', timer: null, sentCleanLen: 0 }
    buffers.set(sessionId, b)
  }
  b.raw += data
  if (b.timer) clearTimeout(b.timer)
  b.timer = setTimeout(() => flushSession(sessionId), FLUSH_MS)
}

export function clearEmbedPtyEchoBuffer(sessionId: string): void {
  const b = buffers.get(sessionId)
  if (b?.timer) clearTimeout(b.timer)
  buffers.delete(sessionId)
  slashEchoSessions.delete(sessionId)
}
