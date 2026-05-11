import React, { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useSessionStore } from '../../store/sessionStore'
import type { PaneNode } from '../../types/paneLayout'
import { TERMINAL_PANE_ATTR } from '../../lib/terminalPaneNeighbors'
import { XTerminal } from './XTerminal'
import { TerminalDropZone } from './TerminalDropZone'
import { TerminalPaneHeader } from './TerminalPaneHeader'
import { ClaudeTranscriptPane } from './ClaudeTranscriptPane'
import { EmbedSessionComposer } from './EmbedSessionComposer'
import { useEmbedClaudeOutputBeta } from '../../hooks/useEmbedClaudeOutputBeta'
import { useNativeTerminalRequestStore } from '../../store/nativeTerminalRequestStore'
/* [2026-05-07] 浮窗 × 不再强制退出 PTY，移除关闭路径中的输入/echo 清理依赖。 */
// import { sendRawPtyInput, wakeTerminal } from './XTerminal'
// import { setEmbedSlashPtyEchoActive } from '../../lib/embedPtyTranscriptEcho'
import { wakeTerminal } from './XTerminal'

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
  /* [2026-05-06] embedClaudeOutputBeta：自建对话区 + 输入框，不再挂载 xterm（PTY 仍后台运行） */
  const embedBeta = useEmbedClaudeOutputBeta()
  const nativeTerminalRequest = useNativeTerminalRequestStore((s) => s.bySession[sessionId])
  const openNativeTerminal = useNativeTerminalRequestStore((s) => s.openNativeTerminal)
  const dismissNativeTerminal = useNativeTerminalRequestStore((s) => s.dismissNativeTerminal)
  const nativeTerminalOpen = nativeTerminalRequest?.open === true
  const nativeTerminalNeeded = nativeTerminalRequest?.needed === true
  const closeNativeTerminalOverlay = (): void => {
    /* [2026-05-07] 原关闭浮窗时直接 Ctrl+C，会打断 Claude Code TUI 并导致终端黑屏；× 现在只隐藏浮窗。 */
    // sendRawPtyInput(sessionId, '\x03')
    // setEmbedSlashPtyEchoActive(sessionId, false)
    dismissNativeTerminal(sessionId)
  }

  useEffect(() => {
    if (!nativeTerminalOpen) return
    const wake = (): void => wakeTerminal(sessionId)
    const raf = requestAnimationFrame(wake)
    const t1 = window.setTimeout(wake, 80)
    const t2 = window.setTimeout(wake, 220)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [nativeTerminalOpen, sessionId])

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
          focused ? 'ring-1 ring-[var(--theme-focus-ring)] ring-inset' : 'ring-1 ring-transparent'
        }`}
        onMouseDown={() => setActiveSession(sessionId)}
      >
        {embedBeta ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <TerminalDropZone sessionId={sessionId}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ClaudeTranscriptPane sessionId={sessionId} className="min-h-0 flex-1 border-b border-claude-border" />
                <EmbedSessionComposer sessionId={sessionId} nativeTerminalOverlayVisible={nativeTerminalOpen} />
              </div>
            </TerminalDropZone>
            {/* 「显示终端」按钮已移入 EmbedSessionComposer 按钮列，此处不再渲染 */}
            {nativeTerminalOpen ? (
              <div className="absolute bottom-4 right-4 z-30 flex h-[min(420px,62%)] w-[min(560px,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-terminal-overlay-bg)] shadow-2xl shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-accent-border)]">
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--theme-accent-border)] bg-[var(--theme-terminal-overlay-header)] px-2.5">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-[var(--theme-accent-text)]">需要终端交互</span>
                    {nativeTerminalRequest?.reason ? (
                      <span className="ml-2 text-[9px] text-claude-muted">{nativeTerminalRequest.reason}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    /* [2026-05-07] 原关闭按钮过小且对比弱，用户不容易发现；改为更明显的浮窗关闭控件。 */
                    // className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[12px] leading-none text-claude-muted transition hover:bg-white/[0.08] hover:text-claude-text"
                    className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] text-[18px] font-bold leading-none text-[var(--theme-accent-text)] shadow-sm shadow-[color:var(--theme-shadow)] transition hover:border-[var(--theme-danger-border)] hover:bg-[var(--theme-danger-bg)] hover:text-[var(--theme-danger-text)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                    aria-label="关闭原生终端浮窗"
                    title="关闭终端浮窗"
                    onClick={closeNativeTerminalOverlay}
                  >
                    ×
                  </button>
                </div>
                {/* [2026-05-07] 原空白提示会长期压在终端内容上，影响观感；保留 wakeTerminal 逻辑即可。 */}
                {/* <div className="pointer-events-none absolute left-3 top-10 z-10 rounded bg-black/45 px-2 py-1 text-[9px] text-claude-muted">
                  若短暂空白，请等待输出或点击终端区域
                </div> */}
                <TerminalDropZone sessionId={sessionId}>
                  <XTerminal sessionId={sessionId} active={focused || nativeTerminalOpen} />
                </TerminalDropZone>
              </div>
            ) : null}
          </div>
        ) : (
          <TerminalDropZone sessionId={sessionId}>
            <XTerminal sessionId={sessionId} active={focused} />
          </TerminalDropZone>
        )}
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
