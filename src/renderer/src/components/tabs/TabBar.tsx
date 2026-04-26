import React, { useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import type { Session } from '../../types/session'
import { useI18n } from '../../i18n'

/** Status dot color for a session */
function statusColor(status: Session['status']): string {
  switch (status) {
    case 'running': return 'bg-amber-400'
    case 'waiting_input': return 'bg-green-400'
    case 'error': return 'bg-red-400'
    default: return 'bg-claude-muted/50'
  }
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-50">
      <path
        d="M1 3C1 2.45 1.45 2 2 2H4.5L5.5 3.5H10C10.55 3.5 11 3.95 11 4.5V9C11 9.55 10.55 10 10 10H2C1.45 10 1 9.55 1 9V3Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TabBar(): React.ReactElement {
  const { sessions, activeSessionId, setActiveSession, createSession, closeSession, restartSession } =
    useSessionStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const handleNewTab = async () => {
    const dir = await window.electronAPI.openDirDialog()
    if (dir) await createSession(dir, 'fullscreen')
  }

  // Scroll tabs with mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="flex items-stretch h-9 bg-claude-surface border-b border-claude-border shrink-0 min-w-0">
      {/* Scrollable tabs area */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex flex-1 items-stretch overflow-x-auto min-w-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sessions.map((sess) => {
          const isActive = sess.id === activeSessionId
          return (
            <div
              key={sess.id}
              title={sess.workdir}
              onClick={() => setActiveSession(sess.id)}
              className={`tab-item ${isActive ? 'tab-active' : ''} relative flex items-center gap-1.5 px-3 h-full min-w-[80px] max-w-[180px] cursor-pointer border-r border-claude-border shrink-0 group select-none ${
                isActive
                  ? 'bg-claude-bg text-claude-text'
                  : 'bg-claude-surface text-claude-muted hover:text-claude-text hover:bg-claude-bg/60'
              }`}
            >
              {/* Status indicator */}
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${
                  isActive && sess.status === 'running'
                    ? 'bg-amber-400 animate-pulse'
                    : statusColor(sess.status)
                }`}
              />

              {/* Folder icon */}
              <FolderIcon />

              {/* Title */}
              <span className="text-[12px] truncate flex-1 leading-none font-medium">
                {sess.title}
              </span>

              {/* Restart button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void restartSession(sess.id)
                }}
                aria-label="Restart session"
                title={t.tabs.restartSession}
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all text-claude-muted hover:text-amber-400 hover:bg-claude-border ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M8.5 5A3.5 3.5 0 1 1 5 1.5c.94 0 1.8.37 2.43.97" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M7.5 1v2H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeSession(sess.id)
                }}
                aria-label="Close tab"
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all text-claude-muted hover:text-claude-text hover:bg-claude-border ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* New tab button */}
      <button
        onClick={handleNewTab}
        aria-label={t.tabs.newSession}
        title={t.tabs.newSession}
        className="flex items-center justify-center w-9 shrink-0 text-claude-muted hover:text-claude-text hover:bg-claude-bg/60 transition-colors border-l border-claude-border"
      >
        <svg width="13" height="13" viewBox="0 0 13 13">
          <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
