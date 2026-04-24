import React, { useEffect } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { TabBar } from '../tabs/TabBar'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { setTerminalLineHandler } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'

export function AppShell(): React.ReactElement {
  useEffect(() => {
    setTerminalLineHandler((sessionId, line) => {
      void useSessionStore.getState().notifyTerminalCommittedLine(sessionId, line)
    })
    return () => setTerminalLineHandler(null)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-claude-bg text-claude-text overflow-hidden font-sans antialiased">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex flex-col flex-1 overflow-hidden min-w-0">
          <TabBar />
          <TerminalPanel />
        </main>
      </div>
    </div>
  )
}
