import React, { useEffect, useState, useCallback } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useSessionStore } from '../../store/sessionStore'
import type { PaneNode } from '../../types/paneLayout'
import { TERMINAL_PANE_ATTR } from '../../lib/terminalPaneNeighbors'
import { XTerminal } from './XTerminal'
import { TerminalDropZone } from './TerminalDropZone'
import { TerminalPaneHeader } from './TerminalPaneHeader'
import { ClaudeTranscriptPane } from './ClaudeTranscriptPane'
import { EmbedSessionComposer } from './EmbedSessionComposer'
import { useNativeTerminalRequestStore } from '../../store/nativeTerminalRequestStore'
/* [2026-05-07] 浮窗 × 不再强制退出 PTY，移除关闭路径中的输入/echo 清理依赖。 */
// import { sendRawPtyInput, wakeTerminal } from './XTerminal'
// import { setEmbedSlashPtyEchoActive } from '../../lib/embedPtyTranscriptEcho'
import { wakeTerminal } from './XTerminal'
import { focusSessionInput } from '../../lib/sessionFocus'

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
  /* [2026-05-11] 每个 session 独立控制外嵌/终端模式 */
  const embedBeta = useSessionStore((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId)
    return sess?.embedMode ?? false
  })
  const nativeTerminalRequest = useNativeTerminalRequestStore((s) => s.bySession[sessionId])
  const openNativeTerminal = useNativeTerminalRequestStore((s) => s.openNativeTerminal)
  const dismissNativeTerminal = useNativeTerminalRequestStore((s) => s.dismissNativeTerminal)
  const nativeTerminalOpen = nativeTerminalRequest?.open === true
  const nativeTerminalNeeded = nativeTerminalRequest?.needed === true
  const [termHover, setTermHover] = useState(false)
  const handleTerminalHover = useCallback((h: boolean) => setTermHover(h), [])
  // hover 预览：鼠标离开 overlay 区域时也要关闭
  const overlayVisible = nativeTerminalOpen || termHover
  const closeNativeTerminalOverlay = (): void => {
    /* [2026-05-07] 原关闭浮窗时直接 Ctrl+C，会打断 Claude Code TUI 并导致终端黑屏；× 现在只隐藏浮窗。 */
    // sendRawPtyInput(sessionId, '\x03')
    // setEmbedSlashPtyEchoActive(sessionId, false)
    dismissNativeTerminal(sessionId)
  }

  useEffect(() => {
    if (!overlayVisible) return
    const wake = (): void => wakeTerminal(sessionId)
    const raf = requestAnimationFrame(wake)
    /* [2026-05-11] 浮窗挂载后 ResizeObserver / fit 仍会重算 viewport；
     * [2026-06-02] hover→fixed 切换时也需要 wake，防止 xterm 丢失滚动。
     * 最后一次稍晚执行，避免用户滚轮向下时 xterm 又从顶部开始。 */
    const t1 = window.setTimeout(wake, 120)
    const t2 = window.setTimeout(wake, 360)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [nativeTerminalOpen, overlayVisible, sessionId])

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
        onMouseDown={() => {
          setActiveSession(sessionId)
          // [2026-06-17] 点击窗格时稳健聚焦输入框：xterm 自带 mousedown focus 在刚重挂载/
          // 切窗格后偶发不生效（点击没反应），重试式 focus 兜底确保第一次键入就能进入。
          focusSessionInput(sessionId)
        }}
      >
        {embedBeta ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <TerminalDropZone sessionId={sessionId}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ClaudeTranscriptPane sessionId={sessionId} className="min-h-0 flex-1 border-b border-claude-border" />
                <EmbedSessionComposer sessionId={sessionId} nativeTerminalOverlayVisible={overlayVisible} onTerminalHover={handleTerminalHover} />
              </div>
            </TerminalDropZone>
            {/* 终端浮窗：nativeTerminalOpen 时固定显示（底部）；hover 预览时浮在按钮区上方
                常驻 DOM 避免 XTerminal 反复挂载，用 opacity+translate 做进出动画 */}
            <div
              className={[
                'absolute right-4 z-30 flex flex-col overflow-hidden rounded-xl',
                'border border-[var(--theme-accent-border)] bg-[var(--theme-terminal-overlay-bg)]',
                'shadow-2xl shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-accent-border)]',
                'transition-[opacity,transform] duration-200 ease-out',
                // 固定态底部紧贴，预览态抬起避开按钮区（约 100px）
                nativeTerminalOpen ? 'bottom-4' : 'bottom-[108px]',
                // 固定态高度大，预览态稍小
                'h-[min(420px,62%)]',
                'w-[min(560px,calc(100%-2rem))]',
                // 显隐动画
                overlayVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-3 pointer-events-none',
              ].join(' ')}
              onMouseEnter={() => { if (!nativeTerminalOpen) setTermHover(true) }}
              onMouseLeave={() => { if (!nativeTerminalOpen) setTermHover(false) }}
            >
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--theme-accent-border)] bg-[var(--theme-terminal-overlay-header)] px-2.5">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold text-[var(--theme-accent-text)]">
                    {!nativeTerminalOpen ? '终端预览 — 点击「显示终端」可固定' : '需要终端交互'}
                  </span>
                  {nativeTerminalOpen && nativeTerminalRequest?.reason ? (
                    <span className="ml-2 text-[9px] text-claude-muted">{nativeTerminalRequest.reason}</span>
                  ) : null}
                </div>
                {nativeTerminalOpen && (
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] text-[18px] font-bold leading-none text-[var(--theme-accent-text)] shadow-sm shadow-[color:var(--theme-shadow)] transition hover:border-[var(--theme-danger-border)] hover:bg-[var(--theme-danger-bg)] hover:text-[var(--theme-danger-text)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                    aria-label="关闭原生终端浮窗"
                    title="关闭终端浮窗"
                    onClick={closeNativeTerminalOverlay}
                  >
                    ×
                  </button>
                )}
              </div>
              <TerminalDropZone sessionId={sessionId}>
                <XTerminal sessionId={sessionId} active={focused || overlayVisible} />
              </TerminalDropZone>
            </div>
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
  const leftId = `p-${idPath}-L`
  const rightId = `p-${idPath}-R`
  // [2026-06-16] 还原拖动比例：node.sizes 存在则作为初始布局，避免切换窗口后重置成 50/50
  const defaultLayout = node.sizes ? { [leftId]: node.sizes[0], [rightId]: node.sizes[1] } : undefined

  return (
    <Group
      id={`term-grp-${idPath}`}
      orientation={orientation}
      className="flex h-full min-h-0 min-w-0 flex-1"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout) => {
        const l = layout[leftId]
        const r = layout[rightId]
        if (typeof l !== 'number' || typeof r !== 'number') return
        const cur = node.sizes
        if (cur && Math.round(cur[0]) === Math.round(l) && Math.round(cur[1]) === Math.round(r)) return
        useSessionStore.getState().updateSplitSizes(path, [Math.round(l), Math.round(r)])
      }}
    >
      <Panel defaultSize={50} minSize={15} id={leftId} className="min-h-0 min-w-0">
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
      <Panel defaultSize={50} minSize={15} id={rightId} className="min-h-0 min-w-0">
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
