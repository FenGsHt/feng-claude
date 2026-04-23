import React from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { XTerminal } from './XTerminal'

export function TerminalPanel(): React.ReactElement {
  const { sessions, activeSessionId } = useSessionStore()

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a1a] text-claude-muted">
        <div className="text-center space-y-3">
          <div className="text-4xl">◇</div>
          <p className="text-sm">No active session</p>
          <p className="text-xs opacity-60">Click + in the tab bar to start a new session</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {sessions.map((sess) => (
        // Render all terminals, only show active one — keeps terminal state alive
        <div
          key={sess.id}
          className="absolute inset-0 flex"
          style={{ display: sess.id === activeSessionId ? 'flex' : 'none' }}
        >
          <XTerminal sessionId={sess.id} active={sess.id === activeSessionId} />
        </div>
      ))}
    </div>
  )
}
