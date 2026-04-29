import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { claudeSessionConfigDir } from './claudeSessionConfigDir'
import type { McpEntry, McpServerConfig, McpServerType } from '../renderer/src/types/ipc'

export type { McpEntry, McpServerConfig }

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

const CLAUDE_JSON_FILE = '.claude.json'
const SETTINGS_JSON_FILE = 'settings.json'

/** [2026-04-29] 从旧的 settings.json 迁移 MCP 配置到 .claude.json */
let migrated = false
function migrateMcpFromSettingsJson(): void {
  if (migrated) return
  migrated = true
  try {
    const settingsPath = join(claudeSessionConfigDir(), SETTINGS_JSON_FILE)
    const claudeJsonPath = join(claudeSessionConfigDir(), CLAUDE_JSON_FILE)
    // 只在 .claude.json 不存在或没有 mcpServers 时才迁移
    const claudeData = readClaudeJson()
    if (claudeData.mcpServers && Object.keys(claudeData.mcpServers).length > 0) return
    if (!existsSync(settingsPath)) return
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    const oldMcpServers = settings.mcpServers as Record<string, ClaudeJsonMcpServerConfig> | undefined
    if (!oldMcpServers || Object.keys(oldMcpServers).length === 0) return
    const oldDisabled = (settings.disabledMcpServers as string[]) ?? []
    // 转换格式：transport: "streamable-http" → type: "http"
    const newMcpServers: Record<string, ClaudeJsonMcpServerConfig> = {}
    for (const [name, cfg] of Object.entries(oldMcpServers)) {
      const guiType = (cfg.transport ?? cfg.type ?? 'stdio') as string
      newMcpServers[name] = {
        type: guiType === 'streamable-http' ? 'http' : guiType,
        command: cfg.command,
        args: cfg.args,
        url: cfg.url,
        env: cfg.env
      }
    }
    const newData: ClaudeJson = {
      mcpServers: newMcpServers,
      disabledMcpServers: oldDisabled
    }
    writeClaudeJson(newData)
    console.log(`[MCP] migrated ${Object.keys(newMcpServers).length} MCP servers from settings.json to .claude.json`)
  } catch (e) {
    console.warn('[MCP] migration from settings.json failed:', e)
  }
}

function readClaudeJson(): ClaudeJson {
  try {
    const p = join(claudeSessionConfigDir(), CLAUDE_JSON_FILE)
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

function writeClaudeJson(data: ClaudeJson): void {
  const dir = claudeSessionConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, CLAUDE_JSON_FILE), `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
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
  const data = readClaudeJson()
  // user scope MCP（顶层 mcpServers）
  const servers = data.mcpServers ?? {}
  const disabled = new Set<string>(data.disabledMcpServers ?? [])
  return Object.entries(servers).map(([name, cfg]) => toMcpEntry(name, cfg, disabled))
}

export function addMcpServer(name: string, cfg: McpServerConfig): void {
  const data = readClaudeJson()
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
  writeClaudeJson(data)
}

export function removeMcpServer(name: string): void {
  const data = readClaudeJson()
  const servers = { ...(data.mcpServers ?? {}) }
  delete servers[name]
  data.mcpServers = servers
  // 从禁用列表移除
  if (data.disabledMcpServers) {
    data.disabledMcpServers = data.disabledMcpServers.filter(n => n !== name)
  }
  writeClaudeJson(data)
}

export function setMcpServerEnabled(name: string, enabled: boolean): void {
  const data = readClaudeJson()
  const disabled = new Set<string>(data.disabledMcpServers ?? [])
  if (enabled) {
    disabled.delete(name)
  } else {
    disabled.add(name)
  }
  data.disabledMcpServers = [...disabled]
  writeClaudeJson(data)
}

export function updateMcpServer(name: string, cfg: McpServerConfig): void {
  const data = readClaudeJson()
  const servers = { ...(data.mcpServers ?? {}) }
  servers[name] = {
    type: toCliType(cfg.type ?? cfg.transport ?? 'stdio'),
    command: cfg.command,
    args: cfg.args,
    url: cfg.url,
    env: cfg.env
  }
  data.mcpServers = servers
  writeClaudeJson(data)
}
