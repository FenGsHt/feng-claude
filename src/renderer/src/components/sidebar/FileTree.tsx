import React, { useState, useMemo, useEffect } from 'react'
import type { FileTreeNode } from '../../types/fs'
import { FILE_DRAG_MIME, type FileDragPayload } from '../../lib/claudeRef'
import { useI18n } from '../../i18n'

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

  // Lazy load children when expanding a directory with no children
  useEffect(() => {
    if (expanded && loadChildren && (!node.children || node.children.length === 0)) {
      void loadChildren(node.path)
    }
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  // 搜索过滤：检查当前节点或子节点是否匹配
  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    // 当前节点名匹配
    if (node.name.toLowerCase().includes(q)) return true
    // 子节点中有匹配的
    if (node.children?.some(child => child.name.toLowerCase().includes(q))) return true
    return false
  }, [node.name, node.children, searchQuery])

  if (!matchesSearch) return <></>

  if (node.type === 'directory') {
    const hasChildren = node.children && node.children.length > 0
    return (
      <div>
        <button
          type="button"
          draggable
          onDragStart={(e) => setFileDragData(e, node)}
          onClick={() => setExpanded((v) => !v)}
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
    )
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => setFileDragData(e, node)}
      className="flex cursor-grab active:cursor-grabbing items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-claude-border/50 rounded text-[12px] text-claude-muted hover:text-claude-text transition-colors"
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      title={`${node.path} — drag to Claude terminal as @ reference`}
    >
      <span className="text-[10px] opacity-0 shrink-0 w-[10px]">▸</span>
      {getFileIcon(node.name, false)}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface FileTreeProps {
  nodes: FileTreeNode[]
  loading?: boolean
  currentPath?: string
  onChangePath?: () => void
  loadChildren?: (dirPath: string) => Promise<void>
}

export function FileTree({ nodes, loading, currentPath, onChangePath, loadChildren }: FileTreeProps): React.ReactElement {
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
            {onChangePath && (
              <button
                onClick={onChangePath}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                title={t.files.changeDir}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 6h10M6 1l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
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
