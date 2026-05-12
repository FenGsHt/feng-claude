import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'
import { ingestEmbedPtyEcho } from '../lib/embedPtyTranscriptEcho'
import { writeToTerminal, commitUserPrompt } from '../components/terminal/XTerminal'
import { useTokenUsageStore } from '../store/tokenUsageStore'
import { useGlobalTokenStore } from '../store/globalTokenStore'
import { useToolCallStore } from '../store/toolCallStore'
import { enqueueTranscriptTokenDelta, useTranscriptStore } from '../store/transcriptStore'
import { useNativeTerminalRequestStore } from '../store/nativeTerminalRequestStore'
import { useEmbedAwaitingReplyStore } from '../store/embedAwaitingReplyStore'
import { useEmbedInterruptSuppressStore } from '../store/embedInterruptSuppressStore'
import { useClaudeRuntimeStatusStore } from '../store/claudeRuntimeStatusStore'
import {
  feedPtyAlternateScreenFromOutput,
  isPtyAlternateScreenActive
} from '../store/ptyAlternateScreenStore'
import { stripAnsi } from '../lib/stripAnsi'

/**
 * Global hook — subscribes to PTY output and routes data to xterm instances.
 * Token usage comes exclusively from the JSONL watcher (accurate, per-turn deltas).
 * The old regex fallback has been removed — it was matching Claude's context window
 * display text (e.g. "256k tokens") and inflating counts incorrectly.
 * Mount once at the App root.
 */

// [2026-05-01] Debounce notifications: only notify after 30s of no tokens
// This prevents premature notifications between multi-step tool calls
const NOTIFY_DEBOUNCE_MS = 30_000
const lastTokenTime = new Map<string, number>()
const runtimeStatusTailBySession = new Map<string, string>()
const runtimeStatusTouchAtBySession = new Map<string, number>()
const DEBUG_EMBED_MCP = true
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
  const lastToken = lastTokenTime.get(sessionId)
  const elapsed = lastToken ? Date.now() - lastToken : 0
  if (!lastToken || elapsed < NOTIFY_DEBOUNCE_MS) return
  window.electronAPI.settings.get().then((s) => {
    if (s.enableNotifications === false) return
    window.electronAPI?.showNotification('Feng Claude', 'Task completed')
  }).catch(() => {})
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
    })

    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      const { sessionId, data } = payload
      if (DEBUG_EMBED_MCP && /Manage MCP servers|User MCPs|Built-in MCPs|View tools|Reconnect|Disable/.test(data)) {
        console.log('[embed-mcp][pty:chunk]', {
          sessionId,
          len: data.length,
          hasCr: data.includes('\r'),
          hasLf: data.includes('\n'),
          hasAltEnter: /\x1b\[\?(1049|1047)h/.test(data),
          hasAltExit: /\x1b\[\?(1049|1047)l/.test(data)
        })
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
      if (status === 'idle') {
        notifyTaskDone(sessionId)
        useClaudeRuntimeStatusStore.getState().clearRuntimeStatus(sessionId)
        runtimeStatusTailBySession.delete(sessionId)
        runtimeStatusTouchAtBySession.delete(sessionId)
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
      unsubOutput()
      unsubStatus()
      unsubTokens()
      unsubTools()
      unsubTranscript()
    }
  }, [updateSessionStatus])
}
