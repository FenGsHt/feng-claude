import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { claudeSessionConfigDir } from './claudeSessionConfigDir'
import type { McpEntry, McpServerConfig, McpServerType } from '../renderer/src/types/ipc'

export type { McpEntry, McpServerConfig }

// ── settings.json helpers ────────────────────────────────────────────────────

function readSettings(): Record<string, unknown> {
  try {
    const p = join(claudeSessionConfigDir(), 'settings.json')
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeSettings(s: Record<string, unknown>): void {
  const dir = claudeSessionConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), `${JSON.stringify(s, null, 2)}\n`, 'utf-8')
}

// ── public API ───────────────────────────────────────────────────────────────

export function listMcpServers(): McpEntry[] {
  const settings = readSettings()
  const servers = (settings.mcpServers ?? {}) as Record<string, McpServerConfig>
  const disabled = new Set<string>(
    Array.isArray(settings.disabledMcpServers) ? (settings.disabledMcpServers as string[]) : []
  )
  return Object.entries(servers).map(([name, cfg]) => ({
    name,
    // Claude Code uses "transport" for streamable-http, "type" for stdio/sse
    type: (cfg.transport ?? cfg.type ?? 'stdio') as McpEntry['type'],
    command: cfg.command,
    args: cfg.args,
    url: cfg.url,
    env: cfg.env,
    isEnabled: !disabled.has(name)
  }))
}

export function addMcpServer(name: string, cfg: McpServerConfig): void {
  const settings = readSettings()
  const servers = { ...((settings.mcpServers ?? {}) as Record<string, McpServerConfig>) }
  servers[name] = cfg
  writeSettings({ ...settings, mcpServers: servers })
}

export function removeMcpServer(name: string): void {
  const settings = readSettings()
  const servers = { ...((settings.mcpServers ?? {}) as Record<string, McpServerConfig>) }
  delete servers[name]
  const disabled = (
    Array.isArray(settings.disabledMcpServers) ? [...(settings.disabledMcpServers as string[])] : []
  ).filter((n) => n !== name)
  writeSettings({ ...settings, mcpServers: servers, disabledMcpServers: disabled })
}

export function setMcpServerEnabled(name: string, enabled: boolean): void {
  const settings = readSettings()
  const disabled = new Set<string>(
    Array.isArray(settings.disabledMcpServers) ? (settings.disabledMcpServers as string[]) : []
  )
  if (enabled) disabled.delete(name)
  else disabled.add(name)
  writeSettings({ ...settings, disabledMcpServers: [...disabled] })
}

export function updateMcpServer(name: string, cfg: McpServerConfig): void {
  const settings = readSettings()
  const servers = { ...((settings.mcpServers ?? {}) as Record<string, McpServerConfig>) }
  servers[name] = cfg
  writeSettings({ ...settings, mcpServers: servers })
}
