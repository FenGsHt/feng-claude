import React, { useState } from 'react'
import { useToolCallStore, type ToolCallEntry } from '../../store/toolCallStore'
import { useSessionStore } from '../../store/sessionStore'
import { DiffModal } from './DiffModal'

// ── Tool metadata ─────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
  Edit: { label: 'Edit', color: 'text-blue-400', icon: <IconEdit /> },
  str_replace_based_edit_tool: { label: 'Edit', color: 'text-blue-400', icon: <IconEdit /> },
  Write: { label: 'Write', color: 'text-green-400', icon: <IconWrite /> },
  create_file: { label: 'Write', color: 'text-green-400', icon: <IconWrite /> },
  MultiEdit: { label: 'MultiEdit', color: 'text-blue-300', icon: <IconEdit /> },
  Bash: { label: 'Bash', color: 'text-amber-400', icon: <IconBash /> },
  Read: { label: 'Read', color: 'text-claude-muted', icon: <IconRead /> },
  LS: { label: 'LS', color: 'text-claude-muted', icon: <IconRead /> },
  Glob: { label: 'Glob', color: 'text-claude-muted', icon: <IconRead /> },
  Grep: { label: 'Grep', color: 'text-claude-muted', icon: <IconRead /> },
}

function getMeta(name: string) {
  return TOOL_META[name] ?? { label: name, color: 'text-claude-muted', icon: <IconDot /> }
}

function getSummary(call: ToolCallEntry): string {
  const p = call.input.path ?? call.input.file_path ?? call.input.command ?? call.input.pattern ?? ''
  if (typeof p === 'string') {
    const parts = p.replace(/\\/g, '/').split('/')
    return parts.slice(-2).join('/') || p
  }
  return ''
}

function isViewable(name: string): boolean {
  return ['Edit', 'str_replace_based_edit_tool', 'Write', 'create_file', 'MultiEdit', 'Bash'].includes(name)
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

// ── Component ─────────────────────────────────────────────────

export function ToolCallFeed(): React.ReactElement {
  const calls = useToolCallStore((s) => s.calls)
  const { sessions, activeSessionId } = useSessionStore()
  const [selected, setSelected] = useState<ToolCallEntry | null>(null)
  const [filterSession, setFilterSession] = useState(true)

  const displayed = filterSession
    ? calls.filter((c) => c.sessionId === activeSessionId)
    : calls

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-claude-border shrink-0">
        <span className="text-[11px] font-semibold text-claude-muted uppercase tracking-wider">Tool Calls</span>
        <button
          onClick={() => setFilterSession((v) => !v)}
          title={filterSession ? 'Show all sessions' : 'Show current session only'}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${filterSession ? 'bg-amber-500/20 text-amber-400' : 'text-claude-muted hover:text-claude-text'}`}
        >
          {filterSession ? 'current' : 'all'}
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-claude-muted">
            <IconDot />
            <span className="text-xs">No tool calls yet</span>
          </div>
        ) : (
          displayed.map((call) => {
            const meta = getMeta(call.name)
            const summary = getSummary(call)
            const clickable = isViewable(call.name)
            const session = sessions.find((s) => s.id === call.sessionId)
            return (
              <div
                key={`${call.id}-${call.timestamp}`}
                onClick={() => clickable && setSelected(call)}
                className={`flex items-start gap-2 px-3 py-2 border-b border-claude-border/50 group ${clickable ? 'cursor-pointer hover:bg-claude-surface/60' : ''}`}
              >
                <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
                    {!filterSession && session && (
                      <span className="text-[9px] text-claude-muted bg-claude-surface px-1 rounded truncate max-w-[60px]">
                        {session.title}
                      </span>
                    )}
                    <span className="text-[10px] text-claude-border ml-auto shrink-0">{relTime(call.timestamp)}</span>
                  </div>
                  {summary && (
                    <div className="text-[11px] text-claude-muted font-mono truncate mt-0.5">{summary}</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selected && <DiffModal call={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
}

function IconWrite() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8l2.5 2.5V9.5A1.5 1.5 0 0 1 9 11H3.5A1.5 1.5 0 0 1 2 9.5V2.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M7.5 1v3H10.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
}

function IconBash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3.5 4.5L5.5 6L3.5 7.5M6.5 7.5H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconRead() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M1 6C2.5 3 4.5 2 6 2s3.5 1 5 4c-1.5 3-3.5 4-5 4S2.5 9 1 6z" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function IconDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2" fill="currentColor"/>
    </svg>
  )
}
