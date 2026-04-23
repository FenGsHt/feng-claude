import React, { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { usePty } from './hooks/usePty'
import { useSessionStore } from './store/sessionStore'

export default function App(): React.ReactElement {
  usePty()

  const { sessions, createSession } = useSessionStore()

  useEffect(() => {
    if (sessions.length === 0) {
      void createSession('.', 'fullscreen')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <AppShell />
}
