import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  renameSync,
  cpSync,
  rmSync
} from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { app } from 'electron'
import { getConfigDir } from './configDir'

/**
 * 与 PTY 中 `CLAUDE_CONFIG_DIR` 一致：隔离的 Claude Code 配置与会话数据根目录。
 * [2026-04-30] 原先固定 userData/claude-session；打包版 electron-store 在 exe 旁 data/，Claude 目录若仍在 Roaming 会导致写入的 settings.json 与 PTY 使用的路径不一致，skipDangerousModePermissionPrompt 不生效。
 */
export function claudeSessionConfigDir(): string {
  return join(getConfigDir(), 'claude-session')
}

/** 旧版路径（仅用于一次性迁移） */
function legacyClaudeSessionDir(): string {
  return join(app.getPath('userData'), 'claude-session')
}

/**
 * 将旧版 `AppData/.../claude-session` 迁到与应用 settings 相同的 `getConfigDir()/claude-session`（打包版即 exe 旁 data/claude-session）。
 */
export function migrateLegacyClaudeSessionDirOnce(): void {
  const from = legacyClaudeSessionDir()
  const to = claudeSessionConfigDir()
  if (from === to) return
  if (!existsSync(from)) return
  if (existsSync(to)) {
    // 新旧目录并存时：仅尝试把旧 settings.json 里的 skip 合并进新路径（整目录不搬）
    try {
      const spOld = join(from, 'settings.json')
      const spNew = join(to, 'settings.json')
      if (existsSync(spOld) && existsSync(spNew)) {
        const o = JSON.parse(readFileSync(spOld, 'utf-8')) as Record<string, unknown>
        if (o.skipDangerousModePermissionPrompt === true) {
          const n = JSON.parse(readFileSync(spNew, 'utf-8')) as Record<string, unknown>
          if (n.skipDangerousModePermissionPrompt !== true) {
            n.skipDangerousModePermissionPrompt = true
            writeFileSync(spNew, `${JSON.stringify(n, null, 2)}\n`)
            console.log('[claude-gui] 已从旧路径合并 skipDangerousModePermissionPrompt →', spNew)
          }
        }
      }
    } catch {
      /* ignore */
    }
    console.log('[claude-gui] claude-session 新路径已存在，跳过整目录迁移:', to)
    return
  }
  try {
    mkdirSync(getConfigDir(), { recursive: true })
    renameSync(from, to)
    console.log('[claude-gui] 已迁移 claude-session:', from, '→', to)
  } catch (e) {
    console.warn('[claude-gui] rename 迁移失败，尝试复制:', e)
    try {
      mkdirSync(getConfigDir(), { recursive: true })
      cpSync(from, to, { recursive: true })
      rmSync(from, { recursive: true, force: true })
      console.log('[claude-gui] 已复制迁移 claude-session:', from, '→', to)
    } catch (e2) {
      console.warn('[claude-gui] claude-session 迁移失败（可手动合并目录）:', e2)
    }
  }
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

/** [2026-04-23] settings.json 损坏时先改名备份，避免解析失败后整段 return、HUD/沙箱默认值永远写不进去 */
function backupCorruptSettingsJson(settingsPath: string): void {
  if (!existsSync(settingsPath)) return
  try {
    const bak = `${settingsPath}.corrupt.${Date.now()}.bak`
    renameSync(settingsPath, bak)
    console.warn('[claude-gui] 已备份损坏的 settings.json →', bak)
  } catch (e) {
    console.warn('[claude-gui] 无法备份 settings.json:', e)
  }
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
      /* [2026-04-23] 原直接 return；损坏文件无法自愈 marketplace/HUD/sandbox */
      console.warn('[claude-gui] settings.json 解析失败，备份后重新合并默认项:', path)
      backupCorruptSettingsJson(path)
      base = {}
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

  // 禁用沙箱强制要求：Windows 上 sandbox 不可用，failIfUnavailable=true 会导致每次启动 claude 时崩溃
  const sandbox = (base.sandbox ?? {}) as Record<string, unknown>
  if (sandbox.failIfUnavailable !== false) {
    base.sandbox = { ...sandbox, failIfUnavailable: false }
    changed = true
  }

  // [2026-04-29] 原先在此删除 skipDangerousModePermissionPrompt；改由用户在软件「设置」中开关并由 mergeSkipDangerousPromptFromApp 写入

  if (tryMergeHudStatusLine(base, root)) changed = true

  if (!changed) return

  try {
    writeFileSync(path, `${JSON.stringify(base, null, 2)}\n`, 'utf-8')
    console.log('[claude-gui] 已更新 Claude 会话配置 →', path)
  } catch (e) {
    console.warn('[claude-gui] 写入 settings.json 失败:', e)
  }
}

/**
 * 将应用设置同步到隔离 Claude 目录下的 settings.json，供 Claude Code 读取（官方字段 skipDangerousModePermissionPrompt）。
 * [2026-04-29] 用户在本软件设置中勾选后不再每次出现 bypass 模式确认框。
 */
export function mergeSkipDangerousPromptFromApp(skip: boolean): void {
  const root = claudeSessionConfigDir()
  try {
    mkdirSync(root, { recursive: true })
  } catch {
    return
  }

  const path = join(root, 'settings.json')
  let base: Record<string, unknown> = {}
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>
      }
    } catch {
      /* [2026-04-23] 原 return 导致应用侧开关无法写入 skipDangerousModePermissionPrompt */
      console.warn('[claude-gui] mergeSkipDangerousPrompt: 无法解析，备份后仅合并 skip 标志:', path)
      backupCorruptSettingsJson(path)
      base = {}
    }
  }

  const prev = base.skipDangerousModePermissionPrompt
  if (skip) {
    if (prev === true) return
    base.skipDangerousModePermissionPrompt = true
  } else {
    if (prev === undefined && !Object.prototype.hasOwnProperty.call(base, 'skipDangerousModePermissionPrompt')) {
      return
    }
    delete base.skipDangerousModePermissionPrompt
  }

  try {
    writeFileSync(path, `${JSON.stringify(base, null, 2)}\n`, 'utf-8')
    console.log('[claude-gui] 已同步 skipDangerousModePermissionPrompt =', skip, '→', path)
  } catch (e) {
    console.warn('[claude-gui] mergeSkipDangerousPrompt 写入失败:', e)
  }
}
