import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../../i18n'

type LogLevel = 'log' | 'warn' | 'error' | 'info'

interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  message: string
}

// Override console methods to capture logs
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
}

const FILTER_KEYWORDS = [
  { label: 'IPC', keywords: 'ipc IPC' },
  { label: 'PTY', keywords: 'pty PTY' },
  { label: 'Settings', keywords: 'settings Settings' },
  { label: 'Plugin', keywords: 'plugin Plugin' },
  { label: 'MCP', keywords: 'mcp MCP' },
  { label: 'Skill', keywords: 'skill Skill' },
  { label: 'Pet', keywords: 'pet:ask PetAgent pet' },
  { label: 'Theme', keywords: 'theme Theme' },
  { label: 'Git', keywords: 'git Git' },
  { label: 'Session', keywords: 'SESSION session' },
  { label: 'Content Bank', keywords: 'content-bank ContentBank' },
  { label: 'Token', keywords: 'token Token' },
  { label: 'History', keywords: 'history History' },
  { label: 'Update', keywords: 'update Update' },
]

export function DevLogPanel(): React.ReactElement {
  const { t, lang } = useI18n()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [query, setQuery] = useState('')
  const [activeModule, setActiveModule] = useState<string>('')
  const logIdRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  const addLog = useCallback((level: LogLevel, args: unknown[]) => {
    const msg = args.map((a) => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    }).join(' ')

    logIdRef.current += 1
    setLogs((prev) => [
      ...prev.slice(-500), // Keep last 500 entries
      { id: logIdRef.current, timestamp: Date.now(), level, message: msg }
    ])
  }, [])

  useEffect(() => {
    console.log = (...args: unknown[]) => { originalConsole.log(...args); addLog('log', args) }
    console.warn = (...args: unknown[]) => { originalConsole.warn(...args); addLog('warn', args) }
    console.error = (...args: unknown[]) => { originalConsole.error(...args); addLog('error', args) }
    console.info = (...args: unknown[]) => { originalConsole.info(...args); addLog('info', args) }

    return () => {
      console.log = originalConsole.log
      console.warn = originalConsole.warn
      console.error = originalConsole.error
      console.info = originalConsole.info
    }
  }, [addLog])

  const clearLogs = () => { setLogs([]); setQuery(''); setActiveModule('') }

  const openDevTools = () => {
    if (window.electronAPI?.openDevTools) {
      window.electronAPI.openDevTools()
    }
  }

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const levelColor: Record<LogLevel, string> = {
    log: 'text-claude-muted',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  }

  const levelBadge: Record<LogLevel, string> = {
    log: '',
    info: 'bg-blue-500/10 text-blue-400',
    warn: 'bg-yellow-500/10 text-yellow-400',
    error: 'bg-red-500/10 text-red-400',
  }

  const filteredLogs = logs.filter((entry) => {
    const lower = entry.message.toLowerCase()
    if (query.trim() && !lower.includes(query.toLowerCase().trim())) return false
    if (activeModule) {
      const kw = FILTER_KEYWORDS.find(f => f.label === activeModule)
      if (kw && !kw.keywords.split(' ').some(k => lower.includes(k.toLowerCase()))) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-claude-border shrink-0">
        <button
          onClick={openDevTools}
          className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
        >
          {lang === 'zh' ? '打开 DevTools' : 'Open DevTools'}
        </button>
        <button
          onClick={clearLogs}
          className="text-[10px] px-2 py-1 rounded text-claude-muted border border-claude-border hover:text-claude-text hover:bg-claude-bg transition-colors"
        >
          {t.common.clear}
        </button>
        <span className="text-[9px] text-claude-border ml-auto">{filteredLogs.length}/{logs.length}</span>
      </div>

      {/* Filter bar */}
      <div className="px-3 py-1.5 border-b border-claude-border shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'zh' ? '搜索日志...' : 'Search logs...'}
          className="w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[10px] text-claude-text outline-none focus:border-amber-500/60 font-mono placeholder-claude-border"
        />
        <div className="flex flex-wrap gap-1 mt-1.5">
          {FILTER_KEYWORDS.map((f) => {
            const isActive = activeModule === f.label
            return (
              <button
                key={f.label}
                onClick={() => setActiveModule(isActive ? '' : f.label)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'text-claude-text/60 border-claude-text/20 hover:text-claude-text hover:border-claude-text/40'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[10px] leading-snug">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-claude-muted opacity-50">
            {lang === 'zh' ? '等待日志...' : 'Waiting for logs...'}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredLogs.map((entry) => (
              <div key={entry.id} className="flex gap-2 py-0.5">
                <span className="w-[52px] shrink-0 text-claude-border select-none font-mono tabular-nums">
                  {formatTime(entry.timestamp)}
                </span>
                <div className="flex-1 min-w-0 break-all">
                  {entry.level !== 'log' && (
                    <span className={`inline-block px-1 rounded text-[9px] mr-1 align-top ${levelBadge[entry.level]}`}>
                      {entry.level.toUpperCase()}
                    </span>
                  )}
                  <span className={levelColor[entry.level]}>{entry.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
