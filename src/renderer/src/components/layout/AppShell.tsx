import React, { useEffect, useState, useRef } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { TabBar } from '../tabs/TabBar'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { OfficePreviewPanel } from '../office/OfficePreviewPanelRight'
import { useOfficePreviewPanelStore } from '../../store/officePreviewPanelStore'
import { TextEditorPanel } from '../sidebar/TextEditorPanel'
import { useTextEditorStore } from '../../store/textEditorStore'
import { setTerminalLineHandler } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useLangStore } from '../../i18n'
import { useDragResize } from '../../hooks/useDragResize'

const SIDEBAR_DEFAULT = 280
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 520
const SIDEBAR_STORAGE_KEY = 'sidebar-width'

export function AppShell(): React.ReactElement {
  const [browserPanel, setBrowserPanel] = useState({ visible: false, width: 0 })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parseInt(saved, 10))) : SIDEBAR_DEFAULT
  })
  const officePanelWidth = useOfficePreviewPanelStore((s) => s.visible ? s.width : 0)
  const editorVisible = useTextEditorStore((s) => s.visible)
  const splitSize = useTextEditorStore((s) => s.splitSize)
  const splitDirection = useTextEditorStore((s) => s.splitDirection)
  const setSplitSize = useTextEditorStore((s) => s.setSplitSize)

  // Capture-at-mousedown refs shared across drag handlers
  const sidebarStartW = useRef(0)
  const editorStartSize = useRef(0)
  const browserStartW = useRef(0)

  // ── Sidebar resize ──────────────────────────────────────────
  const startResize = useDragResize({
    onStart: () => { sidebarStartW.current = sidebarWidth },
    onMove: (delta) => setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, sidebarStartW.current + delta))),
    onEnd: () => setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); return w }),
  })

  // ── Editor split resize (grows toward the left/top so delta is inverted) ──
  const startEditorResize = useDragResize({
    axis: splitDirection === 'horizontal' ? 'x' : 'y',
    onStart: () => { editorStartSize.current = useTextEditorStore.getState().splitSize },
    onMove: (delta) => setSplitSize(Math.max(200, Math.min(1400, editorStartSize.current - delta))),
  })

  // ── Browser panel resize (grows leftward so delta is inverted) ─────────────
  const startBrowserResize = useDragResize({
    onStart: () => { if (browserPanel.visible) browserStartW.current = browserPanel.width },
    onMove: (delta) => {
      if (!browserPanel.visible) return
      const newWidth = Math.max(200, browserStartW.current - delta)
      const opW = useOfficePreviewPanelStore.getState().visible ? useOfficePreviewPanelStore.getState().width : 0
      void window.electronAPI.browserView?.setRatio?.(newWidth / (window.innerWidth - opW))
    },
  })

  useEffect(() => {
    setTerminalLineHandler((sessionId, line) => {
      void useSessionStore.getState().notifyTerminalCommittedLine(sessionId, line)
    })
    return () => setTerminalLineHandler(null)
  }, [])

  useEffect(() => { void useGlobalTokenStore.getState().hydrate() }, [])

  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      if (s.language) useLangStore.getState().setLang(s.language)
    })
  }, [])

  useEffect(() => {
    return window.electronAPI.browserView?.onBrowserViewStateChanged?.((state) => {
      setBrowserPanel(state)
    })
  }, [])

  // Notify main process of total right-side DOM panel width so WebContentsView is positioned correctly
  useEffect(() => {
    window.electronAPI.browserView?.setToolsPanelWidth?.(officePanelWidth)
  }, [officePanelWidth])

  // ── Main content: terminal + optional editor split ──────────
  const editorPane = editorVisible ? <TextEditorPanel /> : null

  const splitContent = editorVisible ? (
    splitDirection === 'horizontal' ? (
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-hidden min-w-0">
          <TerminalPanel />
        </div>
        {/* Horizontal split handle */}
        <div
          onMouseDown={startEditorResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
        />
        <div className="flex flex-col overflow-hidden shrink-0 border-l border-claude-border" style={{ width: splitSize }}>
          {editorPane}
        </div>
      </div>
    ) : (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden min-h-0">
          <TerminalPanel />
        </div>
        {/* Vertical split handle */}
        <div
          onMouseDown={startEditorResize}
          className="h-1 shrink-0 cursor-row-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
        />
        <div className="flex flex-col overflow-hidden shrink-0 border-t border-claude-border" style={{ height: splitSize }}>
          {editorPane}
        </div>
      </div>
    )
  ) : (
    <TerminalPanel />
  )

  return (
    <div className="flex flex-col h-screen bg-claude-bg text-claude-text overflow-hidden font-sans antialiased">
      <TitleBar />
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
          style={browserPanel.visible || officePanelWidth > 0
            ? { marginRight: browserPanel.width + officePanelWidth + 6 }
            : undefined}
        >
          <TabBar />
          {splitContent}
        </main>
        {/* Browser panel resize handle (fixed, left edge of native WebContentsView) */}
        {browserPanel.visible && (
          <div
            onMouseDown={startBrowserResize}
            className="cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
            style={{
              position: 'fixed',
              top: 32,
              bottom: 0,
              right: browserPanel.width + officePanelWidth,
              width: 8,
              zIndex: 50,
            }}
          />
        )}
      </div>
      {/* Office preview right panel (fixed overlay) */}
      <OfficePreviewPanel />
    </div>
  )
}
