import React, { useEffect, useState, useRef, useCallback } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { TabBar } from '../tabs/TabBar'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { ToolCallFeed } from '../toolcalls/ToolCallFeed'
import { OfficePreviewPanel } from '../office/OfficePreviewPanelRight'
import { useOfficePreviewPanelStore } from '../../store/officePreviewPanelStore'
import { TextEditorPanel } from '../sidebar/TextEditorPanel'
import { useTextEditorStore } from '../../store/textEditorStore'
import { setTerminalLineHandler } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useLangStore } from '../../i18n'

const SIDEBAR_DEFAULT = 280
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 520
const SIDEBAR_STORAGE_KEY = 'sidebar-width'

export function AppShell(): React.ReactElement {
  const [showTools, setShowTools] = useState(false)
  const [browserPanel, setBrowserPanel] = useState({ visible: false, width: 0 })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parseInt(saved, 10))) : SIDEBAR_DEFAULT
  })
  const isResizing = useRef(false)
  const isBrowserResizing = useRef(false)
  const browserDragStartX = useRef(0)
  const browserDragStartWidth = useRef(0)
  const officePanelWidth = useOfficePreviewPanelStore((s) => s.visible ? s.width : 0)
  const editorVisible = useTextEditorStore((s) => s.visible)
  const splitSize = useTextEditorStore((s) => s.splitSize)
  const splitDirection = useTextEditorStore((s) => s.splitDirection)
  const setSplitSize = useTextEditorStore((s) => s.setSplitSize)

  // ── Sidebar resize ──────────────────────────────────────────
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = sidebarWidth

    const onMove = (ev: MouseEvent): void => {
      if (!isResizing.current) return
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX))
      setSidebarWidth(next)
    }
    const onUp = (): void => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // ── Editor split resize ─────────────────────────────────────
  const startEditorResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const dir = useTextEditorStore.getState().splitDirection
    const startPos = dir === 'horizontal' ? e.clientX : e.clientY
    const startSize = useTextEditorStore.getState().splitSize

    const onMove = (ev: MouseEvent): void => {
      const pos = dir === 'horizontal' ? ev.clientX : ev.clientY
      // dragging toward the editor (left for H, up for V) grows the editor
      const next = Math.max(200, Math.min(1400, startSize + startPos - pos))
      setSplitSize(next)
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [setSplitSize])

  // ── Browser panel resize ────────────────────────────────────
  const startBrowserResize = useCallback((e: React.MouseEvent) => {
    if (!browserPanel.visible) return
    e.preventDefault()
    isBrowserResizing.current = true
    browserDragStartX.current = e.clientX
    browserDragStartWidth.current = browserPanel.width

    const onMove = (ev: MouseEvent): void => {
      if (!isBrowserResizing.current) return
      const delta = browserDragStartX.current - ev.clientX
      const newWidth = Math.max(200, browserDragStartWidth.current + delta)
      const opW = useOfficePreviewPanelStore.getState().visible ? useOfficePreviewPanelStore.getState().width : 0
      const effectiveWidth = window.innerWidth - (showTools ? 256 : 0) - opW
      void window.electronAPI.browserView?.setRatio?.(newWidth / effectiveWidth)
    }
    const onUp = (): void => {
      isBrowserResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [browserPanel, showTools])

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
    const width = (showTools ? 256 : 0) + officePanelWidth
    window.electronAPI.browserView?.setToolsPanelWidth?.(width)
  }, [showTools, officePanelWidth])

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
          style={browserPanel.visible || officePanelWidth > 0
            ? { marginRight: browserPanel.width + officePanelWidth + (showTools ? 256 : 0) + 6 }
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
              right: browserPanel.width + (showTools ? 256 : 0) + officePanelWidth,
              width: 8,
              zIndex: 50,
            }}
          />
        )}
        {showTools && (
          <div className="flex flex-col w-64 shrink-0 border-l border-claude-border bg-claude-surface overflow-hidden">
            <ToolCallFeed />
          </div>
        )}
      </div>
      {/* Office preview right panel (fixed overlay) */}
      <OfficePreviewPanel />
    </div>
  )
}
