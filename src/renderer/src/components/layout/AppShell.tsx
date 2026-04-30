import React, { useEffect, useState, useRef, useCallback } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { TabBar } from '../tabs/TabBar'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { ToolCallFeed } from '../toolcalls/ToolCallFeed'
import { setTerminalLineHandler } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useLangStore } from '../../i18n'

const SIDEBAR_DEFAULT = 280
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 520
const SIDEBAR_STORAGE_KEY = 'sidebar-width'

const BROWSER_MIN_RATIO = 0.25  // [2026-04-30] 浏览器面板最小比例
const BROWSER_MAX_RATIO = 0.75  // [2026-04-30] 浏览器面板最大比例

export function AppShell(): React.ReactElement {
  const [showTools, setShowTools] = useState(false)
  const [browserPanel, setBrowserPanel] = useState({ visible: false, width: 0 })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parseInt(saved, 10))) : SIDEBAR_DEFAULT
  })
  const isResizing = useRef(false)
  const isBrowserResizing = useRef(false)  // [2026-04-30] 浏览器面板拖拽状态
  const browserDragStartX = useRef(0)      // [2026-04-30] 拖拽开始时的鼠标位置
  const browserDragStartWidth = useRef(0)  // [2026-04-30] 拖拽开始时的面板宽度

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // persist after drag ends
      setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // [2026-04-30] 浏览器面板分隔条拖拽
  const startBrowserResize = useCallback((e: React.MouseEvent) => {
    if (!browserPanel.visible) return
    e.preventDefault()
    isBrowserResizing.current = true
    browserDragStartX.current = e.clientX
    browserDragStartWidth.current = browserPanel.width

    const onMove = (ev: MouseEvent) => {
      if (!isBrowserResizing.current) return
      // 向左拖拽增加面板宽度，向右拖拽减少面板宽度
      const delta = browserDragStartX.current - ev.clientX
      const newWidth = Math.max(200, browserDragStartWidth.current + delta)
      // 通过 IPC 通知主进程更新比例
      void window.electronAPI.browserView?.setRatio?.(newWidth / window.innerWidth)
    }
    const onUp = () => {
      isBrowserResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [browserPanel])

  useEffect(() => {
    setTerminalLineHandler((sessionId, line) => {
      void useSessionStore.getState().notifyTerminalCommittedLine(sessionId, line)
    })
    return () => setTerminalLineHandler(null)
  }, [])

  // Load persisted token data from main process (userData/token-data.json)
  useEffect(() => {
    void useGlobalTokenStore.getState().hydrate()
  }, [])

  // Sync UI language from saved settings
  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      if (s.language) useLangStore.getState().setLang(s.language)
    })
  }, [])

  // Listen for browser panel state changes (embedded browser shares space with terminal)
  useEffect(() => {
    return window.electronAPI.browserView?.onBrowserViewStateChanged?.((state) => {
      setBrowserPanel(state)
    })
  }, [])

  // [2026-05-01] 当 Tools calls 面板显示/隐藏时，通知主进程更新浏览器布局
  useEffect(() => {
    const width = showTools ? 256 : 0  // w-64 = 256px
    window.electronAPI.browserView?.setToolsPanelWidth?.(width)
  }, [showTools])

  return (
    <div className="flex flex-col h-screen bg-claude-bg text-claude-text overflow-hidden font-sans antialiased">
      <TitleBar onToggleTools={() => setShowTools((v) => !v)} showTools={showTools} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar width={sidebarWidth} />
        {/* Sidebar resize handle */}
        <div
          onMouseDown={startResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-amber-500/40 active:bg-amber-500/60 transition-colors"
          style={{ marginLeft: -1 }}
        />
        <main
          className="flex flex-col flex-1 overflow-hidden min-w-0"
          style={browserPanel.visible ? { marginRight: browserPanel.width + 6 } : undefined}
        >
          <TabBar />
          <TerminalPanel />
        </main>
        {/* [2026-04-30] Browser panel resize handle — 左边缘分隔条
            [2026-04-30] 原先作为 flex 子项放在 main 后面；main 的 marginRight 会把它推到浏览器区域右侧，
            且原生 WebContentsView 会覆盖普通 DOM。改为 fixed，贴在浏览器左边界外侧，确保能收到鼠标事件。 */}
        {browserPanel.visible && (
          <div
            onMouseDown={startBrowserResize}
            className="cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
            style={{
              position: 'fixed',
              top: 32,
              bottom: 0,
              right: browserPanel.width,
              width: 8,
              zIndex: 50
            }}
          />
        )}
        {showTools && (
          <div className="flex flex-col w-64 shrink-0 border-l border-claude-border bg-claude-surface overflow-hidden">
            <ToolCallFeed />
          </div>
        )}
      </div>
    </div>
  )
}