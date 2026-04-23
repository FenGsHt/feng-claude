import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { writeToTerminal } from '../components/terminal/XTerminal'
import { feedPtyChunkForTokenUsage } from '../lib/claudeTokenUsageParse'

/**
 * Global hook — subscribes to PTY output and routes data directly to
 * the matching xterm.js instance. Should be mounted once at the App root.
 */
export function usePty(): void {
  const { updateSessionStatus } = useSessionStore()

  useEffect(() => {
    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      writeToTerminal(payload.sessionId, payload.data)
      feedPtyChunkForTokenUsage(payload.sessionId, payload.data)
    })

    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      updateSessionStatus(payload.sessionId, payload.status as any)
    })

    return () => {
      unsubOutput()
      unsubStatus()
    }
  }, [updateSessionStatus])
}
