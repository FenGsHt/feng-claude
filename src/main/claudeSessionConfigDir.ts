import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  cpSync,
  renameSync
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { app } from 'electron'
import { getConfigDir } from './configDir'

/**
 * Claude Code 配置目录：用户全局 ~/.claude。
 * [2026-04-29] 原先使用隔离目录导致 Claude 读不到全局技能/MCP/OAuth；
 * 改为指向 ~/.claude，应用设置仍通过 electron-store 独立管理。
 */
export function claudeSessionConfigDir(): string {
  return join(homedir(), '.claude')
}

/** 一次性迁移：旧隔离目录（data/claude-session 或 userData/claude-session）→ ~/.claude */
export function migrateLegacyClaudeSessionDirOnce(): void {
  const to = join(homedir(), '.claude')

  // 源 1：旧版 userData/claude-session（AppData/Roaming）
  const fromRoaming = join(app.getPath('userData'), 'claude-session')
  // 源 2：打包版隔离目录（LocalAppData/feng-claude/claude-session）
  const fromLocal = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'feng-claude', 'claude-session')

  for (const from of [fromLocal, fromRoaming]) {
    if (from === to || !existsSync(from)) continue
    try {
      // 逐个子目录/文件合并复制（不覆盖已存在的）
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        const srcPath = join(from, entry.name)
        const dstPath = join(to, entry.name)
        if (existsSync(dstPath)) continue  // 目标已存在，跳过
        if (entry.isDirectory()) {
          cpSync(srcPath, dstPath, { recursive: true })
        } else {
          mkdirSync(to, { recursive: true })
          cpSync(srcPath, dstPath)
        }
      }
      console.log('[claude-gui] 已迁移旧隔离目录:', from, '→', to)
    } catch (e) {
      console.warn('[claude-gui] 迁移旧隔离目录失败:', from, e)
    }
  }
}


/** marketplace.json 的 name；与 `enabledPlugins` 中 `@` 右侧一致 */
export const HUD_MARKETPLACE_KEY = 'claude-hud'
export const HUD_PLUGIN_ENABLE_KEY = 'claude-hud@claude-hud'

/** [2026-05-01] 用户手动禁用的插件 ID 列表，存在 Feng Claude 本地目录，不受 Claude Code 覆盖 */
const DISABLED_PLUGINS_FILE = join(getConfigDir(), 'disabled-plugins.json')

function readDisabledPlugins(): string[] {
  try {
    if (!existsSync(DISABLED_PLUGINS_FILE)) return []
    const raw = JSON.parse(readFileSync(DISABLED_PLUGINS_FILE, 'utf-8')) as string[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeDisabledPlugins(ids: string[]): void {
  try {
    mkdirSync(getConfigDir(), { recursive: true })
    writeFileSync(DISABLED_PLUGINS_FILE, `${JSON.stringify(ids, null, 2)}\n`, 'utf-8')
  } catch { /* ignore */ }
}

/** 将插件 ID 加入用户禁用列表 */
export function addUserDisabledPlugin(id: string): void {
  const ids = readDisabledPlugins()
  if (ids.includes(id)) return
  ids.push(id)
  writeDisabledPlugins(ids)
}

/** 从用户禁用列表移除插件 ID */
export function removeUserDisabledPlugin(id: string): void {
  const ids = readDisabledPlugins().filter(x => x !== id)
  writeDisabledPlugins(ids)
}

/** 检查插件是否被用户手动禁用 */
export function isUserDisabledPlugin(id: string): boolean {
  return readDisabledPlugins().includes(id)
}

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

/**
 * [2026-07-01] 剥离 ~/.claude/settings.json 中冲突的 ANTHROPIC_* env 键。
 *
 * 背景：不少第三方中转教程会让用户把 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN /
 * ANTHROPIC_API_KEY 写进 Claude CLI 的 settings.json 的 `env` 块。CLI 启动时该 `env`
 * 块优先级高于继承来的进程环境变量，会盖掉本 GUI 为每个 PTY 会话注入的 baseUrl/token
 * （见 ptyManager.ts buildPtyEnv）。结果：用户在软件里换了配置也「改不动」，请求仍打到
 * 旧地址报错。这里在启动同步时把这些键剥掉，让 GUI 注入的配置成为唯一真相源。
 *
 * 仅删除我们接管的三个 ANTHROPIC_* 键，保留 env 里其它自定义变量；剥离前备份原文件。
 */
export function stripConflictingAnthropicEnv(): void {
  const path = join(claudeSessionConfigDir(), 'settings.json')
  if (!existsSync(path)) return

  let base: SettingsJson
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    base = parsed as SettingsJson
  } catch {
    // 交由 ensureClaudeHudPluginDefaults 的损坏处理路径备份重建，这里不重复处理
    return
  }

  const env = base.env
  if (!env || typeof env !== 'object' || Array.isArray(env)) return

  const CONFLICT_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']
  const envRecord = env as Record<string, unknown>
  const removed = CONFLICT_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(envRecord, k))
  if (removed.length === 0) return

  // 剥离前备份原文件，可回溯
  try {
    const bak = `${path}.env-backup.${Date.now()}.bak`
    writeFileSync(bak, readFileSync(path, 'utf-8'), 'utf-8')
    console.log('[claude-gui] 剥离冲突 env 前已备份 settings.json →', bak)
  } catch (e) {
    console.warn('[claude-gui] 备份 settings.json 失败（继续剥离）:', e)
  }

  for (const k of removed) delete envRecord[k]
  // env 若被清空则整块删除，保持文件干净
  if (Object.keys(envRecord).length === 0) {
    delete base.env
  }

  try {
    writeFileSync(path, `${JSON.stringify(base, null, 2)}\n`, 'utf-8')
    console.log('[claude-gui] 已剥离 settings.json 中冲突的 env 键:', removed.join(', '))
  } catch (e) {
    console.warn('[claude-gui] 剥离冲突 env 写入失败:', e)
  }
}
