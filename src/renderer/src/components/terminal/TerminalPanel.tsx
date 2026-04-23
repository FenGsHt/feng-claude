import React from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useAltArrowPaneNav } from '../../hooks/useAltArrowPaneNav'
import { TerminalSplitLayout } from './TerminalSplitLayout'
import { SplitToolbar } from './SplitToolbar'

/*
 * [2026-04-23] 原先：map sessions 仅显示 activeSessionId 对应的全屏单终端（其余 display:none）。
 * 改为：layoutRoot 描述分屏树，同屏多会话；分割线可拖拽调节比例（react-resizable-panels）。
 *
 * export function TerminalPanel(): React.ReactElement {
 *   const { sessions, activeSessionId } = useSessionStore()
 *   ...
 *   return (
 *     <div className="flex-1 overflow-hidden relative">
 *       {sessions.map((sess) => (
 *         <div key={sess.id} style={{ display: sess.id === activeSessionId ? 'flex' : 'none' }} ...>
 *           <XTerminal sessionId={sess.id} active={sess.id === activeSessionId} />
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 */

export function TerminalPanel(): React.ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const layoutRoot = useSessionStore((s) => s.layoutRoot)

  useAltArrowPaneNav(Boolean(layoutRoot && sessions.length > 0))

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#1a1a1a] text-claude-muted">
        <div className="space-y-3 text-center">
          <div className="text-4xl">◇</div>
          <p className="text-sm">No active session</p>
          <p className="text-xs opacity-60">Click + in the tab bar to start a new session</p>
        </div>
      </div>
    )
  }

  if (!layoutRoot) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#1a1a1a] text-claude-muted">
        <p className="text-xs">Loading layout…</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <SplitToolbar />
      <div className="min-h-0 flex-1">
        <TerminalSplitLayout root={layoutRoot} />
      </div>
    </div>
  )
}
