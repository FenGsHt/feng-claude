import React, { useEffect, useState, useRef, useCallback } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { TabBar } from '../tabs/TabBar'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { ToolCallFeed } from '../toolcalls/ToolCallFeed'
import { setTerminalLineHandler } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useLangStore, useI18n } from '../../i18n'

const SIDEBAR_DEFAULT = 280
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 520
const SIDEBAR_STORAGE_KEY = 'sidebar-width'

export function AppShell(): React.ReactElement {
  const [showTools, setShowTools] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parseInt(saved, 10))) : SIDEBAR_DEFAULT
  })
  const isResizing = useRef(false)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // persist after drag ends
      setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  useEffect(() => {
    setTerminalLineHandler((sessionId, line) => {
      void useSessionStore.getState().notifyTerminalCommittedLine(sessionId, line)
    })
    return () => setTerminalLineHandler(null)
  }, [])

  // Load persisted token data from main process (userData/token-data.json)
  useEffect(() => {
    void useGlobalTokenStore.getState().hydrate()
  }, [])

  // Sync UI language from saved settings; show setup if no API key configured
  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      if (s.language) useLangStore.getState().setLang(s.language)
      // [2026-04-28] Check profiles array for authToken instead of flat field (migration)
      const hasToken = s.profiles?.some(p => p.authToken?.trim())
      if (!hasToken) setShowSetup(true)
    })
  }, [])

  return (
    <div className="flex flex-col h-screen bg-claude-bg text-claude-text overflow-hidden font-sans antialiased">
      {showSetup && <SetupOverlay onDone={() => setShowSetup(false)} />}
      <TitleBar onToggleTools={() => setShowTools((v) => !v)} showTools={showTools} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar width={sidebarWidth} />
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-amber-500/40 active:bg-amber-500/60 transition-colors"
          style={{ marginLeft: -1 }}
        />
        <main className="flex flex-col flex-1 overflow-hidden min-w-0">
          <TabBar />
          <TerminalPanel />
        </main>
        {showTools && (
          <div className="flex flex-col w-64 shrink-0 border-l border-claude-border bg-claude-surface overflow-hidden">
            <ToolCallFeed />
          </div>
        )}
      </div>
    </div>
  )
}

function SetupOverlay({ onDone }: { onDone: () => void }): React.ReactElement {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!token.trim()) { setError(zh ? '请输入 API Key' : 'Please enter your API Key'); return }
    setSaving(true)
    const current = await window.electronAPI.settings.get()
    // [2026-04-28] Save token into first profile instead of flat authToken field
    if (current.profiles?.length > 0) {
      const updatedProfiles = current.profiles.map((p, i) =>
        i === 0 ? { ...p, authToken: token.trim() } : p
      )
      await window.electronAPI.settings.set({ ...current, profiles: updatedProfiles })
    } else {
      // Fallback: create default profile with token
      await window.electronAPI.settings.set({
        ...current,
        profiles: [{ id: 'default', name: 'Default', authToken: token.trim(), baseUrl: 'https://api.anthropic.com', model: '', sonnetModel: '', haikuModel: '', opusModel: '', subagentModel: '', disableExperimentalBetas: false }],
        activeProfileId: 'default'
      })
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-claude-surface border border-claude-border rounded-xl shadow-2xl w-[400px] p-6 space-y-5">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2.5" fill="#f59e0b" opacity="0.8" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-claude-text">
              {zh ? '欢迎使用 Feng Claude' : 'Welcome to Feng Claude'}
            </div>
            <div className="text-[11px] text-claude-muted">
              {zh ? '开始前请先配置 Anthropic API Key' : 'Configure your Anthropic API Key to get started'}
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-1.5">
          <label className="text-xs text-claude-text">
            {zh ? 'API Key' : 'API Key'}
            <span className="ml-1 text-[10px] text-claude-muted font-mono">ANTHROPIC_AUTH_TOKEN</span>
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="sk-ant-..."
            autoFocus
            className="w-full bg-claude-bg border border-claude-border rounded px-3 py-2 text-[12px] text-claude-text font-mono outline-none focus:border-amber-500 placeholder:text-claude-muted/50"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* Hint */}
        <p className="text-[11px] text-claude-muted leading-relaxed">
          {zh
            ? '在 Anthropic Console 获取 API Key：'
            : 'Get your API Key from Anthropic Console:'}
          {' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 hover:text-amber-300 underline"
            onClick={(e) => { e.preventDefault(); window.open('https://console.anthropic.com/settings/keys') }}
          >
            console.anthropic.com
          </a>
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50 transition-colors"
          >
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存并开始' : 'Save & Start')}
          </button>
          <button
            onClick={onDone}
            className="px-4 py-2 rounded text-xs text-claude-muted hover:text-claude-text border border-claude-border transition-colors"
          >
            {zh ? '稍后配置' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  )
}
