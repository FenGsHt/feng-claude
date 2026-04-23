import React, { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { usePty } from './hooks/usePty'
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence'
import { useSessionStore } from './store/sessionStore'
import { parsePersistedWorkspace } from './lib/workspaceSerialize'

export default function App(): React.ReactElement {
  usePty()

  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await window.electronAPI.workspace.load()
        const pw = parsePersistedWorkspace(raw)
        if (cancelled) return
        if (pw && pw.sessionWorkdirs.length > 0) {
          await useSessionStore.getState().restoreWorkspace(pw)
        } else if (useSessionStore.getState().sessions.length === 0) {
          await useSessionStore.getState().createSession('.', 'fullscreen')
        }
      } catch {
        if (!cancelled && useSessionStore.getState().sessions.length === 0) {
          await useSessionStore.getState().createSession('.', 'fullscreen')
        }
      } finally {
        if (!cancelled) setBootstrapped(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useWorkspacePersistence(bootstrapped)

  if (!bootstrapped) {
    return <div className="h-full w-full bg-[#1a1a1a]" />
  }

  return <AppShell />
}
