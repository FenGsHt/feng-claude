import { create } from 'zustand'
import type { ClaudeTranscriptEntry, ClaudeTurnTokenUsage } from '../types/ipc'
import { takeFirstAssistantLatencyMs } from './embedTurnLatencyStore'

/** [2026-05-06] 与主进程 TOKEN_USAGE_UPDATE 同源 delta；JSONL 未带 usage 时补挂到助手气泡 */
const pendingTokenDeltaBySession = new Map<string, ClaudeTurnTokenUsage[]>()
const DEBUG_EMBED_MCP = true

function usageSumTok(u?: ClaudeTurnTokenUsage): number {
  if (!u) return 0
  return u.input + u.output + u.cacheCreate + u.cacheRead
}

export function enqueueTranscriptTokenDelta(sessionId: string, u: ClaudeTurnTokenUsage): void {
  const q = pendingTokenDeltaBySession.get(sessionId) ?? []
  q.push(u)
  pendingTokenDeltaBySession.set(sessionId, q)
}

function takeNextPendingTokenDelta(sessionId: string): ClaudeTurnTokenUsage | undefined {
  const q = pendingTokenDeltaBySession.get(sessionId)
  if (!q?.length) return undefined
  const v = q.shift()!
  if (q.length === 0) pendingTokenDeltaBySession.delete(sessionId)
  else pendingTokenDeltaBySession.set(sessionId, q)
  return v
}

/** JSONL 已含 usage 时丢掉队列中与 IPC 重复的一条 */
function dropOnePendingTokenDelta(sessionId: string): void {
  takeNextPendingTokenDelta(sessionId)
}

/** [2026-05-06] 全量 replace 时磁盘 JSONL 可能尚未含刚发送的用户行；保留未被磁盘条目覆盖的 clientEcho user */
function mergeTranscriptReplace(
  prev: ClaudeTranscriptEntry[],
  disk: ClaudeTranscriptEntry[]
): ClaudeTranscriptEntry[] {
  const diskUserTexts = new Set(
    disk.filter((e) => e.kind === 'user').map((e) => e.text.trim()).filter(Boolean)
  )
  const orphans = prev.filter(
    (e) =>
      e.kind === 'user' &&
      e.clientEcho === true &&
      e.text.trim().length > 0 &&
      !diskUserTexts.has(e.text.trim())
  )
  if (orphans.length === 0) return disk
  return [...disk, ...orphans]
}

function normalizeMcpInteractiveText(text: string): string {
  let out = text
    .replace(/\u0008/g, '')
    .replace(/(?=Command:|Args:|Config location:|Capabilities:|Tools:)/g, ' ')
  const markWithNl = out.lastIndexOf('\nManage MCP servers')
  const mark = markWithNl >= 0 ? markWithNl + 1 : out.lastIndexOf('Manage MCP servers')
  if (mark > 0) out = out.slice(mark)
  const lines = out.split('\n')
  const deduped: string[] = []
  for (const raw of lines) {
    let line = raw.replace(/[ \t]+/g, ' ').trimEnd()
    if (/View tools|Reconnect|Disable/.test(line) && line.length > 64) {
      line = 'View tools · Reconnect · Disable'
    }
    const prev = deduped[deduped.length - 1]
    if (prev === line && line.length > 0) continue
    deduped.push(line)
  }
  return deduped.join('\n').replace(/\n{4,}/g, '\n\n\n')
}

function extractLatestMcpScreen(text: string): string {
  const withNl = text.lastIndexOf('\nManage MCP servers')
  // [2026-05-06] 原直接返回整段 normalized，方向键重绘时历史帧会在同一 event 持续膨胀；
  // 这里改为只保留最新一屏（优先锚点，其次尾部窗口）。
  // return text
  const mark = withNl >= 0 ? withNl + 1 : text.lastIndexOf('Manage MCP servers')
  const trimmed = mark >= 0 ? text.slice(mark) : text
  const lines = trimmed.split('\n')
  const tail = lines.slice(-72).join('\n')
  return tail
}

function mergePtyEchoText(prevText: string, incoming: string): string {
  const combined = prevText + incoming
  const maybeMcp =
    /Manage MCP servers|User MCPs|Built-in MCPs/.test(combined) ||
    /View tools|Reconnect|Disable/.test(incoming)
  if (!maybeMcp) return combined
  const normalized = normalizeMcpInteractiveText(combined)
  const latest = extractLatestMcpScreen(normalized)
  return latest.length > 14_000 ? latest.slice(-14_000) : latest
}

function looksLikeMcpText(text: string): boolean {
  return /Manage MCP servers|User MCPs|Built-in MCPs|View tools|Reconnect|Disable/.test(text)
}

interface TranscriptState {
  bySession: Record<string, ClaudeTranscriptEntry[]>
  append: (sessionId: string, entries: ClaudeTranscriptEntry[]) => void
  /** [2026-05-06] 外嵌：合并连续 PTY 纯文本，避免每 90ms 一条 event */
  appendPtyEchoChunk: (sessionId: string, text: string) => void
  /** [2026-05-06] /mcp 这类交互重绘：覆盖最后一块 ptyEcho，避免日志越滚越长 */
  setLatestPtyEchoChunk: (sessionId: string, text: string) => void
  /** [2026-05-06] 历史全量回填（与 append 互斥于同一 IPC 批次） */
  replaceSession: (sessionId: string, entries: ClaudeTranscriptEntry[]) => void
  clearSession: (sessionId: string) => void
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  bySession: {},
  append: (sessionId, entries) => {
    if (entries.length === 0) return
    set((s) => {
      const prev = s.bySession[sessionId] ?? []
      const merged: typeof prev = [...prev]
      let tookLatencyForBatch = false
      for (const e of entries) {
        let row = e
        if (
          e.kind === 'assistant' &&
          e.latencyMs === undefined &&
          !tookLatencyForBatch
        ) {
          const lat = takeFirstAssistantLatencyMs(sessionId)
          if (lat !== undefined) {
            row = { ...e, latencyMs: lat }
            tookLatencyForBatch = true
          }
        }
        if (row.kind === 'assistant') {
          const hasJsonlUsage = usageSumTok(row.usage) > 0
          if (!hasJsonlUsage) {
            const d = takeNextPendingTokenDelta(sessionId)
            if (d) row = { ...row, usage: d }
          } else if ((pendingTokenDeltaBySession.get(sessionId)?.length ?? 0) > 0) {
            dropOnePendingTokenDelta(sessionId)
          }
        }
        if (row.kind === 'user' && merged.length > 0) {
          const last = merged[merged.length - 1]
          if (
            last.kind === 'user' &&
            last.text.trim() === row.text.trim() &&
            last.clientEcho === true &&
            row.clientEcho !== true
          ) {
            merged[merged.length - 1] = { ...row }
            continue
          }
        }
        merged.push(row)
      }
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: merged
        }
      }
    })
  },
  appendPtyEchoChunk: (sessionId, text) => {
    if (!text) return
    set((s) => {
      const prev = s.bySession[sessionId] ?? []
      const last = prev[prev.length - 1]
      if (last?.kind === 'event' && last.ptyEcho === true) {
        /* [2026-05-06] 原实现仅 last.text + text，会把 /mcp 交互重绘串成噪声长行（如 View tools❯Reconnect...） */
        // const next = [
        //   ...prev.slice(0, -1),
        //   { ...last, text: last.text + text }
        // ]
        const mergedText = mergePtyEchoText(last.text, text)
        if (DEBUG_EMBED_MCP && looksLikeMcpText(mergedText)) {
          console.log('[embed-mcp][store:append-merge]', {
            sessionId,
            prevLen: last.text.length,
            incomingLen: text.length,
            nextLen: mergedText.length
          })
        }
        const next = [
          ...prev.slice(0, -1),
          { ...last, text: mergedText }
        ]
        return { bySession: { ...s.bySession, [sessionId]: next } }
      }
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: [
            ...prev,
            { kind: 'event', text: mergePtyEchoText('', text), ptyEcho: true }
          ]
        }
      }
    })
  },
  setLatestPtyEchoChunk: (sessionId, text) => {
    if (!text) return
    set((s) => {
      const prev = s.bySession[sessionId] ?? []
      const last = prev[prev.length - 1]
      if (last?.kind === 'event' && last.ptyEcho === true) {
        const mcpLikely = looksLikeMcpText(text)
        const suffix = mcpLikely && text.startsWith(last.text) ? text.slice(last.text.length) : ''
        if (
          mcpLikely &&
          suffix.length > 0 &&
          suffix.length < 280 &&
          /(browser-tools|visual-agent|Reconnect|Disable|connected ·)/.test(suffix)
        ) {
          if (DEBUG_EMBED_MCP) {
            console.log('[embed-mcp][store:set-latest:drop-suffix-dup]', {
              sessionId,
              prevLen: last.text.length,
              nextLen: text.length,
              suffixLen: suffix.length
            })
          }
          return s
        }
        if (DEBUG_EMBED_MCP && looksLikeMcpText(text)) {
          console.log('[embed-mcp][store:set-latest:replace]', {
            sessionId,
            prevLen: last.text.length,
            nextLen: text.length
          })
        }
        return {
          bySession: {
            ...s.bySession,
            [sessionId]: [...prev.slice(0, -1), { ...last, text }]
          }
        }
      }
      if (DEBUG_EMBED_MCP && looksLikeMcpText(text)) {
        console.log('[embed-mcp][store:set-latest:new]', {
          sessionId,
          nextLen: text.length
        })
      }
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: [...prev, { kind: 'event', text, ptyEcho: true }]
        }
      }
    })
  },
  replaceSession: (sessionId, entries) =>
    set((s) => {
      pendingTokenDeltaBySession.delete(sessionId)
      const prev = s.bySession[sessionId] ?? []
      const merged = mergeTranscriptReplace(prev, entries)
      return { bySession: { ...s.bySession, [sessionId]: merged } }
    }),
  clearSession: (sessionId) =>
    set((s) => {
      pendingTokenDeltaBySession.delete(sessionId)
      const { [sessionId]: _removed, ...rest } = s.bySession
      return { bySession: rest }
    })
}))
