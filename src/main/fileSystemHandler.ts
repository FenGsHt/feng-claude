import { readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { FileTreeNode } from '../renderer/src/types/fs'

// [2026-06-16] WATCH 忽略集：构建/依赖/缓存等高频变动或巨大目录，避免监听时狂刷新与资源占用
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

// [2026-06-16] 文件树/搜索 显示忽略集：只隐藏体积巨大且几乎不浏览的依赖/版本库目录，
// 其余（build/dist/temp/library 及 dot 文件夹如 .creator/.history）与系统资源管理器保持一致地显示。
// 注：文件树是按需懒加载（展开才读一层），显示这些目录开销很小。
const TREE_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg'
])

const MAX_TREE_NODES = 2500
const MAX_SEARCH_SCAN = 20000   // 搜索时遍历的节点上限
const MAX_SEARCH_HITS = 300     // 返回的匹配结果上限

export interface FileSearchHit {
  name: string
  path: string
  rel: string
  type: 'file' | 'directory'
}

export class FileSystemHandler {
  readTree(dirPath: string, maxDepth = 3): FileTreeNode[] {
    /* [2026-05-08] 原同步递归无上限，大目录会卡住 Electron 主进程；加节点预算保护。 */
    const budget = { remaining: MAX_TREE_NODES }
    return this._readDir(dirPath, 0, maxDepth, budget)
  }

  /* [2026-06-15] 全树递归搜索：解决文件侧栏只能搜到已展开/浅层文件的问题。返回扁平匹配列表。 */
  search(rootPath: string, query: string): FileSearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: FileSearchHit[] = []
    const budget = { scan: MAX_SEARCH_SCAN }
    const rootLen = rootPath.replace(/[\\/]+$/, '').length + 1
    const walk = (dirPath: string, depth: number): void => {
      if (budget.scan <= 0 || hits.length >= MAX_SEARCH_HITS) return
      let entries: string[]
      try {
        entries = readdirSync(dirPath)
      } catch {
        return
      }
      for (const name of entries) {
        if (budget.scan <= 0 || hits.length >= MAX_SEARCH_HITS) break
        // [2026-06-16] 与文件树显示保持一致：只跳过巨大依赖/版本库目录（node_modules/.git 等），其余可搜
        if (TREE_IGNORE_DIRS.has(name)) continue
        budget.scan -= 1
        const fullPath = join(dirPath, name)
        let stat
        try {
          stat = statSync(fullPath)
        } catch {
          continue
        }
        const isDir = stat.isDirectory()
        if (name.toLowerCase().includes(q)) {
          hits.push({ name, path: fullPath, rel: fullPath.slice(rootLen).replace(/\\/g, '/'), type: isDir ? 'directory' : 'file' })
        }
        if (isDir) walk(fullPath, depth + 1)
      }
    }
    walk(rootPath, 0)
    // 文件优先于目录？这里按相对路径深度浅的在前，再按路径字母序
    return hits.sort((a, b) => {
      const da = a.rel.split('/').length, db = b.rel.split('/').length
      if (da !== db) return da - db
      return a.rel.localeCompare(b.rel)
    })
  }

  /* [2026-06-15] 目录监听：文件新增/删除/重命名时通知渲染端自动刷新文件树。 */
  private watcher: FSWatcher | null = null
  private watchRoot = ''
  private watchDebounce: ReturnType<typeof setTimeout> | null = null

  watchStart(rootPath: string, onChange: () => void): void {
    if (this.watchRoot === rootPath && this.watcher) return
    this.watchStop()
    this.watchRoot = rootPath
    const fire = (): void => {
      if (this.watchDebounce) clearTimeout(this.watchDebounce)
      this.watchDebounce = setTimeout(onChange, 350)
    }
    try {
      this.watcher = chokidar.watch(rootPath, {
        ignoreInitial: true,
        depth: 8,
        persistent: true,
        followSymlinks: false,
        ignorePermissionErrors: true,
        ignored: (p: string) => p.split(/[\\/]/).some((seg, i) => IGNORE_DIRS.has(seg) || (seg.startsWith('.') && i > 0 && seg.length > 1)),
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
      })
      // 只关心结构性变化（增删/重命名），内容修改不触发刷新
      this.watcher.on('add', fire).on('unlink', fire).on('addDir', fire).on('unlinkDir', fire)
    } catch {
      this.watcher = null
      this.watchRoot = ''
    }
  }

  watchStop(): void {
    if (this.watchDebounce) { clearTimeout(this.watchDebounce); this.watchDebounce = null }
    if (this.watcher) { void this.watcher.close(); this.watcher = null }
    this.watchRoot = ''
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
      // [2026-06-16] 与资源管理器一致：显示 dot 文件/夹（.creator/.history/.babelrc 等），只隐藏巨大依赖/版本库目录
      if (TREE_IGNORE_DIRS.has(name)) continue

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
