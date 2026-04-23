import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'

/**
 * Global hook that subscribes to PTY output and status events from the main process.
 * Should be mounted once at the App root level.
 */
export function usePty(): void {
  const { appendRawOutput, updateSessionStatus } = useSessionStore()

  useEffect(() => {
    const unsubOutput = window.electronAPI.onPtyOutput((payload) => {
      appendRawOutput(payload.sessionId, payload.data, payload.timestamp)
    })

    const unsubStatus = window.electronAPI.onPtyStatus((payload) => {
      updateSessionStatus(payload.sessionId, payload.status as any)
    })

    return () => {
      unsubOutput()
      unsubStatus()
    }
  }, [appendRawOutput, updateSessionStatus])
}
