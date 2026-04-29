import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { claudeSessionConfigDir, addUserDisabledPlugin, removeUserDisabledPlugin, HUD_PLUGIN_ENABLE_KEY } from './claudeSessionConfigDir'
import type { PluginEntry } from '../renderer/src/types/ipc'

export interface RefreshResult {
  newPlugins: string[]   // plugin names added in this pull
  error?: string
}

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
    console.log('[PluginManager] settings path:', path, 'exists:', existsSync(path))
    if (!existsSync(path)) return {}
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    console.log('[PluginManager] enabledPlugins:', JSON.stringify(data.enabledPlugins))
    return data
  } catch (e) {
    console.error('[PluginManager] readSessionSettings error:', e)
    return {}
  }
}

function writeSessionSettings(settings: Record<string, unknown>): void {
  const dir = claudeSessionConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

interface MarketplacePlugin {
  name: string
  description: string
  version?: string
  source?: { source?: string; url?: string }
}

interface MarketplaceJson {
  name?: string
  plugins?: MarketplacePlugin[]
}

function readMarketplaceJson(marketplaceDir: string): MarketplaceJson | null {
  try {
    const path = join(marketplaceDir, '.claude-plugin', 'marketplace.json')
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as MarketplaceJson
  } catch { return null }
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

function isPluginInstalled(pluginName: string, enabled?: Record<string, boolean>): boolean {
  // [2026-04-29] If the plugin is enabled in session settings, it is installed
  if (enabled) {
    for (const id of Object.keys(enabled)) {
      const name = id.includes('@') ? id.slice(0, id.lastIndexOf('@')) : id
      if (name === pluginName) return true
    }
  }
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

export function refreshMarketplaces(): RefreshResult {
  const marketplacesDir = join(claudePluginsDir(), 'marketplaces')
  if (!existsSync(marketplacesDir)) return { newPlugins: [], error: '市场目录不存在' }

  const newPlugins: string[] = []

  try {
    for (const mkt of readdirSync(marketplacesDir, { withFileTypes: true })) {
      if (!mkt.isDirectory()) continue
      const mktDir = join(marketplacesDir, mkt.name)
      const gitDir = join(mktDir, '.git')
      if (!existsSync(gitDir)) continue

      // Detect which plugin dirs exist before pull
      const pluginsDir = join(mktDir, 'plugins')
      const before = new Set(
        existsSync(pluginsDir)
          ? readdirSync(pluginsDir, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => e.name)
          : []
      )

      try {
        execSync('git pull --ff-only', {
          cwd: mktDir,
          encoding: 'utf-8',
          windowsHide: true,
          timeout: 30_000
        })
        console.log(`[PluginManager] git pull OK in ${mkt.name}`)
      } catch (e) {
        console.warn(`[PluginManager] git pull failed in ${mkt.name}:`, e)
      }

      // Detect new plugin dirs after pull
      if (existsSync(pluginsDir)) {
        for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
          if (entry.isDirectory() && !before.has(entry.name)) {
            newPlugins.push(entry.name)
          }
        }
      }
    }
  } catch (e) {
    return { newPlugins, error: String(e) }
  }

  return { newPlugins }
}

export function listPlugins(newPluginNames?: Set<string>): PluginEntry[] {
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
      const mktDir = join(marketplacesDir, mkt.name)

      // Check .claude-plugin/marketplace.json first (preferred format)
      const marketplaceJson = readMarketplaceJson(mktDir)
      if (marketplaceJson?.plugins && marketplaceJson.plugins.length > 0) {
        for (const plugin of marketplaceJson.plugins) {
          const id = `${plugin.name}@${mkt.name}`
          plugins.push({
            id,
            name: plugin.name,
            marketplace: mkt.name,
            description: plugin.description || '',
            installCount: counts.get(id) ?? 0,
            isEnabled: enabled[id] === true,
            isInstalled: isPluginInstalled(plugin.name, enabled)
          })
        }
        // marketplace.json exists with plugins - skip plugins/ directory to avoid duplicates
        continue
      }

      // Fall back to plugins/ directory (traditional format) only if marketplace.json doesn't exist or is empty
      const pluginsDir = join(mktDir, 'plugins')
      if (existsSync(pluginsDir)) {
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
            isInstalled: isPluginInstalled(plugin.name, enabled)
          })
        }
      }
    }
  } catch { /* ignore */ }

  // Add enabled plugins that aren't in any marketplace (e.g. claude-hud from extra marketplace)
  const listedIds = new Set(plugins.map((p) => p.id))
  for (const [id, isEn] of Object.entries(enabled)) {
    if (!isEn || listedIds.has(id)) continue
    const atIdx = id.lastIndexOf('@')
    const name = atIdx > 0 ? id.slice(0, atIdx) : id
    const marketplace = atIdx > 0 ? id.slice(atIdx + 1) : 'custom'
    plugins.push({
      id,
      name,
      marketplace,
      description: '',
      installCount: 0,
      isEnabled: true,
      isInstalled: isPluginInstalled(name, enabled)
    })
  }

  // [2026-05-01] 已安装 > 新插件 > 安装量排序
  return plugins.sort((a, b) => {
    const aInstalled = a.isInstalled ? 1 : 0
    const bInstalled = b.isInstalled ? 1 : 0
    if (bInstalled !== aInstalled) return bInstalled - aInstalled
    const aNew = newPluginNames?.has(a.name) ? 1 : 0
    const bNew = newPluginNames?.has(b.name) ? 1 : 0
    if (bNew !== aNew) return bNew - aNew
    return b.installCount - a.installCount
  })
}

export function setPluginEnabled(id: string, enable: boolean): void {
  const settings = readSessionSettings()
  const ep = { ...((settings.enabledPlugins ?? {}) as Record<string, boolean>) }
  if (enable) {
    ep[id] = true
    removeUserDisabledPlugin(id)
  } else {
    delete ep[id]
    addUserDisabledPlugin(id)
  }
  settings.enabledPlugins = ep
  writeSessionSettings(settings)
}
