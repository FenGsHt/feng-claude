import React from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useAltArrowPaneNav } from '../../hooks/useAltArrowPaneNav'
import { TerminalSplitLayout, PaneLeafShell } from './TerminalSplitLayout'

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
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

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

  // 单窗格模式：保持所有 XTerminal 挂载，用 display:none 隐藏非活跃会话
  // 避免标签切换 / 历史打开新会话时卸载再重建 xterm DOM 导致的卡顿
  if (layoutRoot.type === 'leaf') {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {sessions.map((sess) => (
          <div
            key={sess.id}
            className="min-h-0 flex-1 flex-col overflow-hidden"
            style={{ display: sess.id === layoutRoot.sessionId ? 'flex' : 'none' }}
          >
            <PaneLeafShell
              sessionId={sess.id}
              focused={sess.id === activeSessionId}
              setActiveSession={setActiveSession}
            />
          </div>
        ))}
      </div>
    )
  }

  // 分屏模式：仅渲染布局树中的会话
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <TerminalSplitLayout root={layoutRoot} />
      </div>
    </div>
  )
}
