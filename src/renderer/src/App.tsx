import React, { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { usePty } from './hooks/usePty'
import { useSessionStore } from './store/sessionStore'

export default function App(): React.ReactElement {
  usePty()

  const { sessions, createSession } = useSessionStore()

  useEffect(() => {
    if (sessions.length === 0) {
      // Start with current working directory or home
      const defaultDir = '.'
      createSession(defaultDir)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <AppShell />
}
