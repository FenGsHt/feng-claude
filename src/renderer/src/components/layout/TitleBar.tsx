import React, { useState, useEffect } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'
import type { UpdateStatusPayload } from '../../types/ipc'
import { useI18n } from '../../i18n'

/** Shorten a workdir path for display in the title bar */
function formatWorkdir(workdir: string): string {
  if (!workdir || workdir === '.') return '—'
  // Normalize slashes
  const normalized = workdir.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 2) return normalized
  // Show last 2 segments with ellipsis
  return `…/${parts.slice(-2).join('/')}`
}

interface TitleBarProps {
  onToggleTools: () => void
  showTools: boolean
}

export function TitleBar({ onToggleTools, showTools }: TitleBarProps): React.ReactElement {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const recentCallCount = useToolCallStore((s) =>
    s.calls.filter((c) => c.sessionId === activeSessionId && Date.now() - c.timestamp < 60_000).length
  )
  const { lang } = useI18n()

  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return
    const unsub = window.electronAPI.onUpdateStatus((payload) => {
      setUpdateStatus(payload)
      setChecking(false)
    })
    return unsub
  }, [])

  const handleCheckUpdate = () => {
    setChecking(true)
    window.electronAPI?.checkForUpdates()
  }

  const handleDownload = () => {
    window.electronAPI?.downloadUpdate()
  }

  const handleInstall = () => {
    window.electronAPI?.installUpdate()
  }

  const handleMinimize = () => window.electronAPI.appMinimize()
  const handleMaximize = () => window.electronAPI.appMaximize()
  const handleClose = () => window.electronAPI.appClose()

  return (
    <div
      className="flex items-center h-9 px-2 bg-claude-surface border-b border-claude-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: logo + app name */}
      <div className="flex items-center gap-2 w-48 shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 opacity-70">
          <circle cx="7" cy="7" r="6" stroke="#f59e0b" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="#f59e0b" opacity="0.8" />
        </svg>
        <span className="text-[11px] text-claude-muted font-medium tracking-wide leading-none">
          Claude GUI
        </span>
      </div>

      {/* Center: active workdir */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        {activeSession ? (
          <div
            className="flex items-center gap-1.5 max-w-xs"
            title={activeSession.workdir}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0 text-claude-muted opacity-60">
              <path
                d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1 1.5H9.5C10.33 3.5 11 4.17 11 5v4c0 .83-.67 1.5-1.5 1.5h-7C1.67 10.5 1 9.83 1 9V3.5z"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[11px] text-claude-muted font-mono truncate leading-none">
              {formatWorkdir(activeSession.workdir)}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-claude-border">no session</span>
        )}
      </div>

      {/* Right: tool panel toggle + update button + window controls */}
      <div
        className="flex items-center gap-0.5 w-48 justify-end shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Update button */}
        <button
          onClick={handleCheckUpdate}
          title={lang === 'zh' ? '检查更新' : 'Check for updates'}
          className={`w-8 h-7 flex items-center justify-center rounded transition-colors ${
            updateStatus?.status === 'available' || updateStatus?.status === 'downloaded'
              ? 'text-green-400 bg-green-500/10'
              : checking
                ? 'text-amber-400 animate-pulse'
                : 'text-claude-muted hover:text-claude-text hover:bg-claude-border'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="6" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1"/>
          </svg>
          {(updateStatus?.status === 'available' || updateStatus?.status === 'downloaded') && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
          )}
        </button>
        <button
          onClick={onToggleTools}
          title="Toggle tool call panel"
          className={`relative w-8 h-7 flex items-center justify-center rounded transition-colors ${
            showTools ? 'text-amber-400 bg-amber-500/10' : 'text-claude-muted hover:text-claude-text hover:bg-claude-border'
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9 1.5l2 2L4.5 10H2V7.5L9 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            <path d="M1 12h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          {recentCallCount > 0 && !showTools && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
          )}
        </button>
        <WinBtn onClick={handleMinimize} label="Minimize">
          <svg width="10" height="1.5" viewBox="0 0 10 1.5"><rect width="10" height="1.5" rx="0.75" fill="currentColor"/></svg>
        </WinBtn>
        <WinBtn onClick={handleMaximize} label="Maximize">
          <svg width="9" height="9" viewBox="0 0 9 9"><rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.25" fill="none"/></svg>
        </WinBtn>
        <WinBtn onClick={handleClose} label="Close" danger>
          <svg width="9" height="9" viewBox="0 0 9 9">
            <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
        </WinBtn>

        {/* Update status dropdown */}
        {updateStatus && updateStatus.status !== 'not-available' && updateStatus.status !== 'checking' && (
          <div className="absolute top-full right-2 mt-1 bg-claude-bg border border-claude-border rounded shadow-lg p-2 text-[11px] z-50">
            {updateStatus.status === 'available' && (
              <div className="flex items-center gap-2">
                <span className="text-green-400">{lang === 'zh' ? '发现新版本' : 'Update available'}: v{updateStatus.version}</span>
                <button onClick={handleDownload} className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30">
                  {lang === 'zh' ? '下载' : 'Download'}
                </button>
              </div>
            )}
            {updateStatus.status === 'downloaded' && (
              <div className="flex items-center gap-2">
                <span className="text-green-400">{lang === 'zh' ? '已就绪' : 'Ready'}</span>
                <button onClick={handleInstall} className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30">
                  {lang === 'zh' ? '安装' : 'Install'}
                </button>
              </div>
            )}
            {updateStatus.status === 'error' && (
              <span className="text-red-400">{updateStatus.error}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WinBtn({
  onClick,
  label,
  danger,
  children
}: {
  onClick: () => void
  label: string
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-8 h-7 flex items-center justify-center rounded transition-colors text-claude-muted ${
        danger
          ? 'hover:bg-red-600 hover:text-white'
          : 'hover:bg-claude-border hover:text-claude-text'
      }`}
    >
      {children}
    </button>
  )
}
