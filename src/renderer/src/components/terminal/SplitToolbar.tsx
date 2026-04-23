import React from 'react'
import { useSessionStore } from '../../store/sessionStore'

/** Zellij 风格：拆分当前格为新 Claude 会话（右侧 / 下方） */
export function SplitToolbar(): React.ReactElement {
  const createSession = useSessionStore((s) => s.createSession)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)

  const wd =
    activeSessionId != null
      ? (sessions.find((x) => x.id === activeSessionId)?.workdir ?? '.')
      : '.'

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1">
      <button
        type="button"
        title="Split right — new Claude session"
        disabled={!activeSessionId}
        onClick={() => void createSession(wd, 'split-right')}
        className="pointer-events-auto flex h-7 min-w-[2rem] items-center justify-center rounded border border-claude-border bg-claude-surface/95 px-2 text-xs text-claude-muted shadow-sm backdrop-blur hover:border-amber-600/60 hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        ┃
      </button>
      <button
        type="button"
        title="Split down — new Claude session"
        disabled={!activeSessionId}
        onClick={() => void createSession(wd, 'split-down')}
        className="pointer-events-auto flex h-7 min-w-[2rem] items-center justify-center rounded border border-claude-border bg-claude-surface/95 px-2 text-xs text-claude-muted shadow-sm backdrop-blur hover:border-amber-600/60 hover:text-claude-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        ━
      </button>
    </div>
  )
}
