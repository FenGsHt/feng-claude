/**
 * [2026-05-12] Office file preview panel — right-side floating panel, like browser DevTools.
 * Replaces the sidebar tab version for double-click from file tree.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { getOfficeFileType, OfficeFileType } from './officeFileDetector'
import { parseDocx } from './docxParser'
import { parseXlsx } from './xlsxParser'
import { parsePptx } from './pptxParser'
import { getElementSelectorScript } from './elementSelector'
import { useOfficePreviewPanelStore } from '../../store/officePreviewPanelStore'
import { useSessionStore } from '../../store/sessionStore'
import { injectEmbedDraft } from '../../lib/embedDraftBridge'

interface PreviewState {
  fileName: string
  fileType: OfficeFileType
  html: string
  loading: boolean
  error: string | null
}

const htmlCache = new Map<string, string>()

export function OfficePreviewPanel(): React.ReactElement | null {
  const { visible, filePath, width, close, setWidth } = useOfficePreviewPanelStore()
  const [state, setState] = useState<PreviewState | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const [pickMode, setPickMode] = useState(false)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  useEffect(() => {
    if (!visible || !filePath) return
    openFile(filePath)
  }, [visible, filePath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) { setState(null) }
  }, [visible])

  const openFile = useCallback(async (fp: string) => {
    const fileName = fp.split(/[/\\]/).pop() || fp
    const fileType = getOfficeFileType(fileName)
    if (!fileType) return

    const cached = htmlCache.get(fp)
    if (cached) {
      setState({ fileName, fileType, html: cached, loading: false, error: null })
      return
    }

    setState({ fileName, fileType, html: '', loading: true, error: null })

    try {
      const result = await window.electronAPI.openOfficePreview(fp)
      if (!result.success || (!result.buffer && !result.html)) {
        setState((prev) => prev ? { ...prev, loading: false, error: result.error || 'Failed to open file' } : null)
        return
      }

      let html: string
      switch (fileType) {
        case 'docx':
          html = await parseDocx(result.buffer!)
          break
        case 'xlsx': {
          const xlsxResult = parseXlsx(result.buffer!)
          html = xlsxResult.html
          break
        }
        case 'pptx':
          html = result.html || await parsePptx(result.buffer!)
          break
        default:
          html = '<p>Unsupported format</p>'
      }

      htmlCache.set(fp, html)
      setState({ fileName, fileType, html, loading: false, error: null })
    } catch (err: any) {
      setState((prev) => prev ? { ...prev, loading: false, error: err.message } : null)
    }
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = width
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const next = Math.max(320, Math.min(960, resizeStartWidth.current + resizeStartX.current - ev.clientX))
      setWidth(next)
    }
    const onUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, setWidth])

  // Listen for MCP-triggered office preview open
  useEffect(() => {
    return window.electronAPI.onOfficePreviewTrigger?.((fp: string) => {
      openFile(fp)
    })
  }, [openFile])

  // Listen for cell/element selection from iframe
  useEffect(() => {
    if (!visible || !filePath) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'office-element-selected' && e.data.path && activeSessionId) {
        const ref = `@${filePath}#${e.data.path} `
        // [2026-05-12] 优先写入外嵌输入框，不存在时发到 PTY
        if (!injectEmbedDraft(activeSessionId, ref)) {
          window.electronAPI.sendInput(activeSessionId, ref)
        }
        setPickMode(false)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [visible, filePath, activeSessionId])

  const togglePickMode = useCallback(() => {
    setPickMode((prev) => {
      const next = !prev
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'toggle-pick-mode' }, '*')
      }
      return next
    })
  }, [])

  const injectScript = useCallback((html: string): string => {
    const script = getElementSelectorScript()
    return html.replace('</body>', `<script>${script}</script></body>`)
  }, [])

  if (!visible) return null

  return (
    <>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
        style={{
          position: 'fixed',
          top: 32,
          bottom: 0,
          right: width,
          width: 8,
          zIndex: 60
        }}
      />

      {/* Panel */}
      <div
        className="flex flex-col h-full bg-claude-surface border-l border-claude-border overflow-hidden"
        style={{
          position: 'fixed',
          top: 32,
          bottom: 0,
          right: 0,
          width,
          zIndex: 55,
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 shrink-0 h-8 px-2 border-b border-claude-border bg-claude-bg/50">
          {state?.fileType && <FileTypeIcon type={state.fileType} />}
          <span className="flex-1 truncate text-[11px] font-medium" title={state?.fileName}>
            {state?.fileName || 'Office Preview'}
          </span>
          <button
            onClick={togglePickMode}
            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold transition-colors ${
              pickMode
                ? 'bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/50'
                : 'text-claude-muted hover:text-claude-text hover:bg-white/10'
            }`}
            title={pickMode ? 'Click a cell to reference' : 'Pick cell'}
          >
            @
          </button>
          <button
            onClick={close}
            className="flex h-5 w-5 items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-white/10 transition-colors"
            title="Close preview"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {!state || state.loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-sm text-claude-muted">
                {state?.loading ? `Loading ${state.fileName}...` : 'Loading...'}
              </div>
            </div>
          ) : state.error ? (
            <div className="flex h-full items-center justify-center text-red-400">
              <p className="text-sm">Error: {state.error}</p>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={injectScript(state.html)}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin"
              title="Office Preview"
            />
          )}
        </div>
      </div>
    </>
  )
}

function FileTypeIcon({ type }: { type: OfficeFileType }): React.ReactElement {
  const colors: Record<OfficeFileType, string> = {
    docx: '#2b579a',
    xlsx: '#217346',
    pptx: '#d24726',
  }
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white shrink-0"
      style={{ backgroundColor: colors[type] }}
    >
      {type.charAt(0).toUpperCase()}
    </span>
  )
}
