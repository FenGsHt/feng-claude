import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { app } from 'electron'

/** 与 PTY 中 `CLAUDE_CONFIG_DIR` 一致：隔离的 Claude Code 配置与会话数据根目录 */
export function claudeSessionConfigDir(): string {
  return join(app.getPath('userData'), 'claude-session')
}

/** marketplace.json 的 name；与 `enabledPlugins` 中 `@` 右侧一致 */
const HUD_MARKETPLACE_KEY = 'claude-hud'
const HUD_PLUGIN_ENABLE_KEY = 'claude-hud@claude-hud'

const HUD_MARKETPLACE_SOURCE = {
  source: {
    source: 'github' as const,
    repo: 'jarrodwatts/claude-hud' as const
  }
}

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>
  extraKnownMarketplaces?: Record<string, unknown>
  statusLine?: { type?: string; command?: string }
  [key: string]: unknown
}

/** 进程内缓存，避免 setInterval / 多次会话反复 execSync(where|which) 卡住主线程 */
let nodeExeResolved: string | null | undefined

function resolveNodePath(): string | null {
  if (nodeExeResolved !== undefined) return nodeExeResolved
  try {
    const cmd = process.platform === 'win32' ? 'where.exe node' : 'which node'
    const out = execSync(cmd, { encoding: 'utf-8', windowsHide: true, timeout: 3000 }).trim()
    const first = out.split(/\r?\n/)[0]?.trim()
    if (!first) {
      nodeExeResolved = null
      return null
    }
    nodeExeResolved = existsSync(first) ? first : null
    return nodeExeResolved
  } catch {
    nodeExeResolved = null
    return null
  }
}

function parseSemverPrefix(name: string): [number, number, number] | null {
  const m = name.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const d = a[i]! - b[i]!
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** `plugins/cache/<任意>/claude-hud/<x.y.z>/dist/index.js` 中取最新语义版本目录 */
function findLatestClaudeHudPluginRoot(configDir: string): string | null {
  const cache = join(configDir, 'plugins', 'cache')
  if (!existsSync(cache)) return null
  let best: { v: [number, number, number]; root: string } | null = null
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const hudParent = join(cache, entry.name, 'claude-hud')
    if (!existsSync(hudParent)) continue
    for (const ver of readdirSync(hudParent, { withFileTypes: true })) {
      if (!ver.isDirectory()) continue
      const semver = parseSemverPrefix(ver.name)
      if (!semver) continue
      const root = join(hudParent, ver.name)
      if (!existsSync(join(root, 'dist', 'index.js'))) continue
      if (!best || cmpSemver(semver, best.v) > 0) best = { v: semver, root }
    }
  }
  return best?.root ?? null
}

/** 与 claude-hud `/claude-hud:setup` 等价：用 node 执行插件 dist（需已安装到 plugins/cache） */
function buildHudStatusLineCommand(nodeExe: string, jsPath: string): string {
  if (process.platform === 'win32') {
    const n = nodeExe.replace(/'/g, "''")
    const j = jsPath.replace(/'/g, "''")
    return `powershell -NoProfile -Command "$env:COLUMNS=[Math]::Max(1,[Console]::WindowWidth-4); & '${n}' '${j}'"`
  }
  return `export COLUMNS=120; exec ${JSON.stringify(nodeExe)} ${JSON.stringify(jsPath)}`
}

/**
 * 若尚未配置 statusLine，且已存在 claude-hud 安装与 node，则写入 statusLine（HUD 依赖此项才会渲染）。
 * [2026-04-24] 原先仅 enabledPlugins，未写 statusLine，故界面无 HUD。
 */
function tryMergeHudStatusLine(base: SettingsJson, configDir: string): boolean {
  const sl = base.statusLine
  if (sl && typeof sl === 'object' && typeof sl.command === 'string' && sl.command.trim().length > 0) {
    return false
  }

  const pluginRoot = findLatestClaudeHudPluginRoot(configDir)
  const node = resolveNodePath()
  if (!pluginRoot) {
    console.log(
      '[claude-gui] claude-hud 尚未安装到 plugins/cache；终端内先 `/plugin marketplace add jarrodwatts/claude-hud`（若未识别市场），再 `/plugin install claude-hud@claude-hud`，将自动写入 statusLine'
    )
    return false
  }
  if (!node) {
    console.warn('[claude-gui] 未在 PATH 找到 node.exe，无法自动配置 claude-hud statusLine（Windows 请安装 Node LTS 并重启）')
    return false
  }

  const jsPath = join(pluginRoot, 'dist', 'index.js')
  base.statusLine = {
    type: 'command',
    command: buildHudStatusLineCommand(node, jsPath)
  }
  console.log('[claude-gui] 已自动写入 claude-hud statusLine →', jsPath)
  return true
}

/**
 * 在隔离配置目录写入/合并 settings.json：
 * - 默认 marketplace + 启用 claude-hud（键缺失时）
 * - 插件与 node 就绪时补写 statusLine（否则仅 marketplace/enable，仍须安装插件）
 */
export function ensureClaudeHudPluginDefaults(): void {
  const root = claudeSessionConfigDir()
  try {
    mkdirSync(root, { recursive: true })
  } catch {
    return
  }

  const path = join(root, 'settings.json')
  let base: SettingsJson = {}
  if (existsSync(path)) {
    try {
      base = JSON.parse(readFileSync(path, 'utf-8')) as SettingsJson
      if (base === null || typeof base !== 'object' || Array.isArray(base)) base = {}
    } catch {
      console.warn('[claude-gui] settings.json 解析失败，跳过 claude-hud 默认合并:', path)
      return
    }
  }

  let changed = false

  const mk = (base.extraKnownMarketplaces ?? {}) as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(mk, HUD_MARKETPLACE_KEY)) {
    mk[HUD_MARKETPLACE_KEY] = { ...HUD_MARKETPLACE_SOURCE }
    base.extraKnownMarketplaces = mk
    changed = true
  }

  const ep = (base.enabledPlugins ?? {}) as Record<string, boolean>
  if (!Object.prototype.hasOwnProperty.call(ep, HUD_PLUGIN_ENABLE_KEY)) {
    base.enabledPlugins = { ...ep, [HUD_PLUGIN_ENABLE_KEY]: true }
    changed = true
  }

  if (tryMergeHudStatusLine(base, root)) changed = true

  if (!changed) return

  try {
    writeFileSync(path, `${JSON.stringify(base, null, 2)}\n`, 'utf-8')
    console.log('[claude-gui] 已更新 Claude 会话配置 →', path)
  } catch (e) {
    console.warn('[claude-gui] 写入 settings.json 失败:', e)
  }
}
