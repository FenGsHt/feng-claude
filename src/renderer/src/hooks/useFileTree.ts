import { useState, useCallback, useRef, useEffect } from 'react'
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

  const refresh = useCallback(async () => {
    if (!currentPath) return
    loadedPaths.current = new Set()
    setLoading(true)
    try {
      const nodes = await window.electronAPI.readFileTree(currentPath, 1)
      setTree(nodes ?? [])
      loadedPaths.current = new Set([currentPath])
    } finally {
      setLoading(false)
    }
  }, [currentPath])

  // currentPath 引用（供事件回调读取最新值）
  const currentPathRef = useRef(currentPath)
  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])

  // [2026-06-15] 静默刷新：重读所有已加载目录并重组树，保留展开状态（组件按 path 作 key，展开态得以保留）
  const silentRefresh = useCallback(async () => {
    const root = currentPathRef.current
    if (!root) return
    const paths = Array.from(loadedPaths.current)
    const pairs = await Promise.all(
      paths.map(async (p) => [p, (await window.electronAPI.readFileTree(p, 1)) ?? []] as const)
    )
    const map = new Map<string, FileTreeNode[]>(pairs)
    // 清理已不存在的已加载路径
    const alive = new Set<string>([root])
    const assemble = (dirPath: string): FileTreeNode[] | undefined => {
      const children = map.get(dirPath)
      if (!children) return undefined
      return children.map((child) => {
        if (child.type === 'directory') {
          alive.add(child.path)
          const sub = map.has(child.path) ? assemble(child.path) : undefined
          return sub ? { ...child, children: sub } : { ...child }
        }
        return child
      })
    }
    const next = assemble(root)
    if (next) {
      setTree(next)
      loadedPaths.current = new Set(paths.filter((p) => p === root || alive.has(p)))
    }
  }, [])

  // [2026-06-15] 监听工作目录文件增删，自动刷新
  useEffect(() => {
    if (!currentPath) return
    void window.electronAPI.watchFilesStart(currentPath)
    const off = window.electronAPI.onFsChanged(() => { void silentRefresh() })
    return () => { off(); void window.electronAPI.watchFilesStop() }
  }, [currentPath, silentRefresh])

  const openDirDialog = useCallback(async () => {
    const selected = await window.electronAPI.openDirDialog()
    if (selected) {
      await loadTree(selected)
      return selected
    }
    return null
  }, [loadTree])

  return { tree, loading, currentPath, loadTree, loadChildren, refresh, openDirDialog }
}
