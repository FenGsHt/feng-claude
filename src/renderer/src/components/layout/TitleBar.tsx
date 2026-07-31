import React, { useState, useEffect } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import type { UpdateStatusPayload } from '../../types/ipc'
import { useI18n } from '../../i18n'
import appIcon from '../../assets/icon.png'

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

export function TitleBar(): React.ReactElement {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const { lang } = useI18n()
  const isMac = window.electronAPI?.platform === 'darwin'

  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.electronAPI?.getVersion().then(setVersion)
  }, [])

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
      style={{
        WebkitAppRegion: 'drag' as React.CSSProperties,
        // [2026-07-10] macOS 交通灯按钮适配：左侧留出约 70px 空间（交通灯按钮占约 60px + 间距）
        paddingLeft: window.electronAPI?.platform === 'darwin' ? '70px' : undefined
      }}
    >
      {/* Left: logo + app name + version */}
      <div className="flex items-center gap-1.5 w-40 shrink-0">
        <img src={appIcon} width="16" height="16" className="shrink-0" alt="" />
        <span className="text-[11px] text-claude-text font-medium tracking-wide leading-none">
          Feng Claude
        </span>
        {version && (
          <span className="text-[9px] text-claude-muted/70 font-mono leading-none ml-0.5">
            v{version}
          </span>
        )}
      </div>

      {/* Center: active workdir or update notice */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        {/* 优先显示更新提示 */}
        {updateStatus?.status === 'available' ? (
          <div
            className="flex items-center gap-2 text-[11px] animate-pulse cursor-pointer"
            onClick={handleDownload}
            title={lang === 'zh'
              ? (isMac ? '在浏览器中下载 macOS 安装包' : '点击下载更新')
              : (isMac ? 'Download the macOS installer in your browser' : 'Click to download update')}
          >
            <span className="text-green-400 font-medium">
              {lang === 'zh' ? '发现新版本' : 'New version'} v{updateStatus.version}
            </span>
            <button className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30">
              {lang === 'zh' ? (isMac ? '下载 DMG' : '下载') : (isMac ? 'Download DMG' : 'Download')}
            </button>
          </div>
        ) : updateStatus?.status === 'downloaded' ? (
          <div
            className="flex items-center gap-2 text-[11px] cursor-pointer"
            onClick={handleInstall}
            title={lang === 'zh' ? '点击安装更新' : 'Click to install update'}
          >
            <span className="text-green-400 font-medium">
              {lang === 'zh' ? '已下载，点击安装' : 'Ready, click to install'}
            </span>
            <button className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30">
              {lang === 'zh' ? '安装并重启' : 'Install & Restart'}
            </button>
          </div>
        ) : activeSession ? (
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

      {/* Right: author + repo + tool panel toggle + update button + window controls */}
      <div
        className="flex items-center gap-0.5 w-56 justify-end shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Help / Features doc */}
        <button
          onClick={() => window.open('https://github.com/FenGsHt/feng-claude/blob/master/FEATURES.md')}
          title={lang === 'zh' ? '功能手册 / 快捷键' : 'Feature manual / shortcuts'}
          className="w-7 h-7 flex items-center justify-center rounded text-claude-muted hover:text-sky-400 hover:bg-claude-border transition-colors text-[11px] font-bold"
        >
          ?
        </button>

        {/* Repo link */}
        <a
          href="https://github.com/FenGsHt/feng-claude"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          className="w-7 h-7 flex items-center justify-center rounded text-claude-muted hover:text-amber-400 hover:bg-claude-border transition-colors"
          onClick={(e) => { e.preventDefault(); window.open('https://github.com/FenGsHt/feng-claude') }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>

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
