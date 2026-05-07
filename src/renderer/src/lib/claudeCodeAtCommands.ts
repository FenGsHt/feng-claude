/**
 * @ 文件/目录引用自动补全 — 与 claudeCodeSlashCommands.ts 平行，供 EmbedSessionComposer 使用。
 * [2026-05-07]
 */
import type { FileTreeNode } from '../types/fs'
import { formatFileRefForClaudeCode } from './claudeRef'

export interface FileAtItem {
  insert: string
  matchKey: string
  label: string
  isDirectory: boolean
}

export function flattenTreeToAtItems(nodes: FileTreeNode[], workdir: string): FileAtItem[] {
  const dirs: FileAtItem[] = []
  const files: FileAtItem[] = []

  function walk(items: FileTreeNode[]) {
    for (const n of items) {
      const isDir = n.type === 'directory'
      const insert = formatFileRefForClaudeCode(n.path, workdir, isDir) + ' '
      // Compute relative display label
      const normWd = workdir.replace(/\\/g, '/')
      const normPath = n.path.replace(/\\/g, '/')
      const relPath = normPath.toLowerCase().startsWith(normWd.toLowerCase())
        ? normPath.slice(normWd.length).replace(/^\/+/, '') || '.'
        : normPath

      const item: FileAtItem = {
        insert,
        matchKey: relPath.toLowerCase(),
        label: relPath,
        isDirectory: isDir
      }
      if (isDir) {
        dirs.push(item)
        if (n.children) walk(n.children)
      } else {
        files.push(item)
      }
    }
  }

  walk(nodes)
  return [...dirs, ...files]
}

export function getAtCompletionAt(
  text: string,
  cursor: number
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, cursor)
  const m = before.match(/@(\S*)$/)
  if (!m) return null

  const atPos = cursor - m[0].length
  if (atPos > 0 && !/\s/.test(text[atPos - 1])) return null

  return { start: atPos, end: cursor, query: (m[1] ?? '').toLowerCase() }
}

export function filterAtCommands(items: FileAtItem[], query: string): FileAtItem[] {
  const q = query.trim()
  if (!q) {
    const out = items.slice(0, 50)
    return out
  }

  const ranked = items
    .map((item) => {
      const mk = item.matchKey
      let rank = -1
      if (mk === q) rank = 300
      else if (mk.startsWith(q)) rank = 200
      else if (mk.includes(q)) rank = 100
      if (rank < 0) return null
      return { item, rank }
    })
    .filter(Boolean) as { item: FileAtItem; rank: number }[]

  ranked.sort((a, b) => b.rank - a.rank || a.item.matchKey.localeCompare(b.item.matchKey))
  return ranked.slice(0, 50).map((r) => r.item)
}
