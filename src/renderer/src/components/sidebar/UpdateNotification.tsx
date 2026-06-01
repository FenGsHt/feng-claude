import React, { useState, useEffect } from 'react'
import type { UpdateStatusPayload, UpdateProgressPayload } from '../../types/ipc'
import { useI18n } from '../../i18n'
import { useFocusWindow } from '../../hooks/useFocusWindow'

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export function UpdateNotification(): React.ReactElement | null {
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null)
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const { lang } = useI18n()
  const zh = lang === 'zh'

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return
    const unsubStatus = window.electronAPI.onUpdateStatus((payload) => {
      setStatus(payload)
      setDismissed(false)
      // Auto-dismiss transient states
      if (payload.status === 'not-available') setTimeout(() => setDismissed(true), 2000)
      if (payload.status === 'error')         setTimeout(() => setDismissed(true), 6000)
    })
    const unsubProgress = window.electronAPI.onUpdateProgress((payload) => {
      setProgress(payload)
    })
    return () => { unsubStatus(); unsubProgress() }
  }, [])

  // [2026-05-29] Hook 必须在所有 early return 之前调用，否则触发 React #310
  const isReady = status?.status === 'downloaded'
  useFocusWindow(isReady)

  if (dismissed || !status) return null
  // Only show during download / ready / error; hide for not-available / checking
  if (!['available', 'downloaded', 'error'].includes(status.status) && !progress) return null

  const isDownloading = !!progress && status.status !== 'downloaded'
  const isError      = status.status === 'error'

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-[300px] w-72 animate-slide-up">
      <div className="bg-claude-surface border border-claude-border rounded-lg shadow-xl overflow-hidden">

        {/* Top bar — color-coded */}
        <div className={`h-0.5 w-full ${isError ? 'bg-red-500' : isReady ? 'bg-green-500' : 'bg-amber-400'}`} />

        <div className="p-3 space-y-2">
          {/* Title row */}
          <div className="flex items-center gap-2">
            {isError ? (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-red-400">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6.5 4v3M6.5 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            ) : isReady ? (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-green-400">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 6.5l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-amber-400 animate-spin" style={{ animationDuration: '2s' }}>
                <path d="M6.5 1A5.5 5.5 0 1 1 1 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}

            <span className="text-[12px] font-semibold text-claude-text flex-1 leading-none">
              {isError      && (zh ? '更新出错' : 'Update Failed')}
              {isReady      && (zh ? '更新已就绪' : 'Update Ready')}
              {isDownloading && (zh ? '后台下载更新中…' : 'Downloading update…')}
              {status.status === 'available' && !progress && (zh ? '发现新版本' : 'New version found')}
            </span>

            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 text-claude-muted hover:text-claude-text transition-colors"
              aria-label="Dismiss"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Version */}
          {status.version && (
            <div className="text-[10px] text-claude-muted">
              v{status.version}
              {status.releaseDate && (
                <span className="ml-1.5 opacity-70">
                  {new Date(status.releaseDate).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}
                </span>
              )}
            </div>
          )}

          {/* Download progress bar */}
          {isDownloading && (
            <div>
              <div className="h-1 bg-claude-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress!.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-claude-muted mt-0.5">
                <span>{fmtBytes(progress!.transferred)} / {fmtBytes(progress!.total)}</span>
                <span>{Math.round(progress!.percent)}%</span>
              </div>
            </div>
          )}

          {/* Error detail */}
          {isError && status.error && (
            <div className="text-[10px] text-red-400 truncate">{status.error}</div>
          )}

          {/* Actions */}
          {isReady && (
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={() => window.electronAPI?.installUpdate()}
                className="flex-1 py-1.5 text-[11px] font-medium bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                {zh ? '立即重启安装' : 'Restart & Install'}
              </button>
              <button
                onClick={() => setDismissed(true)}
                title={zh ? '退出时自动安装' : 'Installs automatically on quit'}
                className="px-2.5 py-1.5 text-[11px] text-claude-muted hover:text-claude-text border border-claude-border rounded transition-colors"
              >
                {zh ? '稍后' : 'Later'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}