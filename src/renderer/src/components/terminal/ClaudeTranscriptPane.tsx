import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useEmbedAwaitingReplyStore } from '../../store/embedAwaitingReplyStore'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'
import type { ClaudeTranscriptEntry, ClaudeTurnTokenUsage } from '../../types/ipc'
import { formatLatencyMs, formatTokenCount } from '../../lib/formatTokens'
import { useNativeTerminalRequestStore } from '../../store/nativeTerminalRequestStore'

interface Props {
  sessionId: string
  className?: string
}

const TOOL_LABEL_FRESH_MS = 18_000

interface ToolGroupEntry {
  kind: 'toolGroup'
  text: string
  tools: string[]
  messageId?: string
}

type DisplayEntry = ClaudeTranscriptEntry | ToolGroupEntry

/** [2026-05-06] 底部固定条：会话 running 或已发送待响应时持续显示 loading，覆盖思考/工具/输出阶段 */
function EmbedAiWorkingBar({ label, open }: { label: string; open: boolean }): React.ReactElement | null {
  if (!open) return null
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
  if (latestToolName && toolFresh) {
    /* [2026-05-07] 原仅 sessionBusy 时显示工具名；PTY 状态短暂 idle 时也应提示工具仍在运行。 */
    return `运行工具 · ${latestToolName}`
  }
  if (pendingReply && !sessionBusy) return '已发送，等待 Claude 响应…'
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

function requiresNativeTerminalTool(e: ClaudeTranscriptEntry): boolean {
  if (e.kind !== 'tool') return false
  const name = (e.toolName ?? e.text).trim()
  return e.requiresNativeTerminal === true || name === 'AskUserQuestion'
}

function ToolGroupBlock({ tools }: { tools: string[] }): React.ReactElement {
  const counts = new Map<string, number>()
  for (const name of tools) counts.set(name, (counts.get(name) ?? 0) + 1)
  const compact = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  const preview = compact.slice(0, 4).join(' · ')
  const rest = Math.max(0, compact.length - 4)
  return (
    <div className="flex w-full justify-start">
      <details className="group inline-flex max-w-[min(100%,34rem)] flex-col rounded-xl border border-[var(--theme-tool-border)] bg-[var(--theme-tool-bg)] px-3 py-2 text-[11px] text-[var(--theme-accent-text)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 rounded bg-[var(--theme-accent-bg)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--theme-accent-muted)]">
            tools
          </span>
          <span className="font-semibold">工具调用 · {tools.length}</span>
          {preview ? <code className="truncate font-mono text-[10px] text-[var(--theme-accent-text)] opacity-80">{preview}{rest > 0 ? ` · +${rest}` : ''}</code> : null}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--theme-tool-border)] pt-2">
          {compact.map((name) => (
            <code key={name} className="rounded-md border border-[var(--theme-tool-border)] bg-[var(--theme-panel-bg-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--theme-accent-text)]">
              {name}
            </code>
          ))}
        </div>
      </details>
    </div>
  )
}

function EntryBlock({
  e,
  sessionId
}: {
  e: DisplayEntry
  sessionId: string
}): React.ReactElement {
  if (e.kind === 'toolGroup') {
    return <ToolGroupBlock tools={e.tools} />
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
        {/* [2026-05-06] 默认展开；仍可点击标题收起 */}
        <details
          open
          className="group w-full max-w-3xl rounded-xl border border-[var(--theme-thinking-border)] bg-[var(--theme-thinking-bg)] px-3 py-2 ring-1 ring-[var(--theme-thinking-border)]"
        >
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-thinking-text)] [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 inline-block text-[var(--theme-accent-muted)]">◇</span>
            思考过程
            <span className="ml-2 text-[9px] font-normal normal-case text-[var(--theme-thinking-text)] opacity-50 group-open:hidden">点击展开</span>
          </summary>
          <pre className="mt-2 max-h-[min(320px,40vh)] overflow-auto whitespace-pre-wrap border-t border-[var(--theme-thinking-border)] pt-2 font-mono text-[11px] leading-relaxed text-[var(--theme-thinking-text)]">
            {e.text}
          </pre>
        </details>
      </div>
    )
  }
  if (e.kind === 'user') {
    return (
      <div className="flex w-full justify-end">
        <div className="fo-user-bubble max-w-[min(100%,28rem)] rounded-2xl rounded-br-md border border-[var(--theme-user-border)] bg-[var(--theme-user-bg)] px-3.5 py-2.5 shadow-md shadow-[color:var(--theme-shadow)]">
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
    return (
      <div className="flex w-full justify-start">
        <div className="fo-assistant-bubble max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-3.5 py-2.5 shadow-lg shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-panel-border)]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-claude-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-success-text)]" aria-hidden />
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
  let pendingMessageId: string | undefined

  const flushTools = (): void => {
    if (pendingTools.length === 0) return
    out.push({
      kind: 'toolGroup',
      text: pendingTools.join('\n'),
      tools: pendingTools,
      messageId: pendingMessageId
    })
    pendingTools = []
    pendingMessageId = undefined
  }

  for (const e of entries) {
    if (e.kind === 'tool' && !requiresNativeTerminalTool(e)) {
      /* [2026-05-07] 原连续 tool 各占一行，批量 Read/Write/Edit 时信息密度过高；展示层合并成一个工具组。 */
      pendingMessageId ??= e.messageId
      pendingTools.push((e.toolName ?? e.text).trim())
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
    () => aggregateToolEntries(visibleEntries.slice(historyStartIndex)),
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

  const latestToolFresh = Boolean(
    latestTool && Date.now() - latestTool.timestamp < TOOL_LABEL_FRESH_MS
  )

  const suppressBarAfterAssistantDone =
    assistantTailQuiet && lastMeaningfulEntry?.kind === 'assistant' && !latestToolFresh

  useEffect(() => {
    if (suppressBarAfterAssistantDone) {
      useEmbedAwaitingReplyStore.getState().clearPending(sessionId)
    }
  }, [suppressBarAfterAssistantDone, sessionId])

  const [workingTick, setWorkingTick] = useState(0)
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
  const activeTranscriptTail =
    lastMeaningfulEntry?.kind === 'thinking' || lastMeaningfulEntry?.kind === 'tool'

  const showAiWorkingBar =
    /* [2026-05-07] 原只看 sessionBusy/pending；工具调用期间 token 暂停会让 loading 短暂消失。 */
    /* [2026-05-07] 若转录尾部已是 thinking/tool，说明 Claude 仍在处理中，即使 status 暂为 idle 也显示 loading。 */
    Boolean(
      sessionBusy ||
        pendingReply ||
        latestToolFresh ||
        userWaitingFallbackActive ||
        activeTranscriptTail
    ) &&
    !suppressBarAfterAssistantDone

  useEffect(() => {
    if (!showAiWorkingBar) return
    const id = window.setInterval(() => setWorkingTick((n) => n + 1), 900)
    return () => clearInterval(id)
  }, [showAiWorkingBar])

  const aiWorkingLabel = useMemo(() => {
    return deriveAiWorkingLabel({
      sessionBusy,
      pendingReply: pendingReply || userWaitingFallbackActive,
      lastKind: lastMeaningfulEntry?.kind,
      latestToolName: latestTool?.name,
      toolFresh: latestToolFresh
    })
  }, [
    workingTick,
    sessionBusy,
    pendingReply,
    userWaitingFallbackActive,
    lastMeaningfulEntry?.kind,
    latestTool?.name,
    latestToolFresh
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
      className={`claude-transcript-root flex min-h-0 flex-col overflow-hidden bg-[var(--theme-panel-bg)] ${className}`}
      aria-label="Claude transcript"
    >
      <header className="shrink-0 border-b border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--theme-accent-bg)] text-sm text-[var(--theme-accent-muted)] ring-1 ring-[var(--theme-accent-border)]">
              ◈
            </span>
            <div>
              <div className="text-[11px] font-semibold tracking-tight text-claude-text">会话</div>
              <div className="text-[9px] text-claude-muted">思考块 · 工具 · 每条助手气泡底部 token · 底部为会话累计</div>
            </div>
          </div>
          <span className="rounded-full border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-claude-muted">
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
            ) : (
              displayedEntries.map((e, i) => {
                const globalIdx = historyStartIndex + i
                return (
                  <EntryBlock
                    key={`${e.kind}-${e.messageId ?? 'noid'}-${globalIdx}-${e.text.slice(0, 24)}`}
                    e={e}
                    sessionId={sessionId}
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
  )
}
