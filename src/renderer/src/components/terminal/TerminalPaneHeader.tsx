import React, { useMemo, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import type { CreateSessionMode } from '../../types/paneLayout'
import { getSplitWorkdirCandidates } from '../../lib/recentWorkdirs'
import { SplitWorkdirDialog } from './SplitWorkdirDialog'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`
  return String(n)
}

interface Props {
  sessionId: string
  focused: boolean
}

function SplitVIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="5.5" y1="0.75" x2="5.5" y2="10.25" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function SplitHIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="0.75" y1="5.5" x2="10.25" y2="5.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

export function TerminalPaneHeader({ sessionId, focused }: Props): React.ReactElement {
  const sess = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId))
  const createSession = useSessionStore((s) => s.createSession)
  const closeSession = useSessionStore((s) => s.closeSession)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const loadHistory = useSessionStore((s) => s.loadHistory)
  const history = useSessionStore((s) => s.history)
  const sessions = useSessionStore((s) => s.sessions)
  const tokenUsage = useTokenUsageStore((s) => s.bySession[sessionId])

  const [splitMode, setSplitMode] = useState<CreateSessionMode | null>(null)

  const candidates = useMemo(
    () => getSplitWorkdirCandidates(history, sessions),
    [history, sessions]
  )

  async function beginSplit(mode: CreateSessionMode): Promise<void> {
    await loadHistory()
    const dirs = getSplitWorkdirCandidates(
      useSessionStore.getState().history,
      useSessionStore.getState().sessions
    )
    if (dirs.length === 0) {
      const dir = await window.electronAPI.openDirDialog()
      if (dir) await createSession(dir, mode, sessionId)
      return
    }
    setSplitMode(mode)
  }

  const hasTokens = tokenUsage && (tokenUsage.input > 0 || tokenUsage.output > 0)

  return (
    <>
      <div
        role="presentation"
        onMouseDown={() => setActiveSession(sessionId)}
        className={`flex h-7 shrink-0 cursor-default items-center gap-2 border-b px-2 transition-colors ${
          focused
            ? 'border-amber-600/40 bg-claude-bg'
            : 'border-claude-border bg-claude-surface'
        }`}
        title={sess?.workdir ?? undefined}
      >
        {/* Status dot */}
        <span
          className={`shrink-0 rounded-full transition-colors ${
            sess?.status === 'running'
              ? 'h-1.5 w-1.5 bg-amber-400 animate-pulse'
              : sess?.status === 'waiting_input'
                ? 'h-1.5 w-1.5 bg-green-400'
                : sess?.status === 'error'
                  ? 'h-1.5 w-1.5 bg-red-400'
                  : 'h-1.5 w-1.5 bg-claude-muted/40'
          }`}
        />

        {/* Title */}
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-medium leading-none ${
            focused ? 'text-claude-text' : 'text-claude-muted'
          }`}
        >
          {sess?.title ?? sessionId}
        </span>

        {/* Token usage */}
        {hasTokens && (
          <span
            className="shrink-0 font-mono text-[9px] tabular-nums text-claude-muted/70 leading-none"
            title="Token usage (parsed from terminal output)"
          >
            {fmtTokens(tokenUsage.input)}↑ {fmtTokens(tokenUsage.output)}↓
          </span>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
          <HeaderBtn title="Split right" onClick={() => void beginSplit('split-right')}>
            <SplitVIcon />
          </HeaderBtn>
          <HeaderBtn title="Split down" onClick={() => void beginSplit('split-down')}>
            <SplitHIcon />
          </HeaderBtn>
          <HeaderBtn title="Close pane" onClick={() => closeSession(sessionId)} danger>
            <svg width="8" height="8" viewBox="0 0 8 8">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </HeaderBtn>
        </div>
      </div>

      {splitMode != null && (
        <SplitWorkdirDialog
          open
          candidates={candidates}
          mode={splitMode}
          onPick={(workdir) => {
            void createSession(workdir, splitMode, sessionId)
            setSplitMode(null)
          }}
          onPickOther={async () => {
            const dir = await window.electronAPI.openDirDialog()
            if (dir) await createSession(dir, splitMode, sessionId)
            setSplitMode(null)
          }}
          onClose={() => setSplitMode(null)}
        />
      )}
    </>
  )
}

function HeaderBtn({
  onClick,
  title,
  danger,
  children
}: {
  onClick: () => void
  title: string
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors text-claude-muted ${
        danger
          ? 'hover:bg-red-600/20 hover:text-red-400'
          : 'hover:bg-claude-border/60 hover:text-claude-text'
      }`}
    >
      {children}
    </button>
  )
}
