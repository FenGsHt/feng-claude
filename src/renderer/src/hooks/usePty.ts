import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { writeToTerminal, commitUserPrompt } from '../components/terminal/XTerminal'
import { useTokenUsageStore } from '../store/tokenUsageStore'
import { useGlobalTokenStore } from '../store/globalTokenStore'
import { useToolCallStore } from '../store/toolCallStore'

/**
 * Global hook — subscribes to PTY output and routes data to xterm instances.
 * Token usage comes exclusively from the JSONL watcher (accurate, per-turn deltas).
 * The old regex fallback has been removed — it was matching Claude's context window
 * display text (e.g. "256k tokens") and inflating counts incorrectly.
 * Mount once at the App root.
 */
/** Track when each session started running, for notification threshold */
const runningStartTime = new Map<string, number>()
const NOTIFY_AFTER_MS = 10_000 // 10 seconds - only notify for longer tasks

function notifyTaskDone(sessionId: string): void {
  const start = runningStartTime.get(sessionId)
  const elapsed = start ? Date.now() - start : 0
  console.log('[notify] task done, sessionId:', sessionId, 'elapsed:', elapsed, 'ms')
  if (!start || elapsed < NOTIFY_AFTER_MS) {
    console.log('[notify] skipped - elapsed <', NOTIFY_AFTER_MS)
    return
  }
  console.log('[notify] sending notification')
  window.electronAPI?.showNotification('Feng Claude', 'Task completed')
}

export function usePty(): void {
  const { updateSessionStatus } = useSessionStore()

  useEffect(() => {
    // ── PTY output: write to terminal ────────────────────────
    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      writeToTerminal(payload.sessionId, payload.data)
    })

    // ── PTY status changes ────────────────────────────────────
    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      const { sessionId, status } = payload
      if (status === 'running') {
        runningStartTime.set(sessionId, Date.now())
      } else if (status === 'idle') {
        notifyTaskDone(sessionId)
        runningStartTime.delete(sessionId)
      }
      updateSessionStatus(sessionId, status as any)
    })

    // ── JSONL token usage (sole accurate source) ──────────────
    const unsubTokens = window.electronAPI.onTokenUsageUpdate((payload) => {
      const { sessionId, input, output, cacheCreate, cacheRead } = payload

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

      // [2026-04-28] Get profileId for this session to track per-profile usage
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId)
      const profileId = session?.profileId

      // Persist into global all-time / today counters with profileId
      useGlobalTokenStore.getState().ingest({
        input,
        output,
        cacheCreate: cacheCreate ?? 0,
        cacheRead: cacheRead ?? 0
      }, profileId)
    })

    // ── Tool call updates ─────────────────────────────────────
    const unsubTools = window.electronAPI.onToolCallUpdate((payload) => {
      useToolCallStore.getState().addCall({
        id: payload.toolId,
        sessionId: payload.sessionId,
        name: payload.name,
        input: payload.input,
        timestamp: payload.timestamp
      })
    })

    return () => {
      unsubOutput()
      unsubStatus()
      unsubTokens()
      unsubTools()
    }
  }, [updateSessionStatus])
}
