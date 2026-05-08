import { readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import type { FileTreeNode } from '../renderer/src/types/fs'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'dist-build-tmp',
  'out',
  'build',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo',
  '.idea',
  '.vscode',
  'target',
  '.gradle',
  '.parcel-cache',
  '.next',
  '.nuxt',
  'coverage'
])

const MAX_TREE_NODES = 2500

export class FileSystemHandler {
  readTree(dirPath: string, maxDepth = 3): FileTreeNode[] {
    /* [2026-05-08] 原同步递归无上限，大目录会卡住 Electron 主进程；加节点预算保护。 */
    const budget = { remaining: MAX_TREE_NODES }
    return this._readDir(dirPath, 0, maxDepth, budget)
  }

  private _readDir(
    dirPath: string,
    depth: number,
    maxDepth: number,
    budget: { remaining: number }
  ): FileTreeNode[] {
    if (depth >= maxDepth || budget.remaining <= 0) return []

    let entries: string[]
    try {
      entries = readdirSync(dirPath)
    } catch {
      return []
    }

    const nodes: FileTreeNode[] = []

    for (const name of entries) {
      if (budget.remaining <= 0) break
      if (name.startsWith('.') && depth === 0) continue
      if (IGNORE_DIRS.has(name)) continue

      const fullPath = join(dirPath, name)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        budget.remaining -= 1
        nodes.push({
          name,
          path: fullPath,
          type: 'directory',
          children: this._readDir(fullPath, depth + 1, maxDepth, budget)
        })
      } else {
        budget.remaining -= 1
        nodes.push({ name, path: fullPath, type: 'file' })
      }
    }

    // Directories first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
}
