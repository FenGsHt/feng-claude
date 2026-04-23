import React from 'react'
import { useSessionStore } from '../../store/sessionStore'

export function HistoryPanel(): React.ReactElement {
  const { history, restoreFromHistory, deleteHistory } = useSessionStore()

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
        No history yet
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {history.map((record) => (
        <div
          key={record.id}
          className="flex items-start gap-2 px-3 py-2 hover:bg-claude-border/50 rounded cursor-pointer group"
          onClick={() => restoreFromHistory(record)}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-claude-text truncate">{record.title}</p>
            <p className="text-xs text-claude-muted truncate font-mono mt-0.5">
              {record.workdir.split(/[/\\]/).pop()}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteHistory(record.id)
            }}
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-claude-muted hover:text-red-400 transition-all text-xs"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
