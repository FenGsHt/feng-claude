import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { writeToTerminal } from '../components/terminal/XTerminal'
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
const NOTIFY_AFTER_MS = 5_000

function notifyTaskDone(sessionId: string): void {
  const start = runningStartTime.get(sessionId)
  if (!start || Date.now() - start < NOTIFY_AFTER_MS) return
  if (document.hasFocus()) return
  try {
    new Notification('Claude GUI', { body: 'Task completed', silent: false })
  } catch { /* ignore if notifications blocked */ }
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

      // Per-pane counter accumulates for the lifetime of the pane (never reset
      // on new conversation). This keeps it consistent with the global "today"
      // widget: for a single pane, pane total == today total.
      useTokenUsageStore.getState().ingest(sessionId, input, output, 'add', { cacheCreate, cacheRead })

      // Persist into global all-time / today counters
      useGlobalTokenStore.getState().ingest({
        input,
        output,
        cacheCreate: cacheCreate ?? 0,
        cacheRead: cacheRead ?? 0
      })
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
