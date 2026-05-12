import React, { useState, useCallback, useEffect, useRef } from 'react'
import { getOfficeFileType, OfficeFileType } from './officeFileDetector'
import { parseDocx } from './docxParser'
import { parseXlsx } from './xlsxParser'
import { parsePptx } from './pptxParser'
import { getElementSelectorScript } from './elementSelector'

interface PreviewState {
  filePath: string
  fileName: string
  fileType: OfficeFileType
  html: string
  loading: boolean
  error: string | null
}

const htmlCache = new Map<string, string>()

export function OfficePreviewPanel(): React.ReactElement {
  const [state, setState] = useState<PreviewState | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'office-element-selected' && e.data.path) {
        setSelectedPath(e.data.path)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const openFile = useCallback(async (filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath
    const fileType = getOfficeFileType(fileName)
    if (!fileType) return

    const cached = htmlCache.get(filePath)
    if (cached) {
      setState({ filePath, fileName, fileType, html: cached, loading: false, error: null })
      return
    }

    setState({ filePath, fileName, fileType, html: '', loading: true, error: null })

    try {
      const result = await window.electronAPI.openOfficePreview(filePath)
      if (!result.success || !result.buffer) {
        setState((prev) => prev ? { ...prev, loading: false, error: result.error || 'Failed to open file' } : null)
        return
      }

      let html: string
      switch (fileType) {
        case 'docx':
          html = await parseDocx(result.buffer)
          break
        case 'xlsx': {
          const xlsxResult = parseXlsx(result.buffer)
          html = xlsxResult.html
          break
        }
        case 'pptx':
          html = await parsePptx(result.buffer)
          break
        default:
          html = '<p>Unsupported format</p>'
      }

      htmlCache.set(filePath, html)
      setState({ filePath, fileName, fileType, html, loading: false, error: null })
    } catch (err: any) {
      setState((prev) => prev ? { ...prev, loading: false, error: err.message } : null)
    }
  }, [])

  useEffect(() => {
    ;(window as any).__officePreviewOpen = openFile
    return () => { delete (window as any).__officePreviewOpen }
  }, [openFile])

  const injectScript = useCallback((html: string): string => {
    const script = getElementSelectorScript()
    return html.replace('</body>', `<script>${script}</script></body>`)
  }, [])

  if (!state) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
        <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="text-sm">Double-click or drop an Office file to preview</p>
      </div>
    )
  }

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-400">Loading {state.fileName}...</div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-red-400">
        <p className="text-sm">Error: {state.error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-claude-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileTypeIcon type={state.fileType} />
          <span className="truncate text-sm font-medium" title={state.filePath}>
            {state.fileName}
          </span>
        </div>
      </div>
      {selectedPath && (
        <div className="shrink-0 border-b border-claude-border bg-gray-800 px-3 py-1 text-xs text-gray-300 font-mono">
          {selectedPath}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={injectScript(state.html)}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="Office Preview"
        />
      </div>
    </div>
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
      className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
      style={{ backgroundColor: colors[type] }}
    >
      {type.charAt(0).toUpperCase()}
    </span>
  )
}
