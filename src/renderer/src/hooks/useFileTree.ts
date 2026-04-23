import { useState, useCallback } from 'react'
import type { FileTreeNode } from '../types/fs'

export function useFileTree(initialPath?: string) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState(initialPath ?? '')

  const loadTree = useCallback(async (dirPath: string) => {
    if (!dirPath) return
    setLoading(true)
    try {
      const nodes = await window.electronAPI.readFileTree(dirPath, 3)
      setTree(nodes ?? [])
      setCurrentPath(dirPath)
    } finally {
      setLoading(false)
    }
  }, [])

  const openDirDialog = useCallback(async () => {
    const selected = await window.electronAPI.openDirDialog()
    if (selected) {
      await loadTree(selected)
      return selected
    }
    return null
  }, [loadTree])

  return { tree, loading, currentPath, loadTree, openDirDialog }
}
