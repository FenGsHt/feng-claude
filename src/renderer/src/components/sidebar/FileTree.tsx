import React, { useState } from 'react'
import type { FileTreeNode } from '../../types/fs'

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
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 hover:bg-claude-border/50 rounded text-xs text-claude-muted hover:text-claude-text transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
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
      className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 hover:bg-claude-border/50 rounded text-xs text-claude-muted hover:text-claude-text transition-colors"
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      title={node.path}
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-claude-border shrink-0">
        <span className="text-xs font-medium text-claude-muted uppercase tracking-wider">Files</span>
        {onChangePath && (
          <button
            onClick={onChangePath}
            className="text-xs text-claude-muted hover:text-claude-text transition-colors"
            title="Change directory"
          >
            ⊕
          </button>
        )}
      </div>
      {currentPath && (
        <div className="px-3 py-1.5 border-b border-claude-border shrink-0">
          <p className="text-xs text-claude-muted font-mono truncate" title={currentPath}>
            {currentPath.split(/[/\\]/).pop() ?? currentPath}
          </p>
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
