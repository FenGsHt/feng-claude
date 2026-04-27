import React, { useState, useEffect } from 'react'
import type { UpdateStatusPayload, UpdateProgressPayload } from '../../types/ipc'
import { useI18n } from '../../i18n'

export function UpdateNotification(): React.ReactElement | null {
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null)
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const { t, lang } = useI18n()

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return
    const unsubStatus = window.electronAPI.onUpdateStatus((payload) => {
      setStatus(payload)
      if (payload.status === 'not-available' || payload.status === 'error') {
        // Auto-dismiss after 3 seconds for no-update or error
        setTimeout(() => setDismissed(true), 3000)
      }
    })
    const unsubProgress = window.electronAPI.onUpdateProgress((payload) => {
      setProgress(payload)
    })
    return () => {
      unsubStatus()
      unsubProgress()
    }
  }, [])

  // Don't show if dismissed or no status
  if (dismissed || !status) return null

  // Only show for available, downloading, downloaded, or error
  const visibleStatuses = ['available', 'downloaded', 'error']
  if (!visibleStatuses.includes(status.status) && !progress) return null

  const handleDownload = (): void => {
    window.electronAPI?.downloadUpdate()
  }

  const handleInstall = (): void => {
    window.electronAPI?.installUpdate()
  }

  const handleDismiss = (): void => {
    setDismissed(true)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatSpeed = (bps: number): string => {
    if (bps < 1024) return `${bps} B/s`
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-claude-surface border border-claude-border rounded-lg shadow-lg p-3 max-w-xs">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {status.status === 'error' ? (
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 15 15" stroke="currentColor">
              <circle cx="7.5" cy="7.5" r="5" strokeWidth="1.1"/>
              <path d="M7.5 4.5v3M7.5 9.5v.5" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 15 15" stroke="currentColor">
              <path d="M7.5 1v13M1 7.5h13" strokeWidth="1.1" strokeLinecap="round"/>
              <circle cx="7.5" cy="7.5" r="5" strokeWidth="1.1"/>
            </svg>
          )}
          <span className="text-sm font-medium text-claude-text">
            {status.status === 'available' && (lang === 'zh' ? '发现新版本' : 'Update Available')}
            {status.status === 'downloaded' && (lang === 'zh' ? '更新已就绪' : 'Update Ready')}
            {status.status === 'error' && (lang === 'zh' ? '更新失败' : 'Update Error')}
          </span>
          <button
            onClick={handleDismiss}
            className="ml-auto text-claude-muted hover:text-claude-text"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 15 15" stroke="currentColor">
              <path d="M3 3l9 9M12 3l-9 9" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Version info */}
        {status.version && (
          <div className="text-xs text-claude-muted mb-2">
            {lang === 'zh' ? '版本 ' : 'Version '}{status.version}
            {status.releaseDate && (
              <span className="ml-2">
                ({new Date(status.releaseDate).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')})
              </span>
            )}
          </div>
        )}

        {/* Download progress */}
        {progress && (
          <div className="mb-2">
            <div className="flex justify-between text-xs text-claude-muted mb-1">
              <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
              <span>{formatSpeed(progress.bytesPerSecond)}</span>
            </div>
            <div className="h-1.5 bg-claude-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-200"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {status.status === 'error' && status.error && (
          <div className="text-xs text-red-400 mb-2 truncate">
            {status.error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {status.status === 'available' && !progress && (
            <button
              onClick={handleDownload}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              {lang === 'zh' ? '下载更新' : 'Download'}
            </button>
          )}
          {status.status === 'downloaded' && (
            <button
              onClick={handleInstall}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              {lang === 'zh' ? '立即安装' : 'Install Now'}
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs text-claude-muted hover:text-claude-text transition-colors"
          >
            {lang === 'zh' ? '稍后' : 'Later'}
          </button>
        </div>
      </div>
    </div>
  )
}