import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { writeToTerminal } from '../components/terminal/XTerminal'
import { useTokenUsageStore } from '../store/tokenUsageStore'
import { useGlobalTokenStore } from '../store/globalTokenStore'

/**
 * Global hook — subscribes to PTY output and routes data to xterm instances.
 * Token usage comes exclusively from the JSONL watcher (accurate, per-turn deltas).
 * The old regex fallback has been removed — it was matching Claude's context window
 * display text (e.g. "256k tokens") and inflating counts incorrectly.
 * Mount once at the App root.
 */
export function usePty(): void {
  const { updateSessionStatus } = useSessionStore()

  useEffect(() => {
    // ── PTY output: write to terminal ────────────────────────
    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      writeToTerminal(payload.sessionId, payload.data)
    })

    // ── PTY status changes ────────────────────────────────────
    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      updateSessionStatus(payload.sessionId, payload.status as any)
    })

    // ── JSONL token usage (sole accurate source) ──────────────
    const unsubTokens = window.electronAPI.onTokenUsageUpdate((payload) => {
      const { sessionId, input, output, cacheCreate, cacheRead, reset } = payload
      const store = useTokenUsageStore.getState()

      if (reset) {
        // New claude conversation in this pane — start fresh
        store.clearSession(sessionId)
      }

      store.ingest(sessionId, input, output, 'add', { cacheCreate, cacheRead })

      // Persist into global all-time / today counters
      useGlobalTokenStore.getState().ingest({
        input,
        output,
        cacheCreate: cacheCreate ?? 0,
        cacheRead: cacheRead ?? 0
      })
    })

    return () => {
      unsubOutput()
      unsubStatus()
      unsubTokens()
    }
  }, [updateSessionStatus])
}
