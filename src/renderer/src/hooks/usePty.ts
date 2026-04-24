import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { writeToTerminal } from '../components/terminal/XTerminal'
import { feedPtyChunkForTokenUsage } from '../lib/claudeTokenUsageParse'
import { useTokenUsageStore } from '../store/tokenUsageStore'

/**
 * Global hook — subscribes to PTY output and routes data to xterm instances.
 * Also subscribes to JSONL-sourced token usage events (primary source)
 * and falls back to regex parsing of PTY output for older Claude Code versions.
 * Mount once at the App root.
 */
export function usePty(): void {
  const { updateSessionStatus } = useSessionStore()

  useEffect(() => {
    // ── PTY output: write to terminal + regex token fallback ──
    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      writeToTerminal(payload.sessionId, payload.data)
      // Regex fallback — will be superseded by JSONL events when available
      feedPtyChunkForTokenUsage(payload.sessionId, payload.data)
    })

    // ── PTY status changes ────────────────────────────────────
    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      updateSessionStatus(payload.sessionId, payload.status as any)
    })

    // ── JSONL token usage (primary, accurate source) ──────────
    const unsubTokens = window.electronAPI.onTokenUsageUpdate((payload) => {
      const { sessionId, input, output, cacheCreate, cacheRead, reset } = payload
      const store = useTokenUsageStore.getState()

      if (reset) {
        // New claude conversation in this pane — start fresh
        store.clearSession(sessionId)
      }

      store.ingest(sessionId, input, output, 'add', { cacheCreate, cacheRead })
    })

    return () => {
      unsubOutput()
      unsubStatus()
      unsubTokens()
    }
  }, [updateSessionStatus])
}
