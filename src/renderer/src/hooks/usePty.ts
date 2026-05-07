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
const DEBUG_EMBED_MCP = true
const TERMINAL_INTERACTION_HINT_RE =
  /Enter to select|(?:↑|↓|\^|\x1b\[A|\x1b\[B).*to navigate|Esc to cancel|Space to cycle|Search skills|Do you want to proceed|Would you like to|Allow this action|Press Enter to confirm|yes\/no|Y\/n\)?[\s]*$/im

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
  console.log('[notify] idle, sessionId:', sessionId, 'since last token:', elapsed, 'ms')
  if (!lastToken || elapsed < NOTIFY_DEBOUNCE_MS) {
    console.log('[notify] skipped - elapsed <', NOTIFY_DEBOUNCE_MS)
    return
  }
  // Check notification setting
  window.electronAPI.settings.get().then((s) => {
    if (s.enableNotifications === false) {
      console.log('[notify] disabled in settings')
      return
    }
    console.log('[notify] sending notification')
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
      /* [2026-05-07] 剥离 ANSI 后再检测：权限提示字符间夹有转义码会导致原始 data 匹配失败 */
      if (TERMINAL_INTERACTION_HINT_RE.test(stripAnsi(data))) {
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
      console.log('[Token] received from main — sessionId:', sessionId, 'in:', input, 'out:', output, 'cc:', cacheCreate, 'cr:', cacheRead, 'reset:', reset)

      // [2026-04-27] output tokens 增加 = 用户已提交问题，Claude 开始回答
      // 此时将缓冲的用户输入提交为实时问题（供宠物使用）
      // 改为：只要收到 token update（包括只有 input），就提交用户问题
      if (input > 0 || output > 0) {
        commitUserPrompt(sessionId)
      }

      // Per-pane counter accumulates for the lifetime of the pane (never reset
      // on new conversation). This keeps it consistent with the global "today"
      // widget: for a single pane, pane total == today total.
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

      // [2026-04-28] Get profileId for this session to track per-profile usage
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId)
      const profileId = session?.profileId
      console.log('[Token] session profileId:', profileId)

      // Persist into global all-time / today counters with profileId
      const before = useGlobalTokenStore.getState()
      console.log('[Token] global before — today:', before.today, 'total:', before.total)
      useGlobalTokenStore.getState().ingest({
        input,
        output,
        cacheCreate: cacheCreate ?? 0,
        cacheRead: cacheRead ?? 0
      }, profileId)
      const after = useGlobalTokenStore.getState()
      console.log('[Token] global after  — today:', after.today, 'total:', after.total)
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
      unsubOutput()
      unsubStatus()
      unsubTokens()
      unsubTools()
      unsubTranscript()
    }
  }, [updateSessionStatus])
}
