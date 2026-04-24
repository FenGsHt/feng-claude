import React, { useState } from 'react'
import type { FileTreeNode } from '../../types/fs'
import { FILE_DRAG_MIME, type FileDragPayload } from '../../lib/claudeRef'

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

interface NodeProps {
  node: FileTreeNode
  depth: number
}

function FileTreeNodeItem({ node, depth }: NodeProps): React.ReactElement {
  const [expanded, setExpanded] = useState(depth < 1)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          draggable
          onDragStart={(e) => setFileDragData(e, node)}
          onClick={() => setExpanded((v) => !v)}
          className="flex cursor-grab active:cursor-grabbing items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-claude-border/50 rounded text-[13px] text-claude-muted hover:text-claude-text transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          title={`${node.path} — drag to Claude terminal as @ reference`}
        >
          <span className="text-xs">{expanded ? '▾' : '▸'}</span>
          <span className="text-amber-500/80">⊞</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNodeItem key={child.path} node={child} depth={depth + 1} />
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
      className="flex cursor-grab active:cursor-grabbing items-center gap-1.5 w-full text-left px-2 py-0.5 hover:bg-claude-border/50 rounded text-xs text-claude-muted hover:text-claude-text transition-colors"
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      title={`${node.path} — drag to Claude terminal as @ reference`}
    >
      <span className="text-xs opacity-0">▸</span>
      <span className="text-claude-muted/60">·</span>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface FileTreeProps {
  nodes: FileTreeNode[]
  loading?: boolean
  currentPath?: string
  onChangePath?: () => void
}

export function FileTree({ nodes, loading, currentPath, onChangePath }: FileTreeProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {currentPath && (
        <div className="px-3 py-1.5 border-b border-claude-border shrink-0 flex items-center justify-between gap-1">
          <p className="text-[12px] text-claude-muted font-mono truncate flex-1" title={currentPath}>
            {currentPath.split(/[/\\]/).pop() ?? currentPath}
          </p>
          {onChangePath && (
            <button
              onClick={onChangePath}
              className="shrink-0 text-[13px] text-claude-muted hover:text-claude-text transition-colors"
              title="Change directory"
            >
              ⊕
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            Loading…
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            No files
          </div>
        ) : (
          nodes.map((node) => <FileTreeNodeItem key={node.path} node={node} depth={0} />)
        )}
      </div>
    </div>
  )
}
