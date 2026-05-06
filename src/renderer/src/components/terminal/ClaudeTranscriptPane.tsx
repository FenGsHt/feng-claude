import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useEmbedAwaitingReplyStore } from '../../store/embedAwaitingReplyStore'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'
import type { ClaudeTranscriptEntry, ClaudeTurnTokenUsage } from '../../types/ipc'
import { formatLatencyMs, formatTokenCount } from '../../lib/formatTokens'

interface Props {
  sessionId: string
  className?: string
}

const TOOL_LABEL_FRESH_MS = 18_000

/** [2026-05-06] 底部固定条：会话 running 或已发送待响应时持续显示 loading，覆盖思考/工具/输出阶段 */
function EmbedAiWorkingBar({ label, open }: { label: string; open: boolean }): React.ReactElement | null {
  if (!open) return null
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 z-[12] px-3 pb-3 pt-6"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-amber-500/35 bg-[#0c0c0d]/95 px-3 py-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <span
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-amber-50/95">{label}</p>
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
}): string {
  const { sessionBusy, pendingReply, lastKind, latestToolName, toolFresh } = args
  if (pendingReply && !sessionBusy) return '已发送，等待 Claude 响应…'
  if (sessionBusy && latestToolName && toolFresh) {
    return `运行工具 · ${latestToolName}`
  }
  if (!sessionBusy) return '等待中…'
  switch (lastKind) {
    case 'thinking':
      return '思考中…'
    case 'tool':
      return '运行工具…'
    case 'assistant':
      return '正在输出回复…'
    default:
      return 'Claude 处理中…'
  }
}

/** [2026-05-06] 助手气泡底部：JSONL usage + 外嵌首包耗时 */
function AssistantReplyMeta({
  usage,
  latencyMs
}: {
  usage?: ClaudeTurnTokenUsage
  latencyMs?: number
}): React.ReactElement | null {
  const sum = usage
    ? usage.input + usage.output + usage.cacheCreate + usage.cacheRead
    : 0
  const hasTok = Boolean(usage && sum > 0)
  if (latencyMs === undefined && !hasTok) return null
  return (
    <div className="mt-2 space-y-1.5 border-t border-white/[0.07] pt-2">
      {latencyMs !== undefined ? (
        <div className="text-[9px] text-claude-muted" title="从发送到本条助手出现在此列表的耗时">
          耗时{' '}
          <span className="font-mono tabular-nums text-sky-400/90">{formatLatencyMs(latencyMs)}</span>
        </div>
      ) : null}
      {hasTok && usage ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] tabular-nums text-claude-muted">
          <span title="input">in {formatTokenCount(usage.input)}</span>
          <span className="text-white/15">·</span>
          <span title="output">out {formatTokenCount(usage.output)}</span>
          {usage.cacheCreate > 0 || usage.cacheRead > 0 ? (
            <>
              <span className="text-white/15">·</span>
              <span title="cache">
                cache +{formatTokenCount(usage.cacheCreate)} / {formatTokenCount(usage.cacheRead)}
              </span>
            </>
          ) : null}
          <span className="text-white/15">·</span>
          <span className="font-semibold text-emerald-400/85" title="本条回复合计">
            Σ {formatTokenCount(sum)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function EntryBlock({ e }: { e: ClaudeTranscriptEntry }): React.ReactElement {
  if (e.kind === 'history') {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 shadow-inner">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-claude-muted">
          <span className="text-[11px] opacity-70">◇</span>
          先前终端缓冲
        </div>
        <pre className="max-h-[min(280px,35vh)] overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-claude-text/85">
          {e.text}
        </pre>
      </div>
    )
  }
  if (e.kind === 'event') {
    /* [2026-05-06] 仅渲染 PTY 外嵌 echo；会话记录类 event 已在列表层过滤 */
    if (e.ptyEcho !== true) return null
    /* [2026-05-06] 外嵌 PTY 仅用于斜杠命令（/help、/mcp）；专用样式避免与助手 Markdown 气泡混淆 */
    return (
      <div
        className="claude-transcript-pty-echo claude-transcript-pty-echo--slash w-full max-w-3xl rounded-xl border border-emerald-500/25 bg-gradient-to-br from-[#0a1210] via-[#0c1012] to-[#0a0c10] px-3 py-2.5 shadow-inner shadow-black/40 ring-1 ring-emerald-500/10"
        data-transcript-pty="slash"
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">
          <span className="font-mono text-[11px] normal-case tracking-normal text-emerald-300/80">/</span>
          终端输出（外嵌）
        </div>
        <pre className="max-h-[min(420px,52vh)] overflow-auto whitespace-pre-wrap rounded-lg bg-black/35 px-2 py-2 font-mono text-[10px] leading-[1.55] text-emerald-50/85 [scrollbar-width:thin]">
          {e.text}
        </pre>
      </div>
    )
  }
  if (e.kind === 'thinking') {
    return (
      <div className="flex w-full justify-start">
        {/* [2026-05-06] 默认展开；仍可点击标题收起 */}
        <details
          open
          className="group w-full max-w-3xl rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-950/40 to-[#1a1525] px-3 py-2 ring-1 ring-violet-500/10 open:ring-violet-400/25"
        >
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-violet-300/90 [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 inline-block text-violet-400">◇</span>
            思考过程
            <span className="ml-2 text-[9px] font-normal normal-case text-violet-200/50 group-open:hidden">点击展开</span>
          </summary>
          <pre className="mt-2 max-h-[min(320px,40vh)] overflow-auto whitespace-pre-wrap border-t border-violet-500/10 pt-2 font-mono text-[11px] leading-relaxed text-violet-100/90">
            {e.text}
          </pre>
        </details>
      </div>
    )
  }
  if (e.kind === 'user') {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md border border-amber-500/35 bg-gradient-to-br from-amber-500/15 to-amber-600/5 px-3.5 py-2.5 shadow-md shadow-black/20">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-amber-400/90">你</div>
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-claude-text">{e.text}</pre>
        </div>
      </div>
    )
  }
  if (e.kind === 'tool') {
    return (
      <div className="flex w-full justify-start">
        <div className="inline-flex max-w-[min(100%,28rem)] items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-3 py-1.5 text-[11px] text-amber-100/95">
          <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
            tool
          </span>
          <code className="truncate font-mono text-[11px]">{e.text}</code>
        </div>
      </div>
    )
  }
  if (e.kind === 'assistant') {
    return (
      <div className="flex w-full justify-start">
        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-white/[0.08] bg-[#1c1c1e] px-3.5 py-2.5 shadow-lg shadow-black/25 ring-1 ring-white/[0.04]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-claude-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" aria-hidden />
            Claude
          </div>
          <div className="prose prose-invert max-w-none text-[12px] leading-relaxed prose-p:my-1.5 prose-pre:my-2">
            <MarkdownRenderer content={e.text} />
          </div>
          <AssistantReplyMeta usage={e.usage} latencyMs={e.latencyMs} />
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

/** [2026-05-06] 去掉所有 JSONL 兜底「会话记录」；仅保留 ptyEcho 的终端外嵌块 */
function filterNoiseTranscriptEntries(entries: ClaudeTranscriptEntry[]): ClaudeTranscriptEntry[] {
  return entries.filter((e) => e.kind !== 'event' || e.ptyEcho === true)
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
  const entries = useTranscriptStore((s) => s.bySession[sessionId] ?? [])
  const visibleEntries = useMemo(() => filterNoiseTranscriptEntries(entries), [entries])
  const pendingReply = useEmbedAwaitingReplyStore((s) => s.pendingBySession[sessionId] === true)
  const sessionStatus =
    useSessionStore((s) => s.sessions.find((x) => x.id === sessionId)?.status ?? 'idle')
  const sessionBusy = sessionStatus === 'running'
  const latestTool = useToolCallStore((s) => s.calls.find((c) => c.sessionId === sessionId))
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const [nearBottom, setNearBottom] = useState(true)
  /** [2026-05-06] 仅渲染 visibleEntries[startIndex..]；上滑加载更早消息 */
  const [historyStartIndex, setHistoryStartIndex] = useState(0)
  const scrollRestoreAnchorRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(
    null
  )
  const historySessionRef = useRef<string | null>(null)
  const visibleLenRef = useRef(0)

  const displayedEntries = useMemo(
    () => visibleEntries.slice(historyStartIndex),
    [visibleEntries, historyStartIndex]
  )

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
  useEffect(() => {
    if (sessionStatus === 'idle') {
      useEmbedAwaitingReplyStore.getState().clearPending(sessionId)
    }
  }, [sessionStatus, sessionId])

  /* [2026-05-06] 原用 entries 原始末尾：助手完成后斜杠 PTY 回显会在尾部追加 event，导致误判非 assistant、
   * 静默计时被反复打断；且 echo 每 90ms 合并也会重置计时。改为跳过末尾 ptyEcho + assistant 内容指纹。 */
  const lastMeaningfulEntry = useMemo(
    () => lastTranscriptEntryForWorkingBar(visibleEntries),
    [visibleEntries]
  )

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

  const suppressBarAfterAssistantDone =
    assistantTailQuiet && lastMeaningfulEntry?.kind === 'assistant'

  useEffect(() => {
    if (suppressBarAfterAssistantDone) {
      useEmbedAwaitingReplyStore.getState().clearPending(sessionId)
    }
  }, [suppressBarAfterAssistantDone, sessionId])

  const showAiWorkingBar =
    Boolean(sessionBusy || pendingReply) && !suppressBarAfterAssistantDone

  const [workingTick, setWorkingTick] = useState(0)
  useEffect(() => {
    if (!showAiWorkingBar) return
    const id = window.setInterval(() => setWorkingTick((n) => n + 1), 900)
    return () => clearInterval(id)
  }, [showAiWorkingBar])

  const aiWorkingLabel = useMemo(() => {
    void workingTick
    const toolFresh = Boolean(
      latestTool && Date.now() - latestTool.timestamp < TOOL_LABEL_FRESH_MS
    )
    return deriveAiWorkingLabel({
      sessionBusy,
      pendingReply,
      lastKind: lastMeaningfulEntry?.kind,
      latestToolName: latestTool?.name,
      toolFresh
    })
  }, [
    workingTick,
    sessionBusy,
    pendingReply,
    lastMeaningfulEntry?.kind,
    latestTool?.name,
    latestTool?.timestamp
  ])

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

  const handleScrollPane = useCallback((): void => {
    updateStickFromScroll()
    if (scrollRestoreAnchorRef.current) return
    const el = scrollRootRef.current
    if (!el || historyStartIndex <= 0) return
    if (el.scrollTop > TOP_LOAD_SCROLL_THRESHOLD_PX) return
    scrollRestoreAnchorRef.current = {
      prevScrollHeight: el.scrollHeight,
      prevScrollTop: el.scrollTop
    }
    setHistoryStartIndex((s) => Math.max(0, s - HISTORY_LOAD_CHUNK))
  }, [historyStartIndex, updateStickFromScroll])

  const hasOlderAbove = historyStartIndex > 0

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-gradient-to-b from-[#121212] via-[#141414] to-[#101010] ${className}`}
      aria-label="Claude transcript"
    >
      <header className="shrink-0 border-b border-white/[0.06] bg-black/20 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-sm text-amber-400/90 ring-1 ring-amber-500/25">
              ◈
            </span>
            <div>
              <div className="text-[11px] font-semibold tracking-tight text-claude-text">会话</div>
              <div className="text-[9px] text-claude-muted">思考块 · 工具 · 每条助手气泡底部 token · 底部为会话累计</div>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-claude-muted">
            Beta
          </span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRootRef}
          onScroll={handleScrollPane}
          className={`h-full min-h-0 overflow-y-auto px-3 py-3 ${showAiWorkingBar ? 'pb-24' : ''}`}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {hasOlderAbove ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[10px] text-claude-muted">
                已在顶部附近 · 继续上滑加载更早的 {Math.min(HISTORY_LOAD_CHUNK, historyStartIndex)} 条…
              </div>
            ) : null}
            {visibleEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-claude-muted">
                  在此查看 Claude Code 的结构化输出。在下方输入并发送后，<span className="text-claude-text/90">你的消息会立即出现在这里</span>
                  ，助手回复随会话文件同步追加。
                </p>
              </div>
            ) : (
              displayedEntries.map((e, i) => {
                const globalIdx = historyStartIndex + i
                return (
                  <EntryBlock
                    key={`${e.kind}-${e.messageId ?? 'noid'}-${globalIdx}-${e.text.slice(0, 24)}`}
                    e={e}
                  />
                )
              })
            )}
            <div className="h-px shrink-0" aria-hidden />
          </div>
        </div>
        <EmbedAiWorkingBar open={showAiWorkingBar} label={aiWorkingLabel} />
        {visibleEntries.length > 0 && !nearBottom ? (
          <button
            type="button"
            className="absolute bottom-4 right-4 z-[14] flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/35 bg-[#1c1c1e]/95 text-sm text-amber-200 shadow-lg shadow-black/40 backdrop-blur-sm transition hover:border-amber-400/50 hover:bg-[#252528] hover:text-amber-50"
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
  )
}
