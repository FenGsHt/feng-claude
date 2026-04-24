import React from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useSessionStore } from '../../store/sessionStore'
import type { PaneNode } from '../../types/paneLayout'
import { TERMINAL_PANE_ATTR } from '../../lib/terminalPaneNeighbors'
import { XTerminal } from './XTerminal'
import { TerminalDropZone } from './TerminalDropZone'
import { TerminalPaneHeader } from './TerminalPaneHeader'

interface PaneLeafProps {
  sessionId: string
  focused: boolean
  setActiveSession: (id: string) => void
}

/** 单个终端窗格：顶栏 + 终端区（data-terminal-pane 含顶栏便于 Alt+方向键几何） */
export function PaneLeafShell({
  sessionId,
  focused,
  setActiveSession
}: PaneLeafProps): React.ReactElement {
  return (
    <div
      role="presentation"
      {...{ [TERMINAL_PANE_ATTR]: sessionId }}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm"
    >
      <TerminalPaneHeader sessionId={sessionId} focused={focused} />
      <div
        role="presentation"
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-sm transition-shadow ${
          focused ? 'ring-1 ring-amber-500/60 ring-inset' : 'ring-1 ring-transparent'
        }`}
        onMouseDown={() => setActiveSession(sessionId)}
      >
        <TerminalDropZone sessionId={sessionId}>
          <XTerminal sessionId={sessionId} active={focused} />
        </TerminalDropZone>
      </div>
    </div>
  )
}

interface PaneContentProps {
  node: PaneNode
  path: string
  activeSessionId: string | null
  setActiveSession: (id: string) => void
}

function PaneContent({
  node,
  path,
  activeSessionId,
  setActiveSession
}: PaneContentProps): React.ReactElement {
  if (node.type === 'leaf') {
    const focused = activeSessionId === node.sessionId
    return (
      <PaneLeafShell
        sessionId={node.sessionId}
        focused={focused}
        setActiveSession={setActiveSession}
      />
    )
  }

  const orientation = node.dir === 'horizontal' ? 'horizontal' : 'vertical'
  const idPath = path.replace(/\//g, '-')

  return (
    <Group
      id={`term-grp-${idPath}`}
      orientation={orientation}
      className="flex h-full min-h-0 min-w-0 flex-1"
    >
      <Panel defaultSize={50} minSize={15} id={`p-${idPath}-L`} className="min-h-0 min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <PaneContent
            node={node.first}
            path={`${path}/0`}
            activeSessionId={activeSessionId}
            setActiveSession={setActiveSession}
          />
        </div>
      </Panel>
      <Separator
        className={
          orientation === 'horizontal'
            ? 'pane-separator pane-separator-cols shrink-0'
            : 'pane-separator pane-separator-rows shrink-0'
        }
      />
      <Panel defaultSize={50} minSize={15} id={`p-${idPath}-R`} className="min-h-0 min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <PaneContent
            node={node.second}
            path={`${path}/1`}
            activeSessionId={activeSessionId}
            setActiveSession={setActiveSession}
          />
        </div>
      </Panel>
    </Group>
  )
}

interface Props {
  root: PaneNode
}

/** 递归分屏 + 可拖分割线（react-resizable-panels Group / Panel / Separator） */
export function TerminalSplitLayout({ root }: Props): React.ReactElement {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  if (root.type === 'leaf') {
    const focused = activeSessionId === root.sessionId
    return (
      <PaneLeafShell
        sessionId={root.sessionId}
        focused={focused}
        setActiveSession={setActiveSession}
      />
    )
  }

  return (
    <PaneContent
      node={root}
      path="s"
      activeSessionId={activeSessionId}
      setActiveSession={setActiveSession}
    />
  )
}
