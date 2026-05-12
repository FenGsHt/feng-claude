import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { FileTreeNode } from '../../types/fs'
import { FILE_DRAG_MIME, type FileDragPayload, formatFileRefForClaudeCode } from '../../lib/claudeRef'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../store/sessionStore'
import { injectEmbedDraft } from '../../lib/embedDraftBridge'
import { isOfficeFile } from '../office/officeFileDetector'
import { openOfficePreview } from './sidebarNav'

function setFileDragData(e: React.DragEvent, node: FileTreeNode): void {
  const payload: FileDragPayload = {
    path: node.path,
    kind: node.type === 'directory' ? 'directory' : 'file'
  }
  const json = JSON.stringify(payload)
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(FILE_DRAG_MIME, json)
  e.dataTransfer.setData('application/json', json)
  e.dataTransfer.setData('text/plain', node.path)
}

// 文件图标映射
function getFileIcon(name: string, isDir: boolean): React.ReactElement {
  if (isDir) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-amber-400 shrink-0">
        <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 2h5c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-7C1.67 12 1 11.33 1 10.5V3.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      </svg>
    )
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  // JavaScript/TypeScript
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    return <span className="text-[11px] font-bold text-yellow-400 shrink-0 w-[14px] text-center">JS</span>
  }
  if (ext === 'ts' || ext === 'tsx') {
    return <span className="text-[11px] font-bold text-blue-400 shrink-0 w-[14px] text-center">TS</span>
  }
  if (ext === 'jsx') {
    return <span className="text-[11px] font-bold text-orange-400 shrink-0 w-[14px] text-center">JS</span>
  }
  // Config files
  if (ext === 'json') {
    return <span className="text-[11px] font-bold text-green-400 shrink-0 w-[14px] text-center">{}</span>
  }
  if (ext === 'yaml' || ext === 'yml') {
    return <span className="text-[11px] font-bold text-purple-400 shrink-0 w-[14px] text-center">YA</span>
  }
  if (ext === 'toml') {
    return <span className="text-[11px] font-bold text-purple-400 shrink-0 w-[14px] text-center">TO</span>
  }
  // Markdown
  if (ext === 'md' || ext === 'mdx') {
    return <span className="text-[11px] font-bold text-slate-400 shrink-0 w-[14px] text-center">MD</span>
  }
  // Styles
  if (ext === 'css' || ext === 'scss' || ext === 'less') {
    return <span className="text-[11px] font-bold text-pink-400 shrink-0 w-[14px] text-center">CS</span>
  }
  // HTML
  if (ext === 'html' || ext === 'htm') {
    return <span className="text-[11px] font-bold text-red-400 shrink-0 w-[14px] text-center">HT</span>
  }
  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-teal-400 shrink-0">
        <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1"/>
        <circle cx="5" cy="6" r="1" fill="currentColor"/>
        <path d="M3 10l2-2 2 2 3-3 2 3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      </svg>
    )
  }
  // Python
  if (ext === 'py') {
    return <span className="text-[11px] font-bold text-cyan-400 shrink-0 w-[14px] text-center">PY</span>
  }
  // Rust
  if (ext === 'rs') {
    return <span className="text-[11px] font-bold text-orange-500 shrink-0 w-[14px] text-center">RS</span>
  }
  // Go
  if (ext === 'go') {
    return <span className="text-[11px] font-bold text-cyan-500 shrink-0 w-[14px] text-center">GO</span>
  }
  // Shell
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return <span className="text-[11px] font-bold text-green-500 shrink-0 w-[14px] text-center">SH</span>
  }
  // Lock files
  if (ext === 'lock' || name.endsWith('-lock.json') || name === 'package-lock.json' || name === 'yarn.lock') {
    return <span className="text-[11px] font-bold text-slate-500 shrink-0 w-[14px] text-center">🔒</span>
  }
  // Git
  if (name.startsWith('.git') || ext === 'gitignore' || ext === 'gitattributes') {
    return <span className="text-[11px] font-bold text-orange-600 shrink-0 w-[14px] text-center">GT</span>
  }
  // Env
  if (ext === 'env' || name.startsWith('.env')) {
    return <span className="text-[11px] font-bold text-yellow-500 shrink-0 w-[14px] text-center">EV</span>
  }
  // Binary/data
  if (['bin', 'exe', 'dll', 'so', 'dylib'].includes(ext)) {
    return <span className="text-[11px] font-bold text-slate-600 shrink-0 w-[14px] text-center">⚡</span>
  }
  // Default file icon
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-400 shrink-0">
      <path d="M3 1v12h8V4L8 1H3z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  )
}

interface NodeProps {
  node: FileTreeNode
  depth: number
  searchQuery: string
  loadChildren?: (dirPath: string) => Promise<void>
}

function FileTreeNodeItem({ node, depth, searchQuery, loadChildren }: NodeProps): React.ReactElement {
  const [expanded, setExpanded] = useState(depth < 1)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileTreeNode } | null>(null)
  const ctxMenuDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)

  // Lazy load children when expanding a directory with no children
  useEffect(() => {
    if (expanded && loadChildren && (!node.children || node.children.length === 0)) {
      void loadChildren(node.path)
    }
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close context menu on any click outside (next tick)
  useEffect(() => {
    if (!ctxMenu) return
    const id = setTimeout(() => {
      const handler = (): void => setCtxMenu(null)
      document.addEventListener('click', handler, { once: true })
    }, 0)
    ctxMenuDismissRef.current = id
    return () => clearTimeout(id)
  }, [ctxMenu])

  // Search filter
  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    if (node.name.toLowerCase().includes(q)) return true
    if (node.children?.some(child => child.name.toLowerCase().includes(q))) return true
    return false
  }, [node.name, node.children, searchQuery])

  const computeRelPath = useCallback((absPath: string): string => {
    const activeSess = sessions.find((s) => s.id === activeSessionId)
    const wd = (activeSess?.workdir ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
    const ap = absPath.replace(/\\/g, '/')
    if (!wd) return ap
    if (ap.toLowerCase() === wd.toLowerCase()) return '.'
    if (ap.toLowerCase().startsWith(wd.toLowerCase() + '/')) return ap.slice(wd.length + 1)
    return ap
  }, [activeSessionId, sessions])

  const insertRef = useCallback((absPath: string, isDir: boolean): void => {
    const sid = activeSessionId
    if (!sid) return
    const activeSess = sessions.find((s) => s.id === sid)
    const wd = activeSess?.workdir ?? ''
    const ref = formatFileRefForClaudeCode(absPath, wd, isDir) + ' '
    if (injectEmbedDraft(sid, ref)) return
    window.electronAPI.sendInput(sid, ref)
  }, [activeSessionId, sessions])

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [node])

  const handleDoubleClick = useCallback((): void => {
    if (isOfficeFile(node.name)) {
      openOfficePreview(node.path)
      return
    }
    insertRef(node.path, node.type === 'directory')
  }, [node.path, node.name, node.type, insertRef])

  if (!matchesSearch) return <></>

  const isDir = node.type === 'directory'

  const ctxMenuPortal = ctxMenu && createPortal(
    <div
      className="fixed z-[9999] min-w-[160px] rounded-lg border border-[var(--theme-panel-border)] bg-[var(--theme-card-bg)] py-1 shadow-2xl backdrop-blur-md"
      style={{ left: ctxMenu.x, top: ctxMenu.y }}
      role="menu"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-[var(--theme-panel-bg-soft)] transition-colors"
        onClick={() => { window.electronAPI.writeClipboardText(ctxMenu.node.path); setCtxMenu(null) }}
      >
        复制绝对路径
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-[var(--theme-panel-bg-soft)] transition-colors"
        onClick={() => { window.electronAPI.writeClipboardText(computeRelPath(ctxMenu.node.path)); setCtxMenu(null) }}
      >
        复制相对路径
      </button>
      <div className="my-1 border-t border-[var(--theme-panel-border)]" />
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-[var(--theme-panel-bg-soft)] transition-colors"
        onClick={() => { window.electronAPI.revealFile(ctxMenu.node.path); setCtxMenu(null) }}
      >
        在文件管理器中打开
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-[var(--theme-panel-bg-soft)] transition-colors"
        onClick={() => { insertRef(ctxMenu.node.path, ctxMenu.node.type === 'directory'); setCtxMenu(null) }}
      >
        @ 引用到终端
      </button>
    </div>,
    document.body
  )

  if (isDir) {
    const hasChildren = node.children && node.children.length > 0
    return (
      <>
        <div>
          <button
            type="button"
            draggable
            onDragStart={(e) => setFileDragData(e, node)}
            onClick={() => setExpanded((v) => !v)}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            className="flex cursor-grab active:cursor-grabbing items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-claude-border/50 rounded text-[12px] text-claude-muted hover:text-claude-text transition-colors"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={`${node.path} — drag to Claude terminal as @ reference`}
          >
            <span className="text-[10px] text-claude-muted/60 shrink-0 w-[10px]">{expanded ? '▾' : '▸'}</span>
            {getFileIcon(node.name, true)}
            <span className="truncate">{node.name}</span>
          </button>
          {expanded && hasChildren && (
            <div>
              {node.children!.map((child) => (
                <FileTreeNodeItem key={child.path} node={child} depth={depth + 1} searchQuery={searchQuery} loadChildren={loadChildren} />
              ))}
            </div>
          )}
        </div>
        {ctxMenuPortal}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        draggable
        onDragStart={(e) => setFileDragData(e, node)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className="flex cursor-grab active:cursor-grabbing items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-claude-border/50 rounded text-[12px] text-claude-muted hover:text-claude-text transition-colors"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={`${node.path} — drag to Claude terminal as @ reference`}
      >
        <span className="text-[10px] opacity-0 shrink-0 w-[10px]">▸</span>
        {getFileIcon(node.name, false)}
        <span className="truncate">{node.name}</span>
      </button>
      {ctxMenuPortal}
    </>
  )
}

interface FileTreeProps {
  nodes: FileTreeNode[]
  loading?: boolean
  currentPath?: string
  onChangePath?: () => void
  onRefresh?: () => void
  loadChildren?: (dirPath: string) => Promise<void>
}

export function FileTree({ nodes, loading, currentPath, onChangePath, onRefresh, loadChildren }: FileTreeProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: current path + search */}
      <div className="px-2 pt-2 pb-1.5 shrink-0 border-b border-claude-border/50 space-y-1.5">
        {currentPath && (
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] text-claude-muted font-mono truncate flex-1" title={currentPath}>
              {currentPath.split(/[/\\]/).pop() ?? currentPath}
            </p>
            <div className="flex items-center gap-0.5 shrink-0">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                  title={t.common.refresh}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M6 1.5l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {onChangePath && (
                <button
                  onClick={onChangePath}
                  className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                  title={t.files.changeDir}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 6h10M6 1l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        {/* Search input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.common.search}
          className="w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60 font-mono"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {t.common.loading}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {t.files.empty}
          </div>
        ) : (
          nodes.map((node) => <FileTreeNodeItem key={node.path} node={node} depth={0} searchQuery={searchQuery} loadChildren={loadChildren} />)
        )}
      </div>
    </div>
  )
}
