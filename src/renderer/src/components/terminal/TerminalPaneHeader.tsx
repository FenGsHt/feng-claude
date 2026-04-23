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
  /** 当前全局激活会话是否为该窗格 */
  focused: boolean
}

/** 每个分屏窗格顶部的导航条：状态、标题、关闭、拆分（对应本格的 session） */
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
    const latestHistory = useSessionStore.getState().history
    const dirs = getSplitWorkdirCandidates(
      useSessionStore.getState().history,
      useSessionStore.getState().sessions
    )
    if (latestHistory.length === 0 || dirs.length === 0) {
      const dir = await window.electronAPI.openDirDialog()
      if (dir) await createSession(dir, mode, sessionId)
      return
    }
    setSplitMode(mode)
  }

  return (
    <>
      <div
        role="presentation"
        onMouseDown={() => setActiveSession(sessionId)}
        className={`flex h-8 shrink-0 cursor-default items-center gap-2 border-b px-2 ${
          focused
            ? 'border-amber-600/60 bg-claude-bg text-claude-text'
            : 'border-claude-border bg-claude-surface text-claude-muted'
        }`}
        title={sess?.workdir ?? undefined}
      >
        <span
          className={`shrink-0 rounded-full ${
            sess?.status === 'running'
              ? 'h-1.5 w-1.5 bg-amber-400 animate-pulse'
              : sess?.status === 'waiting_input'
                ? 'h-1.5 w-1.5 bg-green-400'
                : sess?.status === 'error'
                  ? 'h-1.5 w-1.5 bg-red-400'
                  : 'h-1.5 w-1.5 bg-claude-muted'
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-claude-text">
          {sess?.title ?? sessionId}
        </span>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums text-claude-muted"
          title="本窗格累计 token（解析终端输出中的用量行；格式随 CLI 变化）"
        >
          {tokenUsage && (tokenUsage.input > 0 || tokenUsage.output > 0)
            ? `${fmtTokens(tokenUsage.input)}↑ ${fmtTokens(tokenUsage.output)}↓`
            : '—'}
        </span>
        <div className="flex shrink-0 gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="在此格右侧拆分新会话"
            onClick={() => void beginSplit('split-right')}
            className="flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-claude-border bg-claude-bg px-1.5 text-[11px] text-claude-muted hover:border-amber-600/60 hover:text-claude-text"
          >
            ┃
          </button>
          <button
            type="button"
            title="在此格下方拆分新会话"
            onClick={() => void beginSplit('split-down')}
            className="flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-claude-border bg-claude-bg px-1.5 text-[11px] text-claude-muted hover:border-amber-600/60 hover:text-claude-text"
          >
            ━
          </button>
          <button
            type="button"
            title="关闭此会话"
            onClick={() => closeSession(sessionId)}
            className="flex h-6 w-6 items-center justify-center rounded text-claude-muted hover:bg-claude-border/60 hover:text-claude-text text-xs"
          >
            ✕
          </button>
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
