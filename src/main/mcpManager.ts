import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { claudeSessionConfigDir } from './claudeSessionConfigDir'
import type { McpEntry, McpServerConfig, McpServerType } from '../renderer/src/types/ipc'

export type { McpEntry, McpServerConfig }

// ── 文件放置规则 / File placement rules ──────────────────────────────────────
//
// Zone 1  getConfigDir()
//   Win packaged : %LOCALAPPDATA%\feng-claude\
//   Dev / others : app.getPath('userData')
//   用途: 应用持久数据 — claude-settings.json, history.json, token-data.json,
//         scrollback/<id>.bin, kv/<key>.json
//
// Zone 2  app.getPath('userData')
//   用途: 运行时复制/下载的文件 — browser-mcp-server.js, visual-agent-mcp-server.js,
//         browser-state.json, browser-history.json, officecli-* binary
//   注: 打包 Windows 下与 Zone 1 路径不同，不保证跨升级留存
//
// Zone 3  ~/.claude/   ← Claude Code CLI 领地，本文件只写这里
//   用途: CLI 读取的配置 — .claude.json (MCP 注册), settings.json (权限/hooks),
//         channels/<stateDirId>/ (Telegram bot.pid 等),
//         channels/_feng_nonchannel_<sessionId>/ (隔离非 Telegram 会话)
//   规则: 只通过 mcpJsonPath() / telegramStateDir() 构造路径，禁止手动拼接
//
// Zone 4  <workdir>/.claude/
//   用途: 项目级数据 — browser-routines/*.json
//   规则: 只通过 routinesDir(workdir) 构造路径
//
// 禁止: 直接使用 __dirname / process.cwd() / 硬编码 AppData 路径
// ─────────────────────────────────────────────────────────────────────────────

// ── .claude.json helpers ──────────────────────────────────────────────────────
// [2026-04-29] MCP 配置应写入 .claude.json（CLI 读取位置），而非 settings.json

/** Claude Code CLI 存储的 MCP 配置格式（顶层 mcpServers = user scope） */
type ClaudeJsonMcpServerConfig = {
  type?: 'stdio' | 'sse' | 'http'  // CLI 用 "http" 表示 streamable-http
  transport?: 'stdio' | 'sse' | 'http'  // 兼容旧格式
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

type ClaudeJson = {
  mcpServers?: Record<string, ClaudeJsonMcpServerConfig>
  disabledMcpServers?: string[]  // user scope 禁用列表
  projects?: Record<string, {
    mcpServers?: Record<string, ClaudeJsonMcpServerConfig>
    disabledMcpServers?: string[]
  }>
  [key: string]: unknown
}

const SETTINGS_JSON_FILE = 'settings.json'

function mcpJsonPath(): string {
  // Claude Code CLI 读取用户级 MCP 配置的实际路径：~/.claude/.claude.json
  return join(homedir(), '.claude', '.claude.json')
}

let migrated = false
function migrateMcpFromSettingsJson(): void {
  if (migrated) return
  migrated = true
  try {
    // 1. 从历史错误路径迁移：只补充目标文件中不存在的条目（不覆盖已有配置）
    const wrongPaths = [
      join(homedir(), '.claude', '.mcp.json'),  // 最初写错的路径
      join(homedir(), '.claude.json'),            // 第二次写错的路径
    ]
    for (const wrongPath of wrongPaths) {
      if (!existsSync(wrongPath)) continue
      try {
        const wrong = JSON.parse(readFileSync(wrongPath, 'utf-8')) as ClaudeJson
        if (!wrong.mcpServers || Object.keys(wrong.mcpServers).length === 0) continue
        const data = readMcpJson()
        const current = data.mcpServers ?? {}
        let mergedCount = 0
        for (const [name, cfg] of Object.entries(wrong.mcpServers)) {
          if (!current[name]) { current[name] = cfg; mergedCount++ }
        }
        if (mergedCount > 0) {
          data.mcpServers = current
          writeMcpJson(data)
          console.log(`[MCP] recovered ${mergedCount} MCP servers from ${wrongPath} → ~/.claude/.claude.json`)
        }
      } catch { /* ignore */ }
    }

    const mcpData = readMcpJson()
    if (mcpData.mcpServers && Object.keys(mcpData.mcpServers).length > 0) return

    // 2. 从旧的 settings.json 迁移
    const settingsPath = join(claudeSessionConfigDir(), SETTINGS_JSON_FILE)
    if (!existsSync(settingsPath)) return
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    const oldMcpServers = settings.mcpServers as Record<string, ClaudeJsonMcpServerConfig> | undefined
    if (!oldMcpServers || Object.keys(oldMcpServers).length === 0) return
    const oldDisabled = (settings.disabledMcpServers as string[]) ?? []
    const newMcpServers: Record<string, ClaudeJsonMcpServerConfig> = {}
    for (const [name, cfg] of Object.entries(oldMcpServers)) {
      const guiType = (cfg.transport ?? cfg.type ?? 'stdio') as string
      newMcpServers[name] = {
        type: (guiType === 'streamable-http' ? 'http' : guiType) as 'stdio' | 'sse' | 'http',
        command: cfg.command,
        args: cfg.args,
        url: cfg.url,
        env: cfg.env
      }
    }
    const data = readMcpJson()
    data.mcpServers = { ...(data.mcpServers ?? {}), ...newMcpServers }
    if (oldDisabled.length) data.disabledMcpServers = [...new Set([...(data.disabledMcpServers ?? []), ...oldDisabled])]
    writeMcpJson(data)
    console.log(`[MCP] migrated ${Object.keys(newMcpServers).length} MCP servers from settings.json → ~/.claude.json`)
  } catch (e) {
    console.warn('[MCP] migration failed:', e)
  }
}

function readMcpJson(): ClaudeJson {
  try {
    const p = mcpJsonPath()
    if (!existsSync(p)) return {}
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as ClaudeJson
    }
    return {}
  } catch {
    return {}
  }
}

function writeMcpJson(data: ClaudeJson): void {
  const p = mcpJsonPath()
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

/** 将 GUI 的 McpServerType 转换为 CLI 的 type 字段值 */
function toCliType(guiType: McpServerType): 'stdio' | 'sse' | 'http' {
  // CLI 用 "http" 表示 streamable-http
  return guiType === 'streamable-http' ? 'http' : guiType
}

/** 从 CLI 格式转换为 GUI 的 McpEntry */
function toMcpEntry(name: string, cfg: ClaudeJsonMcpServerConfig, disabledSet: Set<string>): McpEntry {
  const rawType = cfg.type ?? cfg.transport ?? 'stdio'
  // CLI 的 "http" 对应 GUI 的 "streamable-http"
  const guiType: McpServerType = rawType === 'http' ? 'streamable-http' : rawType
  return {
    name,
    type: guiType,
    command: cfg.command,
    args: cfg.args,
    url: cfg.url,
    env: cfg.env,
    isEnabled: !disabledSet.has(name)
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export function listMcpServers(): McpEntry[] {
  migrateMcpFromSettingsJson()
  const data = readMcpJson()
  // user scope MCP（顶层 mcpServers）
  const servers = data.mcpServers ?? {}
  const disabled = new Set<string>(data.disabledMcpServers ?? [])
  return Object.entries(servers).map(([name, cfg]) => toMcpEntry(name, cfg, disabled))
}

export function addMcpServer(name: string, cfg: McpServerConfig): void {
  const data = readMcpJson()
  const servers = { ...(data.mcpServers ?? {}) }
  // 写入 CLI 格式（type: "http" 而非 transport: "streamable-http"）
  servers[name] = {
    type: toCliType(cfg.type ?? cfg.transport ?? 'stdio'),
    command: cfg.command,
    args: cfg.args,
    url: cfg.url,
    env: cfg.env
  }
  data.mcpServers = servers
  // 确保不在禁用列表中
  if (data.disabledMcpServers) {
    data.disabledMcpServers = data.disabledMcpServers.filter(n => n !== name)
  }
  writeMcpJson(data)
}

export function removeMcpServer(name: string): void {
  const data = readMcpJson()
  const servers = { ...(data.mcpServers ?? {}) }
  delete servers[name]
  data.mcpServers = servers
  // 从禁用列表移除
  if (data.disabledMcpServers) {
    data.disabledMcpServers = data.disabledMcpServers.filter(n => n !== name)
  }
  writeMcpJson(data)
}

export function setMcpServerEnabled(name: string, enabled: boolean): void {
  const data = readMcpJson()
  const disabled = new Set<string>(data.disabledMcpServers ?? [])
  if (enabled) {
    disabled.delete(name)
  } else {
    disabled.add(name)
  }
  data.disabledMcpServers = [...disabled]
  writeMcpJson(data)
}

export function updateMcpServer(name: string, cfg: McpServerConfig): void {
  const data = readMcpJson()
  const servers = { ...(data.mcpServers ?? {}) }
  servers[name] = {
    type: toCliType(cfg.type ?? cfg.transport ?? 'stdio'),
    command: cfg.command,
    args: cfg.args,
    url: cfg.url,
    env: cfg.env
  }
  data.mcpServers = servers
  writeMcpJson(data)
}

// ── 自动注册/更新浏览器工具 MCP ────────────────────────────────────────
// 始终指向当前运行 App 的脚本路径，确保切换项目后也能识别

let autoRegistered = false

function resolveBrowserToolsScriptPath(): string | null {
  // [2026-05-01] 无论打包/开发，都复制到 userData 目录；
  // 这样其他项目运行 Claude Code 时也能找到 browser-tools。
  const dest = join(app.getPath('userData'), 'browser-mcp-server.js')
  const candidates = [
    join(app.getAppPath(), 'scripts', 'browser-mcp-server.js'),
    join(process.cwd(), 'scripts', 'browser-mcp-server.js'),
    join(__dirname, '..', '..', 'scripts', 'browser-mcp-server.js')
  ]
  const src = candidates.find((p) => existsSync(p))
  if (!src) {
    console.warn('[MCP] browser-tools script not found. Tried:', candidates)
    return null
  }
  try {
    writeFileSync(dest, readFileSync(src), 'utf-8')
  } catch (e) {
    console.warn('[MCP] Failed to copy browser-mcp-server.js:', e)
    return null
  }
  return dest
}

export function ensureBrowserToolsMcpRegistered(): void {
  if (autoRegistered) return

  const scriptPath = resolveBrowserToolsScriptPath()
  if (!scriptPath) return
  autoRegistered = true

  const data = readMcpJson()
  const servers = data.mcpServers ?? {}
  const existing = servers['browser-tools']
  const disabledBefore = data.disabledMcpServers ?? []
  const disabledAfter = disabledBefore.filter((name) => name !== 'browser-tools')

  // 路径匹配且未禁用则跳过
  if (existing && existing.type === 'stdio' && existing.args?.[0] === scriptPath && disabledAfter.length === disabledBefore.length) return

  servers['browser-tools'] = {
    type: 'stdio',
    command: 'node',
    args: [scriptPath]
  }
  data.mcpServers = servers
  data.disabledMcpServers = disabledAfter
  writeMcpJson(data)
  console.log('[MCP]', existing ? 'updated' : 'registered', 'browser-tools →', scriptPath, 'config:', mcpJsonPath())
}

// ── 自动注册 Visual Agent MCP ────────────────────────────────────────
// [2026-05-01] 视觉代理 MCP，提供识图能力

let visualAgentRegistered = false

function resolveVisualAgentScriptPath(): string | null {
  const dest = join(app.getPath('userData'), 'visual-agent-mcp-server.js')
  const candidates = [
    join(app.getAppPath(), 'scripts', 'visual-agent-mcp-server.js'),
    join(process.cwd(), 'scripts', 'visual-agent-mcp-server.js'),
    join(__dirname, '..', '..', 'scripts', 'visual-agent-mcp-server.js')
  ]
  const src = candidates.find((p) => existsSync(p))
  if (!src) {
    console.warn('[MCP] visual-agent script not found. Tried:', candidates)
    return null
  }
  try {
    // Always overwrite to keep script up-to-date
    writeFileSync(dest, readFileSync(src), 'utf-8')
  } catch (e) {
    console.warn('[MCP] Failed to copy visual-agent-mcp-server.js:', e)
    return null
  }
  return dest
}

export function ensureVisualAgentMcpRegistered(): void {
  if (visualAgentRegistered) return
  visualAgentRegistered = true

  const scriptPath = resolveVisualAgentScriptPath()
  if (!scriptPath) return

  const data = readMcpJson()
  const servers = data.mcpServers ?? {}
  const existing = servers['visual-agent']
  const disabledBefore = data.disabledMcpServers ?? []
  const disabledAfter = disabledBefore.filter((name) => name !== 'visual-agent')

  // 路径匹配且未禁用则跳过
  if (existing && existing.type === 'stdio' && existing.args?.[0] === scriptPath && disabledAfter.length === disabledBefore.length) return

  servers['visual-agent'] = {
    type: 'stdio',
    command: 'node',
    args: [scriptPath]
  }
  data.mcpServers = servers
  data.disabledMcpServers = disabledAfter
  writeMcpJson(data)
  console.log('[MCP]', existing ? 'updated' : 'registered', 'visual-agent →', scriptPath, 'config:', mcpJsonPath())
}
