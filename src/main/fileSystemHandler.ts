import { readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import type { FileTreeNode } from '../renderer/src/types/fs'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  'dist',
  'out',
  'build',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage'
])

export class FileSystemHandler {
  readTree(dirPath: string, maxDepth = 3): FileTreeNode[] {
    return this._readDir(dirPath, 0, maxDepth)
  }

  private _readDir(dirPath: string, depth: number, maxDepth: number): FileTreeNode[] {
    if (depth >= maxDepth) return []

    let entries: string[]
    try {
      entries = readdirSync(dirPath)
    } catch {
      return []
    }

    const nodes: FileTreeNode[] = []

    for (const name of entries) {
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
        nodes.push({
          name,
          path: fullPath,
          type: 'directory',
          children: this._readDir(fullPath, depth + 1, maxDepth)
        })
      } else {
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
