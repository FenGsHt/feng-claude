import React from 'react'

export function TitleBar(): React.ReactElement {
  const handleMinimize = () => window.electronAPI.appMinimize()
  const handleMaximize = () => window.electronAPI.appMaximize()
  const handleClose = () => window.electronAPI.appClose()

  return (
    <div
      className="flex items-center justify-between h-9 px-4 bg-claude-surface border-b border-claude-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-amber-500 opacity-80" />
        <span className="text-xs text-claude-muted font-medium tracking-wide">Claude GUI</span>
      </div>
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-claude-border text-claude-muted hover:text-claude-text transition-colors text-xs"
        >
          ─
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-claude-border text-claude-muted hover:text-claude-text transition-colors text-xs"
        >
          □
        </button>
        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-600 text-claude-muted hover:text-white transition-colors text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
