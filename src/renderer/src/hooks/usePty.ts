import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'
import { ingestEmbedPtyEcho } from '../lib/embedPtyTranscriptEcho'
import { writeToTerminal, commitUserPrompt, hasUserInputPending } from '../components/terminal/XTerminal'
import { useTokenUsageStore } from '../store/tokenUsageStore'
import { useGlobalTokenStore } from '../store/globalTokenStore'
import { useToolCallStore } from '../store/toolCallStore'
import { enqueueTranscriptTokenDelta, useTranscriptStore } from '../store/transcriptStore'
import { useNativeTerminalRequestStore } from '../store/nativeTerminalRequestStore'
import { useEmbedAwaitingReplyStore } from '../store/embedAwaitingReplyStore'
import { useEmbedInterruptSuppressStore } from '../store/embedInterruptSuppressStore'
import { useClaudeRuntimeStatusStore } from '../store/claudeRuntimeStatusStore'
import { feedPtyChunkForTokenUsage } from '../lib/claudeTokenUsageParse'
import { useOsc9ProgressStore } from '../store/osc9ProgressStore'
import {
  feedPtyAlternateScreenFromOutput,
  isPtyAlternateScreenActive,
  clearPtyAlternateScreenSession,
  markPtySessionIdle
} from '../store/ptyAlternateScreenStore'
import { stripAnsi } from '../lib/stripAnsi'
import { setBracketedPasteMode } from '../lib/bracketedPasteMode'

/**
 * Global hook — subscribes to PTY output and routes data to xterm instances.
 * Token usage comes exclusively from the JSONL watcher (accurate, per-turn deltas).
 * The old regex fallback has been removed — it was matching Claude's context window
 * display text (e.g. "256k tokens") and inflating counts incorrectly.
 * Mount once at the App root.
 */

// idle 转为通知前的延迟：等待 12s 覆盖大多数工具执行时间，期间若重新变 running 则取消
const NOTIFY_DELAY_MS = 12_000
const lastTokenTime = new Map<string, number>()
const notifyTimers = new Map<string, ReturnType<typeof setTimeout>>()
// 每轮任务最多发一次通知；用户发新消息后才重置，避免工具调用链触发多次
const notifiedThisTurn = new Set<string>()
const runtimeStatusTailBySession = new Map<string, string>()
const runtimeStatusTouchAtBySession = new Map<string, number>()

const TERMINAL_INTERACTION_HINT_RE =
  /Enter to select|(?:↑|↓|\^|\x1b\[A|\x1b\[B).*to navigate|Esc to cancel|Space to cycle|Search skills|Do you want to proceed|Would you like to|Allow this action|Press Enter to confirm|yes\/no|Y\/n\)?[\s]*$/im
// [2026-05-11] 有 spinner 字符时接受任意大写开头的词（Sprouting 等未知词）；无 spinner 时保守白名单
const CLAUDE_RUNTIME_STATUS_SPINNER_RE =
  /^\s*[✱✻✳*•·]\s+([A-Z][^()\r\n]*?)(?:\s*\(([^)]*)\))?\s*$/
const CLAUDE_RUNTIME_STATUS_WORD_RE =
  /^\s*((?:Deliberating|Building|Creating|Editing|Writing|Reading|Searching|Planning|Running)[^()\r\n]*?)(?:\s*\(([^)]*)\))?\s*$/i

function extractClaudeRuntimeStatus(text: string): { label: string; detail?: string } | null {
  const lines = text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-20)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    const m = line.match(CLAUDE_RUNTIME_STATUS_SPINNER_RE) ?? line.match(CLAUDE_RUNTIME_STATUS_WORD_RE)
    if (!m) continue
    const label = m[1]?.trim()
    if (!label) continue
    const detail = m[2]?.trim()
    return detail ? { label, detail } : { label }
  }
  return null
}

function appendRuntimeStatusTail(sessionId: string, text: string): string {
  const prev = runtimeStatusTailBySession.get(sessionId) ?? ''
  const next = `${prev}\n${text}`.slice(-2000)
  runtimeStatusTailBySession.set(sessionId, next)
  return next
}

function touchRuntimeStatusThrottled(sessionId: string): void {
  const now = Date.now()
  const last = runtimeStatusTouchAtBySession.get(sessionId) ?? 0
  if (now - last < 500) return
  runtimeStatusTouchAtBySession.set(sessionId, now)
  useClaudeRuntimeStatusStore.getState().touchRuntimeStatus(sessionId)
}

function setRuntimeStatusThrottled(
  sessionId: string,
  status: { label: string; detail?: string }
): void {
  const now = Date.now()
  const current = useClaudeRuntimeStatusStore.getState().bySession[sessionId]
  const same = current?.label === status.label && current?.detail === status.detail
  const last = runtimeStatusTouchAtBySession.get(sessionId) ?? 0
  if (same && now - last < 500) return
  runtimeStatusTouchAtBySession.set(sessionId, now)
  useClaudeRuntimeStatusStore.getState().setRuntimeStatus(sessionId, status)
}

function shouldKeepEmbedLoadingForTranscript(
  entries: Array<{ kind: string; text: string }>
): boolean {
  return entries.some((e) => {
    if (e.kind === 'thinking' || e.kind === 'tool') return true
    if (e.kind !== 'user') return false
    const text = e.text.trim()
    return (
      /* [2026-05-07] 原 AskUserQuestion 回答回执不走普通输入 markPending，Claude 继续运行时 loading 会短暂消失。 */
      text.includes('User has answered your questions') ||
      text.includes("You can now continue with the user's answers in mind")
    )
  })
}

function notifyTaskDone(sessionId: string): void {
  if (!lastTokenTime.has(sessionId)) return
  if (notifiedThisTurn.has(sessionId)) return  // 本轮已通知，等用户发新消息才重置
  const existing = notifyTimers.get(sessionId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    notifyTimers.delete(sessionId)
    if (notifiedThisTurn.has(sessionId)) return  // 二次校验
    notifiedThisTurn.add(sessionId)
    window.electronAPI.settings.get().then((s) => {
      if (s.enableNotifications === false) return
      window.electronAPI?.showNotification('Feng Claude', 'Task completed')
    }).catch(() => {})
  }, NOTIFY_DELAY_MS)
  notifyTimers.set(sessionId, timer)
}

function cancelNotify(sessionId: string): void {
  const t = notifyTimers.get(sessionId)
  if (t) { clearTimeout(t); notifyTimers.delete(sessionId) }
}

/** 用户发新消息时调用，重置本轮通知状态 */
function resetNotifyTurn(sessionId: string): void {
  notifiedThisTurn.delete(sessionId)
  cancelNotify(sessionId)
}

export function usePty(): void {
  const { updateSessionStatus } = useSessionStore()

  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      useEmbedOutputBetaStore.getState().setEnabled(s.embedClaudeOutputBeta === true)
    })
    const offEmbedSettings = window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then((s) => {
        useEmbedOutputBetaStore.getState().setEnabled(s.embedClaudeOutputBeta === true)
      })
    })

    // ── PTY output: write to terminal ────────────────────────
    /* [2026-05-08] 任意 Ctrl+C 进 PTY：清 pending + 收起「处理中」。去掉末尾乐观气泡仅在 EmbedSessionComposer 内按正文匹配执行，避免斜杠 TUI 等误删历史「你」气泡 */
    const unsubIntr = window.electronAPI.onPtyIntrSent((payload) => {
      useEmbedAwaitingReplyStore.getState().clearPending(payload.sessionId)
      useEmbedInterruptSuppressStore.getState().setInterrupted(payload.sessionId)
      useClaudeRuntimeStatusStore.getState().clearRuntimeStatus(payload.sessionId)
      runtimeStatusTailBySession.delete(payload.sessionId)
      runtimeStatusTouchAtBySession.delete(payload.sessionId)
      /* [2026-05-12] 部分 TUI 退出时未回传 ?1049l，备用屏标志会卡死，外嵌「发送」永远被挡；中断后清标志便于继续输入 */
      clearPtyAlternateScreenSession(payload.sessionId)
    })
    const unsubInputAck = window.electronAPI.onPtyInputAck((_payload) => {
      // ACK confirms PTY write; no-op in release builds
    })

    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      const { sessionId, data } = payload
      // [2026-05-12] 检测 Bracketed Paste 模式开关（\x1b[?2004h = 开，\x1b[?2004l = 关）
      if (/\x1b\[\?2004h/.test(data)) {
        setBracketedPasteMode(sessionId, true)
      } else if (/\x1b\[\?2004l/.test(data)) {
        setBracketedPasteMode(sessionId, false)
      }
      /* [2026-05-13] OSC 9;4 进度条：\x1b]9;4;<percent>\x07 或 \x1b]9;4;<percent>;<message>\x07 */
      const oscRe = /\x1b]9;4;(\d{1,3})(?:;([^\x07]*))?\x07/g
      let m: RegExpExecArray | null
      let lastPercent = -1
      let lastMsg: string | undefined
      while ((m = oscRe.exec(data)) !== null) {
        lastPercent = parseInt(m[1], 10)
        lastMsg = m[2] || undefined
      }
      if (lastPercent >= 0) {
        useOsc9ProgressStore.getState().setProgress(sessionId, lastPercent, lastMsg)
      } else if (/\x1b]9;4;\x07/.test(data)) {
        /* 空参数 = 清除进度 */
        useOsc9ProgressStore.getState().clearProgress(sessionId)
      }
      const plain = stripAnsi(data)
      const tail = appendRuntimeStatusTail(sessionId, plain)
      const runtimeStatus = extractClaudeRuntimeStatus(tail)
      if (runtimeStatus) {
        setRuntimeStatusThrottled(sessionId, runtimeStatus)
      } else if (plain.trim().length > 0) {
        /* [2026-05-11] Claude Code 状态行常用 \r/局部刷新，单个 chunk 不一定完整命中；
         * 一旦本轮捕获过状态，只要 PTY 仍在输出非空内容，就刷新 updatedAt 续命。 */
        touchRuntimeStatusThrottled(sessionId)
      }
      /* [2026-05-07] 剥离 ANSI 后再检测：权限提示字符间夹有转义码会导致原始 data 匹配失败 */
      if (TERMINAL_INTERACTION_HINT_RE.test(plain)) {
        useNativeTerminalRequestStore.getState().requestNativeTerminal(sessionId, '检测到终端交互')
      }
      writeToTerminal(sessionId, data)
      /* [2026-05-12] 解析上下文窗口用量等 token 信息 */
      feedPtyChunkForTokenUsage(sessionId, data)
      /* [2026-05-06] 原顺序为先 ingestEmbedPtyEcho 再 feedPtyAlternateScreenFromOutput；
       * 导致同一 TCP chunk 末尾的 ?1049h 尚未入账时仍整段写入转录，全屏 TUI 帧污染外嵌区。
       * 改为先 feed 更新备用屏，再按状态决定是否 ingest（备用屏内丢弃除「进入前的包内前缀」外的字节）。 */
      feedPtyAlternateScreenFromOutput(sessionId, data)
      /* [2026-05-06] 全屏 TUI（如 /help）在备用屏阶段的重绘经 stripAnsi 仍会污染外嵌列表；备用屏激活时跳过，
       * 仅保留进入全屏前同包内的前缀文本；退出 ?1049l 后的主屏输出照常 ingest */
      if (isPtyAlternateScreenActive(sessionId)) {
        const enterAlt = data.search(/\x1b\[\?(1049|1047)h/)
        if (enterAlt > 0) ingestEmbedPtyEcho(sessionId, data.slice(0, enterAlt))
      } else {
        ingestEmbedPtyEcho(sessionId, data)
      }
    })

    // ── PTY status changes ────────────────────────────────────
    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      const { sessionId, status } = payload
      if (status === 'running') {
        cancelNotify(sessionId)
      }
      if (status === 'idle') {
        notifyTaskDone(sessionId)
        useClaudeRuntimeStatusStore.getState().clearRuntimeStatus(sessionId)
        runtimeStatusTailBySession.delete(sessionId)
        runtimeStatusTouchAtBySession.delete(sessionId)
        /* [2026-05-12] 与中断同理：idle 表示主循环可接受新输入，清掉误粘的备用屏状态，避免外嵌无法发送 */
        /* [2026-05-12] markPtySessionIdle 先于 clear：宽限期阻止 idle 后仍在途的 ?1049h chunk 重新锁定 */
        markPtySessionIdle(sessionId)
        clearPtyAlternateScreenSession(sessionId)
        /* [2026-05-07] 原只有 slash echo 结束会清浮窗；AskUserQuestion 等通用 TUI 完成后也要同步关闭需求状态。 */
        useNativeTerminalRequestStore.getState().clearNativeTerminal(sessionId)
      }
      /* [2026-05-07] waiting_input = Claude Code 等待用户确认（如 MCP 权限弹窗）→ 自动打开浮窗以便用户交互 */
      if (status === 'waiting_input') {
        useNativeTerminalRequestStore.getState().requestNativeTerminal(sessionId, '等待输入确认')
      }
      updateSessionStatus(sessionId, status as any)
    })

    // ── JSONL token usage (sole accurate source) ──────────────
    const unsubTokens = window.electronAPI.onTokenUsageUpdate((payload) => {
      const { sessionId, input, output, cacheCreate, cacheRead, reset } = payload
      lastTokenTime.set(sessionId, Date.now())

      if (input > 0 || output > 0) {
        // 有用户输入缓冲 = 用户发了新消息，重置本轮通知状态
        if (hasUserInputPending(sessionId)) {
          resetNotifyTurn(sessionId)
        }
        commitUserPrompt(sessionId)
      }

      useTokenUsageStore.getState().ingest(sessionId, input, output, 'add', { cacheCreate, cacheRead })

      const cc = cacheCreate ?? 0
      const cr = cacheRead ?? 0
      if (input + output + cc + cr > 0) {
        enqueueTranscriptTokenDelta(sessionId, {
          input,
          output,
          cacheCreate: cc,
          cacheRead: cr
        })
      }

      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId)
      const profileId = session?.profileId

      useGlobalTokenStore.getState().ingest({
        input,
        output,
        cacheCreate: cacheCreate ?? 0,
        cacheRead: cacheRead ?? 0
      }, profileId)
    })

    // ── Tool call updates ─────────────────────────────────────
    const unsubTools = window.electronAPI.onToolCallUpdate((payload) => {
      /* [2026-05-07] 原仅普通输入 markPending；进入工具执行但 token 暂停时外嵌 loading 会短暂消失。 */
      useEmbedAwaitingReplyStore.getState().markPending(payload.sessionId)
      useToolCallStore.getState().addCall({
        id: payload.toolId,
        sessionId: payload.sessionId,
        name: payload.name,
        input: payload.input,
        timestamp: payload.timestamp
      })
    })

    /* [2026-05-06] replace=true 为历史全量；否则为 JSONL 增量 */
    const unsubTranscript = window.electronAPI.onClaudeTranscriptUpdate((payload) => {
      const { sessionId, entries, replace } = payload
      if (replace === true) {
        useTranscriptStore.getState().replaceSession(sessionId, entries)
      } else if (entries.length > 0) {
        if (shouldKeepEmbedLoadingForTranscript(entries)) {
          useEmbedAwaitingReplyStore.getState().markPending(sessionId)
        }
        useTranscriptStore.getState().append(sessionId, entries)
      }
    })

    return () => {
      offEmbedSettings()
      unsubIntr()
      unsubInputAck()
      unsubOutput()
      unsubStatus()
      unsubTokens()
      unsubTools()
      unsubTranscript()
    }
  }, [updateSessionStatus])
}
