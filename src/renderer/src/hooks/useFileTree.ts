import { useState, useCallback, useRef } from 'react'
import type { FileTreeNode } from '../types/fs'

function insertChildren(nodes: FileTreeNode[], targetPath: string, children: FileTreeNode[]): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: insertChildren(node.children, targetPath, children) }
    }
    return node
  })
}

export function useFileTree(initialPath?: string) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState(initialPath ?? '')
  const loadedPaths = useRef(new Set<string>())

  const loadTree = useCallback(async (dirPath: string) => {
    if (!dirPath) return
    setLoading(true)
    try {
      const nodes = await window.electronAPI.readFileTree(dirPath, 1)
      setTree(nodes ?? [])
      setCurrentPath(dirPath)
      loadedPaths.current = new Set([dirPath])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadChildren = useCallback(async (dirPath: string) => {
    if (loadedPaths.current.has(dirPath)) return
    loadedPaths.current.add(dirPath)
    const children = await window.electronAPI.readFileTree(dirPath, 1)
    setTree((prev) => insertChildren(prev, dirPath, children ?? []))
  }, [])

  const openDirDialog = useCallback(async () => {
    const selected = await window.electronAPI.openDirDialog()
    if (selected) {
      await loadTree(selected)
      return selected
    }
    return null
  }, [loadTree])

  return { tree, loading, currentPath, loadTree, loadChildren, openDirDialog }
}
