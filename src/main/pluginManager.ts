import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { claudeSessionConfigDir } from './claudeSessionConfigDir'
import type { PluginEntry } from '../renderer/src/types/ipc'

export type { PluginEntry }

function claudePluginsDir(): string {
  return join(homedir(), '.claude', 'plugins')
}

function readInstallCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  try {
    const path = join(claudePluginsDir(), 'install-counts-cache.json')
    if (!existsSync(path)) return counts
    const data = JSON.parse(readFileSync(path, 'utf-8')) as { counts?: { plugin: string; unique_installs: number }[] }
    for (const entry of data.counts ?? []) {
      counts.set(entry.plugin, entry.unique_installs)
    }
  } catch { /* ignore */ }
  return counts
}

function readSessionSettings(): Record<string, unknown> {
  try {
    const path = join(claudeSessionConfigDir(), 'settings.json')
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeSessionSettings(settings: Record<string, unknown>): void {
  const dir = claudeSessionConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

function extractDescription(readmePath: string): string {
  try {
    const lines = readFileSync(readmePath, 'utf-8').split('\n')
    let i = 0
    while (i < lines.length && lines[i].startsWith('#')) i++
    while (i < lines.length && lines[i].trim() === '') i++
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
      para.push(lines[i].trim())
      i++
    }
    return para.join(' ').slice(0, 200)
  } catch {
    return ''
  }
}

function isPluginInstalled(pluginName: string): boolean {
  const cacheDir = join(claudeSessionConfigDir(), 'plugins', 'cache')
  if (!existsSync(cacheDir)) return false
  try {
    for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(cacheDir, entry.name, pluginName))) return true
    }
  } catch { /* ignore */ }
  return false
}

export function listPlugins(): PluginEntry[] {
  const marketplacesDir = join(claudePluginsDir(), 'marketplaces')
  const counts = readInstallCounts()
  const settings = readSessionSettings()
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, boolean>
  const plugins: PluginEntry[] = []

  console.log('[PluginManager] marketplacesDir:', marketplacesDir, 'exists:', existsSync(marketplacesDir))
  if (!existsSync(marketplacesDir)) return plugins

  try {
    for (const mkt of readdirSync(marketplacesDir, { withFileTypes: true })) {
      if (!mkt.isDirectory()) continue
      const pluginsDir = join(marketplacesDir, mkt.name, 'plugins')
      if (!existsSync(pluginsDir)) continue

      for (const plugin of readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!plugin.isDirectory()) continue
        const id = `${plugin.name}@${mkt.name}`
        const description = extractDescription(join(pluginsDir, plugin.name, 'README.md'))

        plugins.push({
          id,
          name: plugin.name,
          marketplace: mkt.name,
          description,
          installCount: counts.get(id) ?? 0,
          isEnabled: enabled[id] === true,
          isInstalled: isPluginInstalled(plugin.name)
        })
      }
    }
  } catch { /* ignore */ }

  return plugins.sort((a, b) => b.installCount - a.installCount)
}

export function setPluginEnabled(id: string, enable: boolean): void {
  const settings = readSessionSettings()
  const ep = { ...((settings.enabledPlugins ?? {}) as Record<string, boolean>) }
  if (enable) {
    ep[id] = true
  } else {
    delete ep[id]
  }
  settings.enabledPlugins = ep
  writeSessionSettings(settings)
}
