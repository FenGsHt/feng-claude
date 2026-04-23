import React from 'react'
import { useSessionStore } from '../../store/sessionStore'

export function TabBar(): React.ReactElement {
  const { sessions, activeSessionId, setActiveSession, createSession, closeSession } =
    useSessionStore()

  const handleNewTab = async () => {
    const dir = await window.electronAPI.openDirDialog()
    await createSession(dir ?? process.cwd?.() ?? '.', 'fullscreen')
  }

  return (
    <div className="flex items-center h-9 bg-claude-surface border-b border-claude-border shrink-0 overflow-x-auto">
      {sessions.map((sess) => (
        <div
          key={sess.id}
          onClick={() => setActiveSession(sess.id)}
          className={`flex items-center gap-2 px-3 h-full min-w-0 max-w-[180px] cursor-pointer border-r border-claude-border shrink-0 group ${
            sess.id === activeSessionId
              ? 'bg-claude-bg text-claude-text'
              : 'text-claude-muted hover:text-claude-text hover:bg-claude-bg/50'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              sess.status === 'running'
                ? 'bg-amber-400 animate-pulse'
                : sess.status === 'waiting_input'
                  ? 'bg-green-400'
                  : sess.status === 'error'
                    ? 'bg-red-400'
                    : 'bg-claude-muted'
            }`}
          />
          <span className="text-xs truncate flex-1">{sess.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeSession(sess.id)
            }}
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-claude-border text-claude-muted hover:text-claude-text transition-all text-xs"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={handleNewTab}
        className="px-3 h-full text-claude-muted hover:text-claude-text hover:bg-claude-bg/50 transition-colors text-sm shrink-0"
        title="New session"
      >
        +
      </button>
    </div>
  )
}
