import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useEmbedAwaitingReplyStore } from '../../store/embedAwaitingReplyStore'
import { useEmbedInterruptSuppressStore } from '../../store/embedInterruptSuppressStore'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'
import type { ClaudeTranscriptEntry, ClaudeTurnTokenUsage } from '../../types/ipc'
import { formatLatencyMs, formatTokenCount } from '../../lib/formatTokens'
import { useNativeTerminalRequestStore } from '../../store/nativeTerminalRequestStore'
import { useThemeStore } from '../../store/themeStore'
import { injectEmbedDraft } from '../../lib/embedDraftBridge'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import { useClaudeRuntimeStatusStore } from '../../store/claudeRuntimeStatusStore'

/* ══════════════════════════════════════════════════════════════
 * [2026-05-09] Fallout 彩蛋动效组件集
 * 仅在 themeMode === 'fallout' 时挂载，用 createPortal 渲染到 document.body
 * ══════════════════════════════════════════════════════════════ */

function BottleCapSvg({ size = 46 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180
        return <circle key={i} cx={24 + 21 * Math.cos(a)} cy={24 + 21 * Math.sin(a)} r="3.6" fill="#aaff44" />
      })}
      <circle cx="24" cy="24" r="17" fill="#010601" stroke="#aaff44" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="13.5" fill="none" stroke="#2aff4d" strokeWidth="0.7" strokeDasharray="2.8 2" />
      <text x="24" y="22" textAnchor="middle" fill="#aaff44" fontSize="5.5" fontFamily="VT323, monospace" fontWeight="bold">NUKA</text>
      <text x="24" y="29" textAnchor="middle" fill="#aaff44" fontSize="5.5" fontFamily="VT323, monospace" fontWeight="bold">COLA</text>
    </svg>
  )
}

function FalloutBottleCapToast({ caps, onDone }: { caps: number; onDone: () => void }): React.ReactElement {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 3200)
    return () => clearTimeout(t)
  }, [])
  return createPortal(
    <div className="fo-bottle-cap-toast" aria-hidden>
      <div className="fo-bottle-cap-svg"><BottleCapSvg size={46} /></div>
      <div>
        <div className="fo-bottle-cap-title">DATA RECEIVED</div>
        <div className="fo-bottle-cap-sub">+{caps} CAPS</div>
      </div>
    </div>,
    document.body
  )
}

function FalloutLevelUpBanner({ level, onDone }: { level: number; onDone: () => void }): React.ReactElement {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 3200)
    return () => clearTimeout(t)
  }, [])
  return createPortal(
    <div className="fo-levelup-banner" aria-hidden>
      <div className="fo-levelup-line1">↑ LEVEL UP ↑</div>
      <div className="fo-levelup-line2">INTELLIGENCE LVL {level}</div>
    </div>,
    document.body
  )
}


interface Props {
  sessionId: string
  className?: string
}

const TOOL_LABEL_FRESH_MS = 18_000
const RUNTIME_STATUS_FRESH_MS = 30_000

interface ToolGroupEntry {
  kind: 'toolGroup'
  text: string
  tools: string[]
  toolIds: string[]
  messageId?: string
}

type DisplayEntry = ClaudeTranscriptEntry | ToolGroupEntry

function entryMatchesQuery(e: DisplayEntry, query: string): boolean {
  if (!query) return false
  if (e.kind === 'toolGroup') {
    return `${e.text}\n${e.tools.join(' ')}`.toLowerCase().includes(query)
  }
  return `${e.text}\n${e.toolName ?? ''}`.toLowerCase().includes(query)
}

/** [2026-05-06] 底部固定条：会话 running 或已发送待响应时持续显示 loading，覆盖思考/工具/输出阶段 */
function EmbedAiWorkingBar({
  label, open, elapsedSec, outTokens
}: {
  label: string
  open: boolean
  elapsedSec: number
  outTokens: number
}): React.ReactElement | null {
  if (!open) return null
  const hasMeta = elapsedSec > 0 || outTokens > 0
  return (
    <div
      className="fo-working-bar pointer-events-none absolute bottom-0 left-0 right-0 z-[12] px-3 pb-3 pt-6"
      role="status"
      aria-live="polite"
    >
      <div className="fo-working-bar-inner mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-card-bg)] px-3 py-2.5 shadow-[0_-12px_40px_var(--theme-shadow)] backdrop-blur-md">
        <span
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--theme-accent-bg-strong)] border-t-[var(--theme-accent-muted)]"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-[var(--theme-accent-text)]">{label}</p>
        {hasMeta && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-claude-muted/70">
            {elapsedSec > 0 && <span>{elapsedSec}s</span>}
            {elapsedSec > 0 && outTokens > 0 && <span className="mx-1 opacity-40">·</span>}
            {outTokens > 0 && <span>↓ {formatTokenCount(outTokens)}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

function deriveAiWorkingLabel(args: {
  sessionBusy: boolean
  pendingReply: boolean
  lastKind: ClaudeTranscriptEntry['kind'] | undefined
  latestToolName?: string
  toolFresh: boolean
  /** [2026-05-09] JSONL 已流式输出但 PTY_STATUS 仍为 idle 滞后时，仍显示「正在输出」而非「等待中」 */
  assistantStreaming: boolean
}): string {
  const { sessionBusy, pendingReply, lastKind, latestToolName, toolFresh, assistantStreaming } = args
  if (latestToolName && toolFresh) {
    /* [2026-05-07] 原仅 sessionBusy 时显示工具名；PTY 状态短暂 idle 时也应提示工具仍在运行。 */
    return `运行工具 · ${latestToolName}`
  }
  if (lastKind === 'thinking') return '思考中…'
  if (lastKind === 'tool') return '运行工具…'
  if (lastKind === 'assistant' && assistantStreaming) return '正在输出回复…'
  if (pendingReply && !sessionBusy) return '已发送，等待 Claude 响应…'
  if (!sessionBusy) return '等待中…'
  switch (lastKind) {
    case 'assistant':
      return '正在输出回复…'
    default:
      return 'Claude 处理中…'
  }
}

/** [2026-05-06] 助手气泡底部：JSONL usage + 外嵌首包耗时 */
function AssistantReplyMeta({
  usage,
  latencyMs,
  sessionTotal,
}: {
  usage?: ClaudeTurnTokenUsage
  latencyMs?: number
  sessionTotal?: ClaudeTurnTokenUsage
}): React.ReactElement | null {
  const sum = usage
    ? usage.input + usage.output + usage.cacheCreate + usage.cacheRead
    : 0
  const hasTok = Boolean(usage && sum > 0)
  const sessionSum = sessionTotal
    ? sessionTotal.input + sessionTotal.output + sessionTotal.cacheCreate + sessionTotal.cacheRead
    : 0
  const hasSessionTotal = Boolean(sessionTotal && sessionSum > 0 && sessionSum !== sum)
  if (latencyMs === undefined && !hasTok) return null
  return (
    <div className="mt-2 space-y-1.5 border-t border-[var(--theme-panel-border)] pt-2">
      {latencyMs !== undefined ? (
        <div className="text-[9px] text-claude-muted" title="从发送到本条助手出现在此列表的耗时">
          耗时{' '}
          <span className="font-mono tabular-nums text-[var(--theme-accent-muted)]">{formatLatencyMs(latencyMs)}</span>
        </div>
      ) : null}
      {hasTok && usage ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] tabular-nums text-claude-muted">
          <span title="input">in {formatTokenCount(usage.input)}</span>
          <span className="text-claude-muted/40">·</span>
          <span title="output">out {formatTokenCount(usage.output)}</span>
          {usage.cacheCreate > 0 || usage.cacheRead > 0 ? (
            <>
              <span className="text-claude-muted/40">·</span>
              <span title="cache">
                cache +{formatTokenCount(usage.cacheCreate)} / {formatTokenCount(usage.cacheRead)}
              </span>
            </>
          ) : null}
          <span className="text-claude-muted/40">·</span>
          <span className="font-semibold text-[var(--theme-success-text)]" title="本条回复合计">
            Σ {formatTokenCount(sum)}
          </span>
        </div>
      ) : null}
      {hasSessionTotal && sessionTotal ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] tabular-nums text-claude-muted/60">
          <span className="text-[8px] uppercase tracking-wide opacity-60">本次任务</span>
          <span title="session input">in {formatTokenCount(sessionTotal.input)}</span>
          <span className="text-claude-muted/30">·</span>
          <span title="session output">out {formatTokenCount(sessionTotal.output)}</span>
          {sessionTotal.cacheCreate > 0 || sessionTotal.cacheRead > 0 ? (
            <>
              <span className="text-claude-muted/30">·</span>
              <span title="session cache">
                cache +{formatTokenCount(sessionTotal.cacheCreate)} / {formatTokenCount(sessionTotal.cacheRead)}
              </span>
            </>
          ) : null}
          <span className="text-claude-muted/30">·</span>
          <span className="font-semibold text-[var(--theme-success-text)]/60" title="session 合计">
            Σ {formatTokenCount(sessionSum)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function quoteTextForComposer(text: string): string {
  const body = text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `${body}\n\n`
}

function BubbleActions({
  sessionId,
  text
}: {
  sessionId: string
  text: string
}): React.ReactElement {
  /* [2026-05-09] 原用气泡下方浮层「已复制到剪贴板」；改为按钮框高亮 + 勾，更贴近操作点、不挡正文 */
  const [copied, setCopied] = useState(false)
  const hideCopiedRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideCopiedRef.current) clearTimeout(hideCopiedRef.current)
    }
  }, [])

  const flashCopied = (): void => {
    setCopied(true)
    if (hideCopiedRef.current) clearTimeout(hideCopiedRef.current)
    hideCopiedRef.current = setTimeout(() => {
      setCopied(false)
      hideCopiedRef.current = null
    }, 2000)
  }

  return (
    <div
      className={`absolute right-2 top-2 z-[2] flex items-center gap-1 transition-opacity ${
        copied ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
      }`}
    >
      <button
        type="button"
        className={
          copied
            ? 'flex items-center gap-0.5 rounded border-2 border-[var(--theme-success-text)] bg-[var(--theme-panel-bg-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--theme-success-text)] shadow-[0_0_12px_-3px_var(--theme-success-text)] transition-colors duration-200'
            : 'rounded border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-1.5 py-0.5 text-[9px] text-claude-muted transition-colors duration-200 hover:text-claude-text'
        }
        onClick={(ev) => {
          ev.stopPropagation()
          window.electronAPI.writeClipboardText(text)
          flashCopied()
        }}
        aria-label={copied ? '已复制到剪贴板' : '复制到剪贴板'}
      >
        {copied ? (
          <>
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>已复制</span>
          </>
        ) : (
          '复制'
        )}
      </button>
      <button
        type="button"
        className="rounded border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-1.5 py-0.5 text-[9px] text-claude-muted hover:text-claude-text"
        onClick={(ev) => {
          ev.stopPropagation()
          injectEmbedDraft(sessionId, quoteTextForComposer(text))
        }}
      >
        引用
      </button>
    </div>
  )
}

function NativeTerminalRequiredCard({
  sessionId,
  toolName
}: {
  sessionId: string
  toolName: string
}): React.ReactElement {
  const requestNativeTerminal = useNativeTerminalRequestStore((s) => s.requestNativeTerminal)
  const openNativeTerminal = useNativeTerminalRequestStore((s) => s.openNativeTerminal)

  useEffect(() => {
    requestNativeTerminal(sessionId, toolName)
  }, [requestNativeTerminal, sessionId, toolName])

  return (
    <div className="w-full max-w-3xl rounded-xl border border-[var(--theme-tool-border)] bg-[var(--theme-tool-bg)] px-3 py-2.5 shadow-inner shadow-[color:var(--theme-shadow)]">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-accent-muted)]">
        <span className="rounded bg-[var(--theme-accent-bg)] px-1.5 py-0.5 text-[9px]">TOOL</span>
        {toolName}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--theme-accent-text)]">
        此步骤需要 Claude Code 原生终端交互。请点击提示打开终端浮窗后完成选择，外嵌转录会继续同步结果。
      </p>
      <button
        type="button"
        onClick={() => openNativeTerminal(sessionId, toolName)}
        className="mt-2 rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--theme-accent-text)] transition hover:bg-[var(--theme-accent-bg-strong)]"
      >
        打开终端浮窗
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
 * 假流式：按 messageId 追踪"已完成动画"的助手消息
 * 内存 + localStorage 双层持久：重开 app 不重播旧消息
 * ══════════════════════════════════════════════════════════════ */
const streamRevealedMap = new Map<string, Set<string>>()

function getRevealedSet(sessionId: string): Set<string> {
  if (!streamRevealedMap.has(sessionId)) {
    // 从 localStorage 恢复
    try {
      const raw = localStorage.getItem(`sr:${sessionId}`)
      const ids: string[] = raw ? (JSON.parse(raw) as string[]) : []
      streamRevealedMap.set(sessionId, new Set(ids))
    } catch {
      streamRevealedMap.set(sessionId, new Set())
    }
  }
  return streamRevealedMap.get(sessionId)!
}

function markRevealed(sessionId: string, messageId: string): void {
  const set = getRevealedSet(sessionId)
  if (set.has(messageId)) return
  set.add(messageId)
  try {
    localStorage.setItem(`sr:${sessionId}`, JSON.stringify([...set]))
  } catch { /* quota 满时忽略 */ }
}

const STREAM_CHARS_PER_SEC = 100
const STREAM_DONE_DELAY_MS = 500    // 追上末尾后等待此时间，若无新增则切 markdown

/**
 * 直接 DOM 写入的假流式文本块。
 * mount 时若已在 revealedSet → 直接 markdown；否则 rAF 动画，完成后 setDone(true) → markdown。
 * 父组件始终渲染此组件（不在外部做 isNew 切换），避免 setDone 与父重渲染的竞态导致内容闪消。
 */
function StreamingAssistantBubble({
  text,
  messageId,
  sessionId,
  showCaret
}: {
  text: string
  messageId: string
  sessionId: string
  showCaret: boolean
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  // 初始化时查 revealedSet：已见过则直接 done，避免切 session 回来重播
  const [done, setDone] = useState(() => getRevealedSet(sessionId).has(messageId))
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    if (done) return
    const el = containerRef.current
    if (!el) return
    let startTs = -1
    let pos = 0
    let rafId = 0
    let doneTimer: ReturnType<typeof setTimeout> | null = null

    const tick = (ts: number): void => {
      if (startTs < 0) startTs = ts
      const full = textRef.current
      // 时间驱动：与帧率无关
      const target = Math.floor((ts - startTs) / 1000 * STREAM_CHARS_PER_SEC)
      if (pos < full.length) {
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = null }
        pos = Math.min(target, full.length)
        el.textContent = full.slice(0, pos)
        rafId = requestAnimationFrame(tick)
      } else {
        if (!doneTimer) {
          doneTimer = setTimeout(() => {
            if (pos >= textRef.current.length) {
              markRevealed(sessionId, messageId)
              setDone(true)
            } else {
              doneTimer = null
              rafId = requestAnimationFrame(tick)
            }
          }, STREAM_DONE_DELAY_MS)
        }
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      if (doneTimer) clearTimeout(doneTimer)
    }
  }, [done, messageId, sessionId])

  if (done) {
    return (
      <div key="done" className="fo-fade-in">
        <MarkdownRenderer content={text} />
        {showCaret ? <span className="fo-ai-stream-caret" aria-hidden /> : null}
      </div>
    )
  }
  return (
    <>
      <div
        ref={containerRef}
        className="whitespace-pre-wrap text-[12px] leading-relaxed text-claude-text"
      />
      {showCaret ? <span className="fo-ai-stream-caret" aria-hidden /> : null}
    </>
  )
}

/** 思考过程：流式动画 + 紧凑折叠展示 */
function StreamingThinkingBlock({
  text,
  messageId,
  sessionId,
  isComplete = false
}: {
  text: string
  messageId?: string
  sessionId: string
  /** 该思考块后方已有助手回复，说明思考已结束，跳过流式动画 */
  isComplete?: boolean
}): React.ReactElement {
  const streamKey = messageId ? `thinking:${messageId}` : null
  const containerRef = useRef<HTMLPreElement>(null)
  const [done, setDone] = useState(() =>
    isComplete || (streamKey ? getRevealedSet(sessionId).has(streamKey) : true)
  )

  useEffect(() => {
    if (isComplete && !done) {
      if (streamKey) markRevealed(sessionId, streamKey)
      setDone(true)
    }
  }, [isComplete, done, sessionId, streamKey])
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    if (done || !streamKey) return
    const el = containerRef.current
    if (!el) return
    let startTs = -1
    let pos = 0
    let rafId = 0
    let doneTimer: ReturnType<typeof setTimeout> | null = null

    const tick = (ts: number): void => {
      if (startTs < 0) startTs = ts
      const full = textRef.current
      const target = Math.floor((ts - startTs) / 1000 * STREAM_CHARS_PER_SEC)
      if (pos < full.length) {
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = null }
        pos = Math.min(target, full.length)
        el.textContent = full.slice(0, pos)
        rafId = requestAnimationFrame(tick)
      } else {
        if (!doneTimer) {
          doneTimer = setTimeout(() => {
            if (pos >= textRef.current.length) {
              markRevealed(sessionId, streamKey)
              setDone(true)
            } else {
              doneTimer = null
              rafId = requestAnimationFrame(tick)
            }
          }, STREAM_DONE_DELAY_MS)
        }
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      if (doneTimer) clearTimeout(doneTimer)
    }
  }, [done, streamKey, sessionId])

  const charCount = text.length

  return (
    <div className="w-full max-w-3xl">
      <div className="fo-thinking-header flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--theme-thinking-border)] bg-[var(--theme-thinking-bg)] px-2.5 py-1.5 text-[10px] text-[var(--theme-thinking-text)]">
        <span className="shrink-0 text-[var(--theme-accent-muted)]">◇</span>
        <span className="shrink-0 font-semibold tracking-wide">思考过程</span>
        <span className="shrink-0 text-[9px] opacity-50">· {charCount} 字</span>
      </div>
      <div className="fo-thinking-body mt-1 rounded-lg border border-[var(--theme-thinking-border)] bg-[var(--theme-thinking-bg)]/60 px-2.5 py-2">
        {done ? (
          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--theme-thinking-text)]/80">
            {text}
          </pre>
        ) : (
          <pre
            ref={containerRef}
            className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--theme-thinking-text)]/80"
          />
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
 * WorkGroupBlock：将两条回复之间的思考 + 工具调用折叠进一个面板
 * ══════════════════════════════════════════════════════════════ */

interface WorkGroupSegment {
  type: 'workGroup'
  entries: DisplayEntry[]
  isComplete: boolean
  firstGlobalIdx: number
}

function groupIntoSegments(
  entries: DisplayEntry[],
  startIdx: number
): Array<{ type: 'entry'; entry: DisplayEntry; globalIdx: number } | WorkGroupSegment> {
  const result: Array<{ type: 'entry'; entry: DisplayEntry; globalIdx: number } | WorkGroupSegment> = []
  let i = 0
  while (i < entries.length) {
    const e = entries[i]
    if (e.kind === 'thinking' || e.kind === 'toolGroup') {
      const group: DisplayEntry[] = []
      const firstGlobalIdx = startIdx + i
      while (i < entries.length && (entries[i].kind === 'thinking' || entries[i].kind === 'toolGroup')) {
        group.push(entries[i])
        i++
      }
      const isComplete = i < entries.length && entries[i].kind === 'assistant'
      result.push({ type: 'workGroup', entries: group, isComplete, firstGlobalIdx })
    } else {
      result.push({ type: 'entry', entry: e, globalIdx: startIdx + i })
      i++
    }
  }
  return result
}

function WorkGroupBlock({
  entries,
  sessionId,
  isComplete,
}: {
  entries: DisplayEntry[]
  sessionId: string
  isComplete: boolean
}): React.ReactElement {
  const [open, setOpen] = useState(!isComplete)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    if (!isComplete) return
    const id = window.setTimeout(() => setOpen(false), 1000)
    return () => clearTimeout(id)
  }, [isComplete])

  // 用户手动上滚时取消跟随
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
    stickRef.current = atBottom
  }, [])

  // 输出中（非 complete）且 stick 时跟随底部
  useEffect(() => {
    if (!open || isComplete) return
    if (!stickRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries, open, isComplete])

  const thinkCount = entries.filter((e) => e.kind === 'thinking').length
  const toolCount = entries
    .filter((e): e is ToolGroupEntry => e.kind === 'toolGroup')
    .reduce((acc, e) => acc + e.tools.length, 0)

  const label = [
    thinkCount > 0 && '思考',
    toolCount > 0 && `${toolCount} 个工具调用`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="fo-work-group-block fo-bubble-appear w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-claude-muted transition-colors hover:text-claude-text"
      >
        <span className="text-[var(--theme-accent-muted)]">◇</span>
        <span className="font-medium">{label}</span>
        <span
          className="ml-auto text-[9px] opacity-40 transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ↓
        </span>
      </button>
      {/* grid-template-rows + opacity 双轨动画：高度与内容同步淡入淡出 */}
      {/* [2026-05-11] Fallout 主题会用 fo-wg-expand/open/closed 覆盖为无动画显示，避免 Chromium 中间态裁出椭圆遮罩 */}
      <div
        className={`fo-wg-expand ${open ? 'fo-wg-open' : 'fo-wg-closed'} grid`}
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          transition: 'grid-template-rows 320ms cubic-bezier(0.4,0,0.2,1), opacity 260ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div className="fo-wg-inner min-h-0 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="fo-wg-scroll flex max-h-[260px] flex-col gap-2 overflow-y-auto border-t border-[var(--theme-panel-border)] px-3 pb-3 pt-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--scrollbar-thumb-hover)]"
          >
            {entries.map((e, i) => (
              <div
                key={e.messageId ? `${e.kind}-${e.messageId}` : `${e.kind}-wg-${i}`}
                className="fo-bubble-appear"
              >
                <EntryBlock
                  e={e}
                  sessionId={sessionId}
                  isThinkingComplete={isComplete}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function requiresNativeTerminalTool(e: ClaudeTranscriptEntry): boolean {
  if (e.kind !== 'tool') return false
  const name = (e.toolName ?? e.text).trim()
  return e.requiresNativeTerminal === true || name === 'AskUserQuestion'
}

/* ── Inline diff helpers (mirrors DiffModal logic) ── */
type DiffLine = { type: 'same' | 'removed' | 'added'; text: string }

function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split('\n'), b = newStr.split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) { result.unshift({ type: 'same', text: a[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ type: 'added', text: b[j-1] }); j-- }
    else { result.unshift({ type: 'removed', text: a[i-1] }); i-- }
  }
  return result
}

function getToolDiffContent(call: import('../../store/toolCallStore').ToolCallEntry): { old: string; new: string } | null {
  const { name, input } = call
  if (name === 'Edit' || name === 'str_replace_based_edit_tool')
    return { old: (input.old_string as string) ?? '', new: (input.new_string as string) ?? '' }
  if (name === 'Write' || name === 'create_file')
    return { old: '', new: (input.content as string) ?? '' }
  if (name === 'MultiEdit') {
    const edits = (input.edits as Array<{ old_string: string; new_string: string }>) ?? []
    return { old: edits.map((e) => e.old_string).join('\n\n--- next edit ---\n\n'), new: edits.map((e) => e.new_string).join('\n\n--- next edit ---\n\n') }
  }
  return null
}

function getToolFilePath(call: import('../../store/toolCallStore').ToolCallEntry): string {
  return ((call.input.path ?? call.input.file_path ?? '') as string)
}

function getToolBashCmd(call: import('../../store/toolCallStore').ToolCallEntry): string {
  return (call.input.command as string) ?? ''
}

function toolShortName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  return parts.slice(-2).join('/') || fullPath
}

const DIFF_TOOL_NAMES = new Set(['Edit', 'str_replace_based_edit_tool', 'Write', 'create_file', 'MultiEdit', 'Bash'])

function ToolGroupBlock({ tools, toolIds, sessionId }: { tools: string[]; toolIds: string[]; sessionId: string }): React.ReactElement {
  const allCalls = useToolCallStore((s) => s.calls.filter((c) => c.sessionId === sessionId))

  const counts = new Map<string, number>()
  for (const name of tools) counts.set(name, (counts.get(name) ?? 0) + 1)
  const compact = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  const preview = compact.slice(0, 3).join(' · ')
  const rest = Math.max(0, compact.length - 3)

  return (
    <div className="flex w-full justify-start">
      <details className="group inline-flex max-w-[min(100%,34rem)] w-full flex-col rounded-xl border border-[var(--theme-tool-border)] bg-[var(--theme-tool-bg)] px-3 py-2 text-[11px] text-[var(--theme-accent-text)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 rounded bg-[var(--theme-accent-bg)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--theme-accent-muted)]">
            tools
          </span>
          <span className="font-semibold">工具调用 · {tools.length}</span>
          {preview ? <code className="truncate font-mono text-[10px] text-[var(--theme-accent-text)] opacity-80">{preview}{rest > 0 ? ` · +${rest}` : ''}</code> : null}
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--theme-tool-border)] pt-2">
          {tools.map((name, i) => {
            const id = toolIds[i]
            const call = id ? allCalls.find((c) => c.id === id) : undefined
            const canView = DIFF_TOOL_NAMES.has(name)
            const isBash = name === 'Bash'
            const filePath = call ? getToolFilePath(call) : ''
            const bashCmd = call && isBash ? getToolBashCmd(call) : ''
            const subtitle = isBash ? bashCmd : filePath
            return (
              <div key={i} className="fo-bubble-appear">
                <div className="flex items-center gap-2 px-2 py-1">
                  <ToolLineIcon name={name} />
                  <span className={`shrink-0 text-[10px] font-semibold ${toolColor(name)}`}>{name}</span>
                  {subtitle && (
                    <code className="min-w-0 truncate font-mono text-[10px] text-claude-muted">{toolShortName(subtitle)}</code>
                  )}
                </div>
                {canView && call && <InlineToolDiff call={call} />}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

function toolColor(name: string): string {
  if (name === 'Edit' || name === 'str_replace_based_edit_tool' || name === 'MultiEdit') return 'text-blue-400'
  if (name === 'Write' || name === 'create_file') return 'text-green-400'
  if (name === 'Bash') return 'text-amber-400'
  return 'text-claude-muted'
}

function ToolLineIcon({ name }: { name: string }): React.ReactElement {
  if (name === 'Bash') return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0 text-amber-400">
      <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3.5 4.5L5.5 6L3.5 7.5M6.5 7.5H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (name === 'Write' || name === 'create_file') return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0 text-green-400">
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8l2.5 2.5V9.5A1.5 1.5 0 0 1 9 11H3.5A1.5 1.5 0 0 1 2 9.5V2.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M7.5 1v3H10.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
  if (name === 'Edit' || name === 'str_replace_based_edit_tool' || name === 'MultiEdit') return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0 text-blue-400">
      <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0 text-claude-muted">
      <circle cx="6" cy="6" r="2" fill="currentColor"/>
    </svg>
  )
}

function InlineToolDiff({ call }: { call: import('../../store/toolCallStore').ToolCallEntry }): React.ReactElement {
  if (call.name === 'Bash') {
    return (
      <pre className="mt-1 max-h-[180px] overflow-auto rounded-lg bg-[#0d0d0d] px-3 py-2 font-mono text-[10px] leading-relaxed text-amber-300 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--scrollbar-thumb-hover)]">
        {call.input.command as string}
      </pre>
    )
  }
  const diff = getToolDiffContent(call)
  if (!diff) {
    return (
      <pre className="mt-1 max-h-[180px] overflow-auto rounded-lg bg-[#0d0d0d] px-3 py-2 font-mono text-[10px] leading-relaxed text-claude-text [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--scrollbar-thumb-hover)]">
        {JSON.stringify(call.input, null, 2)}
      </pre>
    )
  }
  const lines = lineDiff(diff.old, diff.new)
  const filePath = getToolFilePath(call)
  return (
    <div className="fo-tool-diff mt-1 overflow-hidden rounded-lg border border-[var(--theme-panel-border)]">
      {filePath && (
        <div className="border-b border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-3 py-1 font-mono text-[9px] text-claude-muted truncate">
          {filePath}
        </div>
      )}
      <div className="max-h-[200px] overflow-auto font-mono text-[10px] leading-5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--scrollbar-thumb-hover)]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'removed' ? 'bg-red-950/60 text-red-300 px-3' :
              line.type === 'added'   ? 'bg-green-950/60 text-green-300 px-3' :
                                        'text-claude-muted/70 px-3'
            }
          >
            <span className="mr-2 select-none opacity-50 w-3 inline-block text-right">
              {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
            </span>
            {line.text || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}

function EntryBlock({
  e,
  sessionId,
  showAssistantStreamingCursor = false,
  isThinkingComplete = false,
  sessionTotalUsage,
}: {
  e: DisplayEntry
  sessionId: string
  showAssistantStreamingCursor?: boolean
  isThinkingComplete?: boolean
  sessionTotalUsage?: ClaudeTurnTokenUsage
}): React.ReactElement {
  if (e.kind === 'toolGroup') {
    return <ToolGroupBlock tools={e.tools} toolIds={e.toolIds} sessionId={sessionId} />
  }
  if (e.kind === 'history') {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-3 py-2.5 shadow-inner">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-claude-muted">
          <span className="text-[11px] opacity-70">◇</span>
          先前终端缓冲
        </div>
        <pre className="max-h-[min(280px,35vh)] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--theme-panel-bg-soft)] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-claude-text/85">
          {e.text}
        </pre>
      </div>
    )
  }
  if (e.kind === 'event') {
    /* [2026-05-06] 仅渲染 PTY 外嵌 echo；会话记录类 event 已在列表层过滤 */
    if (e.ptyEcho !== true) return null
    /* [2026-05-06] 外嵌 PTY 仅用于斜杠命令（/help、/mcp）；专用样式避免与助手 Markdown 气泡混淆 */
    /* [2026-05-07] 原用 <pre> 展示 headless xterm 文本快照；/mcp 二级菜单会丢光标语义，改为真实内嵌 xterm。 */
    // return (
    //   <pre className="max-h-[min(420px,52vh)] overflow-auto whitespace-pre-wrap rounded-lg bg-black/35 px-2 py-2 font-mono text-[10px] leading-[1.55] text-emerald-50/85 [scrollbar-width:thin]">
    //     {e.text}
    //   </pre>
    // )
    /* [2026-05-07] slash/TUI 统一使用悬浮原生终端；旧 ptyEcho 事件不再占用外嵌消息流。 */
    return null
  }
  if (e.kind === 'thinking') {
    return (
      <div className="flex w-full justify-start">
        <StreamingThinkingBlock text={e.text} messageId={e.messageId} sessionId={sessionId} isComplete={isThinkingComplete} />
      </div>
    )
  }
  if (e.kind === 'user') {
    return (
      <div className="flex w-full justify-end">
        <div className="group relative fo-user-bubble max-w-[min(100%,28rem)] rounded-2xl rounded-br-md border border-[var(--theme-user-border)] bg-[var(--theme-user-bg)] px-3.5 py-2.5 shadow-md shadow-[color:var(--theme-shadow)]">
          <BubbleActions sessionId={sessionId} text={e.text} />
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-accent-muted)]">你</div>
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-claude-text">{e.text}</pre>
        </div>
      </div>
    )
  }
  if (e.kind === 'tool') {
    if (requiresNativeTerminalTool(e)) {
      return <NativeTerminalRequiredCard sessionId={sessionId} toolName={e.toolName ?? e.text} />
    }
    return (
      <div className="flex w-full justify-start">
        <div className="fo-tool-pill inline-flex max-w-[min(100%,28rem)] items-center gap-2 rounded-full border border-[var(--theme-tool-border)] bg-[var(--theme-tool-bg)] px-3 py-1.5 text-[11px] text-[var(--theme-accent-text)]">
          <span className="shrink-0 rounded bg-[var(--theme-accent-bg)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--theme-accent-muted)]">
            tool
          </span>
          <code className="truncate font-mono text-[11px]">{e.text}</code>
        </div>
      </div>
    )
  }
  if (e.kind === 'assistant') {
    const msgId = e.messageId
    return (
      <div className="flex w-full justify-start fo-bubble-appear">
        <div className="group relative fo-assistant-bubble max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-3.5 py-2.5 shadow-lg shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-panel-border)]">
          <BubbleActions sessionId={sessionId} text={e.text} />
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-claude-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-success-text)]" aria-hidden />
            Claude
          </div>
          <div className="prose prose-invert max-w-none text-[12px] leading-relaxed prose-p:my-1.5 prose-pre:my-2">
            {msgId ? (
              <StreamingAssistantBubble
                text={e.text}
                messageId={msgId}
                sessionId={sessionId}
                showCaret={showAssistantStreamingCursor}
              />
            ) : (
              <>
                <MarkdownRenderer content={e.text} />
                {showAssistantStreamingCursor ? (
                  <span className="fo-ai-stream-caret" aria-hidden />
                ) : null}
              </>
            )}
          </div>
          <AssistantReplyMeta usage={e.usage} latencyMs={e.latencyMs} sessionTotal={sessionTotalUsage} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex w-full justify-start text-[11px] text-claude-muted">
      未知条目：{e.kind}
    </div>
  )
}

/* [2026-05-06] 原 TranscriptEmbedStatusFooter（进行中 / 累计 token）按产品要求不再展示 */

const SCROLL_BOTTOM_THRESHOLD_PX = 80
/** 默认只渲染列表末尾条数；滚到顶部附近再向上扩展 */
const INITIAL_HISTORY_TAIL = 80
const HISTORY_LOAD_CHUNK = 60
const TOP_LOAD_SCROLL_THRESHOLD_PX = 140
const USER_WAITING_FALLBACK_MS = 12_000

function isRejectedAskUserQuestionEcho(e: ClaudeTranscriptEntry): boolean {
  if (e.kind !== 'user') return false
  const text = e.text.trim()
  return (
    /* [2026-05-07] 原 AskUserQuestion 被拒绝后的工具回执会被解析成“你”的气泡，展示上很突兀；这里只在外嵌转录层隐藏。 */
    text.includes("The user doesn't want to proceed with this tool use") &&
    text.includes('The tool use was rejected') &&
    text.includes('Questions asked and answers provided')
  )
}

function isToolResultEcho(e: ClaudeTranscriptEntry): boolean {
  if (e.kind !== 'user') return false
  const text = e.text.trim()
  return (
    /* [2026-05-07] 原 Write/Edit 等工具结果会被 Claude Code 写成 user role，外嵌里误显示成”你”的气泡；展示层隐藏这类机器回执。 */
    /^File (created|updated) successfully at:/i.test(text) ||
    /^The file .+ has been (updated|created) successfully/i.test(text) ||
    /^Tool use was successful/i.test(text) ||
    /^File state is current in your context/i.test(text) ||
    /* [2026-05-06] EnterPlanMode / ExitPlanMode 返回的系统提示文本，对用户无信息量，直接隐藏。 */
    /^Entered plan mode\./i.test(text) ||
    /^Exited plan mode/i.test(text) ||
    /* TodoWrite / TodoRead / TaskCreate 等的机器回执 */
    /^Todos have been (updated|created)/i.test(text) ||
    /^No todos found/i.test(text) ||
    /^Task #\d+ created successfully/i.test(text) ||
    /^Task #\d+ (updated|deleted|completed)/i.test(text) ||
    /^Tasks? (created|updated|deleted|completed)/i.test(text) ||
    /* 其他元工具固定回执模式 */
    /^The plan has been submitted/i.test(text) ||
    /^View current tasks with /i.test(text)
  )
}

/** 向前找最近 N 步内是否有指定工具调用（跨越 assistant 停止） */
function hasRecentTool(entries: ClaudeTranscriptEntry[], index: number, toolNames: string[]): boolean {
  const nameSet = new Set(toolNames.map((n) => n.toLowerCase()))
  for (let i = index - 1, seen = 0; i >= 0 && seen < 6; i -= 1, seen += 1) {
    const e = entries[i]
    if (!e) continue
    if (e.kind === 'tool') {
      const name = (e.toolName ?? e.text).trim().toLowerCase()
      if (nameSet.has(name)) return true
    }
    if (e.kind === 'user') return false
  }
  return false
}

function hasRecentReadTool(entries: ClaudeTranscriptEntry[], index: number): boolean {
  return hasRecentTool(entries, index, ['read'])
}

function isReadToolResultEcho(
  e: ClaudeTranscriptEntry,
  entries: ClaudeTranscriptEntry[],
  index: number
): boolean {
  if (e.kind !== 'user') return false
  if (!hasRecentReadTool(entries, index)) return false
  const lines = e.text.trim().split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 8) return false
  const numbered = lines.filter((line) => /^\s*\d+\s+/.test(line)).length
  return numbered >= Math.ceil(lines.length * 0.55)
}

/** [2026-05-08] Glob/Bash/Write/Edit 等工具结果也以 user role 写入 JSONL；
 *  检测：前面有对应工具调用，且内容看起来是文件路径列表或命令输出。 */
function isOtherToolResultEcho(
  e: ClaudeTranscriptEntry,
  entries: ClaudeTranscriptEntry[],
  index: number
): boolean {
  if (e.kind !== 'user') return false
  const text = e.text.trim()
  if (!text) return false

  /* Glob 结果：多数行是文件路径（含 / 或 \）*/
  if (hasRecentTool(entries, index, ['glob'])) {
    const lines = text.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length >= 2) {
      const pathLike = lines.filter((l) => /[/\\]/.test(l) || /\.\w{1,6}$/.test(l.trim())).length
      if (pathLike >= Math.ceil(lines.length * 0.6)) return true
    }
  }

  /* Bash 结果：前一步是 Bash 工具，且回显内容不像用户说话（无问句、无完整句子）*/
  if (hasRecentTool(entries, index, ['bash'])) {
    /* 纯命令输出特征：无中文、多为路径/数字/符号，或内容是固定短语 */
    if (!/[一-鿿]/.test(text) && text.length < 2000) {
      const lines = text.split('\n').filter((l) => l.trim())
      const codelike = lines.filter((l) =>
        /^\s*([\w./$\\{}\-]+\s*)+$/.test(l) || /^\d+(\.\d+)?(\s|$)/.test(l.trim())
      ).length
      if (lines.length >= 2 && codelike >= Math.ceil(lines.length * 0.5)) return true
    }
  }

  /* Write / Edit / MultiEdit 固定回执短语 */
  if (hasRecentTool(entries, index, ['write', 'edit', 'multiedit'])) {
    if (
      /^(Wrote|Created|Updated|Edited|Modified)\s+\d+\s+lines/i.test(text) ||
      /^The file .{0,120} (has been|was) (written|created|updated|edited)/i.test(text) ||
      /^\[\d+ file/i.test(text)
    ) return true
  }

  /* mcp__browser-tools 结果：JSON / 固定前缀 */
  if (hasRecentTool(entries, index, [
    'mcp__browser-tools__browser_screenshot',
    'mcp__browser-tools__browser_get_text',
    'mcp__browser-tools__browser_console',
    'mcp__browser-tools__browser_navigate',
    'mcp__browser-tools__browser_reload',
    'mcp__browser-tools__browser_get_url',
  ])) {
    if (
      /^\(mcp__.+completed with no output\)$/i.test(text) ||
      /^Screenshot (saved|taken|failed)/i.test(text) ||
      /^\{[\s\S]*\}$/.test(text) ||
      text.startsWith('http://') || text.startsWith('https://')
    ) return true
  }

  return false
}

function aggregateToolEntries(entries: ClaudeTranscriptEntry[]): DisplayEntry[] {
  const out: DisplayEntry[] = []
  let pendingTools: string[] = []
  let pendingToolIds: string[] = []
  let pendingMessageId: string | undefined

  const flushTools = (): void => {
    if (pendingTools.length === 0) return
    out.push({
      kind: 'toolGroup',
      text: pendingTools.join('\n'),
      tools: pendingTools,
      toolIds: pendingToolIds,
      messageId: pendingMessageId
    })
    pendingTools = []
    pendingToolIds = []
    pendingMessageId = undefined
  }

  for (const e of entries) {
    if (e.kind === 'tool' && !requiresNativeTerminalTool(e)) {
      /* [2026-05-07] 原连续 tool 各占一行，批量 Read/Write/Edit 时信息密度过高；展示层合并成一个工具组。 */
      pendingMessageId ??= e.messageId
      pendingTools.push((e.toolName ?? e.text).trim())
      pendingToolIds.push(e.toolId ?? '')
      continue
    }
    flushTools()
    out.push(e)
  }
  flushTools()
  return out
}

/** [2026-05-06] 去掉所有 JSONL 兜底「会话记录」；仅保留 ptyEcho 的终端外嵌块 */
function filterNoiseTranscriptEntries(entries: ClaudeTranscriptEntry[]): ClaudeTranscriptEntry[] {
  return entries.filter((e, index) => {
    /* [2026-05-07] 原 JSONL/乐观 echo 会把 /mcp、/skills 等控制命令渲染成“你”的历史气泡；slash 命令交给终端块展示。 */
    // return e.kind !== 'event' || e.ptyEcho === true
    if (e.kind === 'user' && e.text.trimStart().startsWith('/')) return false
    if (isRejectedAskUserQuestionEcho(e)) return false
    if (isToolResultEcho(e)) return false
    if (isReadToolResultEcho(e, entries, index)) return false
    if (isOtherToolResultEcho(e, entries, index)) return false
    return e.kind !== 'event' || e.ptyEcho === true
  })
}

/** [2026-05-06] 从过滤后的列表尾部跳过终端外嵌 echo，避免末尾 event 挡住「最后一条是助手」判断 */
function lastTranscriptEntryForWorkingBar(
  visible: ClaudeTranscriptEntry[]
): ClaudeTranscriptEntry | undefined {
  for (let i = visible.length - 1; i >= 0; i--) {
    const e = visible[i]
    if (e.kind === 'event' && e.ptyEcho === true) continue
    return e
  }
  return undefined
}

export function ClaudeTranscriptPane({ sessionId, className = '' }: Props): React.ReactElement {
  const themeMode = useThemeStore((s) => s.theme)
  const isFallout = themeMode === 'fallout'
  const entries = useTranscriptStore((s) => s.bySession[sessionId] ?? [])
  const visibleEntries = useMemo(() => filterNoiseTranscriptEntries(entries), [entries])
  const [search, setSearch] = useState('')
  const [searchCursor, setSearchCursor] = useState(0)
  const [focusPulse, setFocusPulse] = useState<{ messageId?: string; toolName?: string } | null>(null)

  /* [2026-05-09] Fallout 彩蛋：瓶盖 Toast / LEVEL UP */
  const [bottleCapCount, setBottleCapCount] = useState<number | null>(null)
  const [levelUpNum, setLevelUpNum] = useState<number | null>(null)
  const prevShowBarRef = useRef(false)
  const assistantReplyCountRef = useRef(0)
  const pendingReply = useEmbedAwaitingReplyStore((s) => s.pendingBySession[sessionId] === true)
  const interruptSuppress = useEmbedInterruptSuppressStore(
    (s) => s.suppressWorkingBarBySession[sessionId] === true
  )
  const sessionStatus =
    useSessionStore((s) => s.sessions.find((x) => x.id === sessionId)?.status ?? 'idle')
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessionBusy = sessionStatus === 'running'
  const nativeTerminalRequest = useNativeTerminalRequestStore((s) => s.bySession[sessionId])
  const nativeTerminalInteractionActive = nativeTerminalRequest?.needed === true
  const runtimeStatus = useClaudeRuntimeStatusStore((s) => s.bySession[sessionId])
  const latestTool = useToolCallStore((s) => s.calls.find((c) => c.sessionId === sessionId))
  const focusedToolCall = useToolCallStore((s) => s.selected)
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const stickToBottomRef = useRef(true)
  const [nearBottom, setNearBottom] = useState(true)
  /** [2026-05-06] 仅渲染 visibleEntries[startIndex..]；上滑加载更早消息 */
  const [historyStartIndex, setHistoryStartIndex] = useState(0)
  const scrollRestoreAnchorRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(
    null
  )
  const historySessionRef = useRef<string | null>(null)
  const visibleLenRef = useRef(0)

  // 重启后历史条目不重播流式动画：在首次有内容时将所有已存在条目标记为已播出
  const preRevealDoneRef = useRef(false)
  if (!preRevealDoneRef.current && entries.length > 0) {
    preRevealDoneRef.current = true
    for (const e of entries) {
      if (!e.messageId) continue
      if (e.kind === 'assistant') markRevealed(sessionId, e.messageId)
      else if (e.kind === 'thinking') markRevealed(sessionId, `thinking:${e.messageId}`)
    }
  }

  // 重启后「历史 + PTY running」不应触发 loading bar：记录首次加载时的条目数
  // 只要没有新条目出现，就认为是历史恢复，抑制 loading bar
  const startupEntryCountRef = useRef(-1)
  if (startupEntryCountRef.current === -1 && entries.length > 0) {
    startupEntryCountRef.current = entries.length
  }
  const hadHistoryOnMount = startupEntryCountRef.current > 0
  const hasNewEntriesSinceMount = !hadHistoryOnMount || entries.length > startupEntryCountRef.current

  const query = search.trim().toLowerCase()
  const displayedEntries = useMemo(() => {
    const base = query
      ? aggregateToolEntries(visibleEntries)
      : aggregateToolEntries(visibleEntries.slice(historyStartIndex))
    if (!query) return base
    return base.filter((e) => entryMatchesQuery(e, query))
  }, [visibleEntries, historyStartIndex, query])
  const matchedCount = useMemo(
    () => (query ? displayedEntries.filter((e) => entryMatchesQuery(e, query)).length : 0),
    [displayedEntries, query]
  )
  const activeMatchIndex =
    matchedCount > 0 ? ((searchCursor % matchedCount) + matchedCount) % matchedCount : 0

  useEffect(() => {
    if (!focusedToolCall || focusedToolCall.sessionId !== sessionId) return
    const root = scrollRootRef.current
    if (!root) return
    const escapedId = focusedToolCall.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const byId = root.querySelector<HTMLElement>(`[data-transcript-msg="${escapedId}"]`)
    if (byId) {
      byId.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const matchedMessage = byId.getAttribute('data-transcript-msg') ?? undefined
      setFocusPulse({ messageId: matchedMessage, toolName: focusedToolCall.name.toLowerCase() })
      window.setTimeout(
        () =>
          setFocusPulse((prev) =>
            prev?.toolName === focusedToolCall.name.toLowerCase() ? null : prev
          ),
        1800
      )
      return
    }
    const byToolName = root.querySelector<HTMLElement>(
      `[data-transcript-tool~="${focusedToolCall.name.toLowerCase()}"]`
    )
    byToolName?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFocusPulse({ toolName: focusedToolCall.name.toLowerCase() })
    window.setTimeout(
      () => setFocusPulse((prev) => (prev?.toolName === focusedToolCall.name.toLowerCase() ? null : prev)),
      1800
    )
  }, [focusedToolCall, sessionId, displayedEntries])

  useEffect(() => {
    if (!query || matchedCount === 0) return
    const root = scrollRootRef.current
    if (!root) return
    const nodes = root.querySelectorAll<HTMLElement>('[data-transcript-match="1"]')
    if (nodes.length === 0) return
    const idx = Math.min(activeMatchIndex, nodes.length - 1)
    const target = nodes[idx]
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [query, matchedCount, activeMatchIndex])

  useEffect(() => {
    if (matchedCount <= 0) {
      setSearchCursor(0)
      return
    }
    setSearchCursor((n) => ((n % matchedCount) + matchedCount) % matchedCount)
  }, [matchedCount])

  useEffect(() => {
    if (activeSessionId !== sessionId) return
    const onKey = (ev: KeyboardEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'f') return
      ev.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeSessionId, sessionId])

  const updateStickFromScroll = useCallback((): void => {
    const el = scrollRootRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = gap <= SCROLL_BOTTOM_THRESHOLD_PX
    stickToBottomRef.current = near
    setNearBottom(near)
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior): void => {
      const el = scrollRootRef.current
      if (!el) return
      el.scrollTo({ top: el.scrollHeight, behavior })
      stickToBottomRef.current = true
      setNearBottom(true)
    },
    []
  )

  /* [2026-05-06] 原在出现首条非 user 转录时 clearPending，导致思考/工具阶段不再显示等待；改为仅 idle 时清除 */
  /* [2026-05-08] idle 时同步清中断抑制，否则 suppress 长期占用导致下一轮 behavior 异常 */
  useEffect(() => {
    if (sessionStatus === 'idle') {
      useEmbedAwaitingReplyStore.getState().clearPending(sessionId)
      useEmbedInterruptSuppressStore.getState().clear(sessionId)
    }
  }, [sessionStatus, sessionId])

  /* [2026-05-06] 原用 entries 原始末尾：助手完成后斜杠 PTY 回显会在尾部追加 event，导致误判非 assistant、
   * 静默计时被反复打断；且 echo 每 90ms 合并也会重置计时。改为跳过末尾 ptyEcho + assistant 内容指纹。 */
  const lastMeaningfulEntry = useMemo(
    () => lastTranscriptEntryForWorkingBar(visibleEntries),
    [visibleEntries]
  )

  // 统计最后一条用户消息之后所有助手回复的累计 token 消耗（即本次任务的总消耗）
  const sessionTotalUsage = useMemo((): ClaudeTurnTokenUsage | undefined => {
    let lastUserIdx = -1
    for (let i = visibleEntries.length - 1; i >= 0; i--) {
      if (visibleEntries[i].kind === 'user') { lastUserIdx = i; break }
    }
    const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    let hasAny = false
    for (let i = lastUserIdx + 1; i < visibleEntries.length; i++) {
      const e = visibleEntries[i]
      if (e.kind !== 'assistant' || !e.usage) continue
      totals.input += e.usage.input
      totals.output += e.usage.output
      totals.cacheCreate += e.usage.cacheCreate
      totals.cacheRead += e.usage.cacheRead
      hasAny = true
    }
    return hasAny ? totals : undefined
  }, [visibleEntries])

  const assistantTailFingerprint = useMemo(() => {
    const last = lastMeaningfulEntry
    if (!last || last.kind !== 'assistant') return null
    return `${last.messageId ?? 'noid'}:${last.text.length}`
  }, [lastMeaningfulEntry])

  /* [2026-05-06] 助手气泡停止追加后若 PTY_STATUS 仍滞后为 running，超时后隐藏 loading */
  const [assistantTailQuiet, setAssistantTailQuiet] = useState(false)
  useEffect(() => {
    if (assistantTailFingerprint === null) {
      setAssistantTailQuiet(false)
      return
    }
    setAssistantTailQuiet(false)
    const id = window.setTimeout(() => setAssistantTailQuiet(true), 1000)
    return () => clearTimeout(id)
  }, [assistantTailFingerprint])

  const latestToolFresh = Boolean(
    latestTool && Date.now() - latestTool.timestamp < TOOL_LABEL_FRESH_MS
  )
  const runtimeStatusFresh = Boolean(
    runtimeStatus && Date.now() - runtimeStatus.updatedAt < RUNTIME_STATUS_FRESH_MS
  )

  // PTY running + 无新条目 = 重启历史恢复，视同完成；有新条目才是真实运行中的间隙
  const suppressBarAfterAssistantDone =
    assistantTailQuiet &&
    lastMeaningfulEntry?.kind === 'assistant' &&
    !latestToolFresh &&
    (!sessionBusy || !hasNewEntriesSinceMount)

  useEffect(() => {
    if (suppressBarAfterAssistantDone) {
      useEmbedAwaitingReplyStore.getState().clearPending(sessionId)
    }
  }, [suppressBarAfterAssistantDone, sessionId])

  const [workingTick, setWorkingTick] = useState(0)
  const workingStartRef = useRef<number | null>(null)
  const tokenStartRef = useRef<number>(0)
  const [lastUserWaitingUntil, setLastUserWaitingUntil] = useState(0)
  const lastUserWaitingFingerprint = useMemo(() => {
    const last = lastMeaningfulEntry
    if (!last || last.kind !== 'user') return null
    return `${last.messageId ?? 'noid'}:${last.text}`
  }, [lastMeaningfulEntry])

  useEffect(() => {
    if (lastUserWaitingFingerprint === null) {
      setLastUserWaitingUntil(0)
      return
    }
    /* [2026-05-07] 原仅依赖 pending/status/tool；用户消息已出现但 PTY/token 事件延迟时 loading 会短暂空窗。 */
    setLastUserWaitingUntil(Date.now() + USER_WAITING_FALLBACK_MS)
  }, [lastUserWaitingFingerprint])

  void workingTick
  const userWaitingFallbackActive = lastUserWaitingUntil > 0 && Date.now() < lastUserWaitingUntil
  /* [2026-05-09] 原把 sessionStore 的 running 等同「Claude 在干活」；createSession 初始即为 running，
   * 且 claudeSessionWatcher 在从未出现 JSONL usage 前不会发 idle，导致空会话底部条永久「处理中」。 */
  const assistantStreaming =
    lastMeaningfulEntry?.kind === 'assistant' && !assistantTailQuiet
  const transcriptSignalsActiveWork =
    lastMeaningfulEntry?.kind === 'thinking' ||
    lastMeaningfulEntry?.kind === 'tool' ||
    assistantStreaming
  /* [2026-05-11] Claude Code 刚进入 Deliberating 时，JSONL 可能还没有 thinking/tool/assistant，
   * 此时最新有效条目仍是用户消息；只要 PTY running 且是本轮新条目，就显示等待中 loading。 */
  const initialDeliberatingActive =
    sessionBusy &&
    lastMeaningfulEntry?.kind === 'user' &&
    visibleEntries.length > 0 &&
    hasNewEntriesSinceMount

  const showAiWorkingBar =
    /* [2026-05-08] 用户已 Ctrl+C：在 PTY 仍为 running 时也收起处理中条，避免假 loading */
    !interruptSuppress &&
    /* [2026-05-11] 原曾在 nativeTerminalInteractionActive 时隐藏；用户要求终端交互态也显示 loading。 */
    /* [2026-05-07] 原只看 sessionBusy/pending；工具调用期间 token 暂停会让 loading 短暂消失。 */
    /* [2026-05-07] 若转录尾部已是 thinking/tool，说明 Claude 仍在处理中，即使 status 暂为 idle 也显示 loading。 */
    Boolean(
      pendingReply ||
        latestToolFresh ||
        runtimeStatusFresh ||
        userWaitingFallbackActive ||
        transcriptSignalsActiveWork ||
        initialDeliberatingActive ||
        // PTY running + 有新条目 = Claude 仍在工作；避免重启历史恢复误触发
        (sessionBusy && visibleEntries.length > 0 && hasNewEntriesSinceMount)
    ) &&
    !suppressBarAfterAssistantDone

  useEffect(() => {
    if (!showAiWorkingBar) {
      workingStartRef.current = null
      return
    }
    if (workingStartRef.current === null) {
      workingStartRef.current = Date.now()
      // [2026-05-11] 每轮工作开始时记录基线 token，loading 栏显示本轮增量而非累计值
      tokenStartRef.current = useTokenUsageStore.getState().bySession[sessionId]?.output ?? 0
    }
    const id = window.setInterval(() => setWorkingTick((n) => n + 1), 900)
    return () => clearInterval(id)
  }, [showAiWorkingBar, sessionId])

  const aiWorkingLabel = useMemo(() => {
    if (runtimeStatusFresh && runtimeStatus) {
      return runtimeStatus.detail
        ? `${runtimeStatus.label} (${runtimeStatus.detail})`
        : runtimeStatus.label
    }
    return deriveAiWorkingLabel({
      sessionBusy,
      pendingReply: pendingReply || userWaitingFallbackActive,
      lastKind: lastMeaningfulEntry?.kind,
      latestToolName: latestTool?.name,
      toolFresh: latestToolFresh,
      assistantStreaming
    })
  }, [
    workingTick,
    sessionBusy,
    pendingReply,
    runtimeStatus,
    runtimeStatusFresh,
    userWaitingFallbackActive,
    lastMeaningfulEntry?.kind,
    latestTool?.name,
    latestToolFresh,
    assistantStreaming
  ])

  /* [2026-05-09] Fallout 彩蛋：工作状态条 true→false 时触发瓶盖 Toast + LEVEL UP */
  useEffect(() => {
    const wasShowing = prevShowBarRef.current
    prevShowBarRef.current = showAiWorkingBar
    if (!isFallout) return
    if (!wasShowing || showAiWorkingBar) return       // 只在 true→false 时触发
    if (lastMeaningfulEntry?.kind !== 'assistant') return  // 只在助手回复完成时
    // token 总消耗 ÷ 10000，最低 1 瓶盖；无 usage 时固定 1
    const totalTokens = lastMeaningfulEntry.usage
      ? (lastMeaningfulEntry.usage.input + lastMeaningfulEntry.usage.output +
         lastMeaningfulEntry.usage.cacheCreate + lastMeaningfulEntry.usage.cacheRead)
      : 0
    const caps = Math.max(1, Math.floor(totalTokens / 10000))
    setBottleCapCount(caps)
    assistantReplyCountRef.current += 1
    const n = assistantReplyCountRef.current
    if (n % 3 === 0) {
      const level = Math.floor(n / 3) + 1
      setTimeout(() => setLevelUpNum(level), 1400)   // 瓶盖出现后稍延迟
    }
  }, [showAiWorkingBar, isFallout, lastMeaningfulEntry])

  /* [2026-05-08] Fallout 复古光标：仅当底部「处理中」条显示且转录尾部为助手块（流式追加中） */
  const falloutAssistantStreamCaret =
    themeMode === 'fallout' &&
    showAiWorkingBar &&
    assistantStreaming

  /* [2026-05-06] 会话切换或历史条数突变：默认只保留末尾 INITIAL_HISTORY_TAIL 条，减轻 DOM */
  useLayoutEffect(() => {
    const n = visibleEntries.length
    const prevLen = visibleLenRef.current
    visibleLenRef.current = n

    if (historySessionRef.current !== sessionId) {
      historySessionRef.current = sessionId
      setHistoryStartIndex(
        n <= INITIAL_HISTORY_TAIL ? 0 : Math.max(0, n - INITIAL_HISTORY_TAIL)
      )
      return
    }

    if (n > 0 && prevLen === 0 && n > INITIAL_HISTORY_TAIL) {
      setHistoryStartIndex(Math.max(0, n - INITIAL_HISTORY_TAIL))
      return
    }

    if (n < prevLen) {
      setHistoryStartIndex((old) =>
        Math.min(
          old,
          n <= INITIAL_HISTORY_TAIL ? 0 : Math.max(0, n - INITIAL_HISTORY_TAIL)
        )
      )
      return
    }

    setHistoryStartIndex((old) => Math.min(old, Math.max(0, n - 1)))
  }, [sessionId, visibleEntries.length])

  /* [2026-05-06] 向上加载更早消息后恢复视口锚点，避免跳动 */
  useLayoutEffect(() => {
    const a = scrollRestoreAnchorRef.current
    const el = scrollRootRef.current
    if (!a || !el) return
    scrollRestoreAnchorRef.current = null
    const nextH = el.scrollHeight
    el.scrollTop = a.prevScrollTop + (nextH - a.prevScrollHeight)
  }, [historyStartIndex])

  /* [2026-05-06] 切换会话或首次挂载：立即滚到底（layout 后补一帧，避免历史列表高度未稳定） */
  useLayoutEffect(() => {
    stickToBottomRef.current = true
    setNearBottom(true)
    const run = (): void => scrollToBottom('auto')
    run()
    requestAnimationFrame(run)
  }, [sessionId, scrollToBottom])

  /* [2026-05-11] 发送消息时强制滚到底（clientEcho 出现即为刚发送），重置贴底状态 */
  const lastClientEchoRef = useRef<string>('')
  useEffect(() => {
    const last = entries[entries.length - 1]
    if (!last || last.kind !== 'user' || last.clientEcho !== true) return
    const fingerprint = last.text.slice(0, 64)
    if (lastClientEchoRef.current === fingerprint) return
    lastClientEchoRef.current = fingerprint
    stickToBottomRef.current = true
    scrollToBottom('smooth')
  }, [entries, scrollToBottom])

  /* [2026-05-06] 仅在用户当前贴在底部时随新消息下滚；远离底部时不抢滚动位置 */
  useEffect(() => {
    if (!stickToBottomRef.current) return
    scrollToBottom('smooth')
  }, [entries, showAiWorkingBar, scrollToBottom])

  /* [2026-05-06] Markdown/图片等撑高内容时，若仍贴在底部则跟随 */
  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return
    const inner = root.firstElementChild
    if (!inner) return
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        root.scrollTo({ top: root.scrollHeight, behavior: 'auto' })
      }
      updateStickFromScroll()
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [sessionId, entries.length, updateStickFromScroll])

  /* [2026-05-07] PTY echo 原地替换时（entries 数组新引用但长度不变）不触发 ResizeObserver；
   * 强制将 pre 滚到底并读取 scrollHeight 触发浏览器 repaint */
  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return
    const echoEls = root.querySelectorAll<HTMLPreElement>('[data-transcript-pty="slash"] pre')
    echoEls.forEach((pre) => {
      pre.scrollTop = pre.scrollHeight
    })
  }, [entries])

  const handleScrollPane = useCallback((): void => {
    updateStickFromScroll()
    if (scrollRestoreAnchorRef.current) return
    const el = scrollRootRef.current
    if (!el || historyStartIndex <= 0) return
    // [2026-05-11] 内容不超出视口时（如短对话或终端打开后面板变高），scrollTop 恒为 0
    // 不代表用户在历史顶部，不应触发历史加载
    if (el.scrollHeight <= el.clientHeight) return
    if (el.scrollTop > TOP_LOAD_SCROLL_THRESHOLD_PX) return
    scrollRestoreAnchorRef.current = {
      prevScrollHeight: el.scrollHeight,
      prevScrollTop: el.scrollTop
    }
    setHistoryStartIndex((s) => Math.max(0, s - HISTORY_LOAD_CHUNK))
  }, [historyStartIndex, updateStickFromScroll])

  const hasOlderAbove = query.length === 0 && historyStartIndex > 0

  return (
    <>
    <div
      className={`claude-transcript-root flex min-h-0 flex-col overflow-hidden bg-[var(--theme-panel-bg)] ${className}`}
      aria-label="Claude transcript"
    >

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* 搜索框：右上角浮层 */}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-black/40 px-2.5 py-1 shadow-lg backdrop-blur-md transition-all focus-within:border-[var(--theme-accent-border)]/60 focus-within:bg-black/55">
            <svg className="h-3 w-3 shrink-0 text-claude-muted/50" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="4.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索…"
              className="w-20 bg-transparent text-[10px] text-claude-text outline-none placeholder:text-claude-muted/40 focus:w-32 transition-all"
            />
            {query ? (
              <>
                <span className="text-[9px] tabular-nums text-claude-muted/60 px-0.5">{matchedCount === 0 ? '0/0' : `${activeMatchIndex + 1}/${matchedCount}`}</span>
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded text-claude-muted/70 transition-colors hover:bg-white/10 hover:text-claude-text disabled:opacity-30"
                  title="上一个"
                  onClick={() => setSearchCursor((n) => n - 1)}
                  disabled={matchedCount === 0}
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,7 5,3 8,7" /></svg>
                </button>
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded text-claude-muted/70 transition-colors hover:bg-white/10 hover:text-claude-text disabled:opacity-30"
                  title="下一个"
                  onClick={() => setSearchCursor((n) => n + 1)}
                  disabled={matchedCount === 0}
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,3 5,7 8,3" /></svg>
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div
          ref={scrollRootRef}
          onScroll={handleScrollPane}
          className={`h-full min-h-0 overflow-y-auto px-3 py-3 ${showAiWorkingBar ? 'pb-24' : ''}`}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {hasOlderAbove ? (
              <div className="rounded-lg border border-dashed border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-3 py-2 text-center text-[10px] text-claude-muted">
                已在顶部附近 · 继续上滑加载更早的 {Math.min(HISTORY_LOAD_CHUNK, historyStartIndex)} 条…
              </div>
            ) : null}
            {visibleEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-4 py-8 text-center">
                <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-claude-muted">
                  在此查看 Claude Code 的结构化输出。在下方输入并发送后，<span className="text-claude-text/90">你的消息会立即出现在这里</span>
                  ，助手回复随会话文件同步追加。
                </p>
              </div>
            ) : query && displayedEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-4 py-6 text-center text-[11px] text-claude-muted">
                未匹配到“{search.trim()}”相关内容
              </div>
            ) : (
              (() => {
                let runningMatchIndex = -1

                // 搜索模式：扁平渲染，保留高亮逻辑
                if (query) {
                  return displayedEntries.map((e, i) => {
                    const globalIdx = i
                    const messageId = e.messageId
                    const toolTokens =
                      e.kind === 'toolGroup'
                        ? e.tools.map((t) => t.toLowerCase())
                        : e.kind === 'tool'
                          ? [(e.toolName ?? e.text).trim().toLowerCase()]
                          : []
                    const isMatched = entryMatchesQuery(e, query)
                    if (isMatched) runningMatchIndex += 1
                    const isActiveMatch = isMatched && runningMatchIndex === activeMatchIndex
                    const pulseByMsg =
                      Boolean(focusPulse?.messageId) && Boolean(messageId) && focusPulse?.messageId === messageId
                    const pulseToolName = focusPulse?.toolName
                    const pulseByTool = Boolean(pulseToolName) && toolTokens.includes(pulseToolName)
                    return (
                      <div
                        key={e.messageId ? `${e.kind}-${e.messageId}` : `${e.kind}-q${globalIdx}`}
                        data-transcript-msg={messageId}
                        data-transcript-tool={toolTokens.join(' ')}
                        data-transcript-match={isMatched ? '1' : '0'}
                        className={
                          isActiveMatch
                            ? 'rounded-lg ring-1 ring-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)]/20'
                            : pulseByMsg || pulseByTool
                              ? 'rounded-lg ring-1 ring-amber-400/70 bg-amber-500/10 transition'
                              : ''
                        }
                      >
                        <EntryBlock
                          e={e}
                          sessionId={sessionId}
                          isThinkingComplete={displayedEntries.slice(i + 1).some((x) => x.kind === 'assistant')}
                        />
                      </div>
                    )
                  })
                }

                // 正常模式：将连续 thinking/toolGroup 分组进 WorkGroupBlock
                const segments = groupIntoSegments(displayedEntries, historyStartIndex)
                return segments.map((seg) => {
                  if (seg.type === 'workGroup') {
                    return (
                      <WorkGroupBlock
                        key={`wg-${seg.firstGlobalIdx}`}
                        entries={seg.entries}
                        sessionId={sessionId}
                        isComplete={seg.isComplete}
                      />
                    )
                  }
                  const { entry: e, globalIdx } = seg
                  const showAssistantStreamingCursor =
                    falloutAssistantStreamCaret &&
                    e.kind === 'assistant' &&
                    lastMeaningfulEntry?.kind === 'assistant' &&
                    e === lastMeaningfulEntry
                  const messageId = e.messageId
                  const toolTokens =
                    e.kind === 'toolGroup'
                      ? e.tools.map((t) => t.toLowerCase())
                      : e.kind === 'tool'
                        ? [(e.toolName ?? e.text).trim().toLowerCase()]
                        : []
                  const pulseByMsg =
                    Boolean(focusPulse?.messageId) && Boolean(messageId) && focusPulse?.messageId === messageId
                  const pulseToolName = focusPulse?.toolName
                  const pulseByTool = Boolean(pulseToolName) && toolTokens.includes(pulseToolName)
                  return (
                    <div
                      key={e.messageId ? `${e.kind}-${e.messageId}` : `${e.kind}-${globalIdx}`}
                      data-transcript-msg={messageId}
                      data-transcript-tool={toolTokens.join(' ')}
                      data-transcript-match="0"
                      className={
                        pulseByMsg || pulseByTool
                          ? 'rounded-lg ring-1 ring-amber-400/70 bg-amber-500/10 transition'
                          : ''
                      }
                    >
                      <EntryBlock
                        e={e}
                        sessionId={sessionId}
                        showAssistantStreamingCursor={showAssistantStreamingCursor}
                        sessionTotalUsage={e === lastMeaningfulEntry && e.kind === 'assistant' ? sessionTotalUsage : undefined}
                      />
                    </div>
                  )
                })
              })()
            )}
            <div className="h-px shrink-0" aria-hidden />
          </div>
        </div>
        <EmbedAiWorkingBar
          open={showAiWorkingBar}
          label={aiWorkingLabel}
          elapsedSec={workingStartRef.current !== null ? Math.floor((Date.now() - workingStartRef.current) / 1000) : 0}
          outTokens={Math.max(0, (useTokenUsageStore.getState().bySession[sessionId]?.output ?? 0) - tokenStartRef.current)}
        />
        {visibleEntries.length > 0 && !nearBottom ? (
          <button
            type="button"
            className="absolute bottom-4 right-4 z-[14] flex h-9 w-9 items-center justify-center rounded-full border border-[var(--theme-accent-border)] bg-[var(--theme-card-bg)] text-sm text-[var(--theme-accent-text)] shadow-lg shadow-[color:var(--theme-shadow)] backdrop-blur-sm transition hover:bg-[var(--theme-accent-bg-strong)]"
            title="回到底部"
            aria-label="回到底部"
            onClick={() => scrollToBottom('smooth')}
          >
            <span aria-hidden className="select-none pb-0.5 font-mono text-lg leading-none">
              ↓
            </span>
          </button>
        ) : null}
      </div>
    </div>
    {/* [2026-05-09] Fallout 彩蛋：通过 createPortal 挂到 body，不受面板 overflow 裁剪 */}
    {isFallout && bottleCapCount !== null && (
      <FalloutBottleCapToast caps={bottleCapCount} onDone={() => setBottleCapCount(null)} />
    )}
    {isFallout && levelUpNum !== null && (
      <FalloutLevelUpBanner level={levelUpNum} onDone={() => setLevelUpNum(null)} />
    )}
    </>
  )
}
