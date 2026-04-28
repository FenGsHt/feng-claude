import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Store from 'electron-store'
import type { ClaudeSettings, ApiProfile } from '../renderer/src/types/settings'
import { DEFAULT_SETTINGS, createDefaultProfile, migrateOldSettings } from '../renderer/src/types/settings'
import { getConfigDir } from './configDir'
import { v4 as uuidv4 } from 'uuid'

export type { ClaudeSettings, ApiProfile }
export { DEFAULT_SETTINGS, createDefaultProfile }

interface StoreSchema {
  settings: ClaudeSettings
}

const store = new Store<StoreSchema>({
  name: 'claude-settings',
  cwd: getConfigDir(),
  defaults: { settings: DEFAULT_SETTINGS }
})

/** 开发/源码构建：out/main → 仓库根下 local/claude.local.json */
function resolveLocalSettingsPath(): string {
  return join(__dirname, '../../local/claude.local.json')
}

function readLocalClaudeOverrides(): Partial<ClaudeSettings> | null {
  const path = resolveLocalSettingsPath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as Partial<ClaudeSettings>
  } catch {
    return null
  }
}

function mergeClaudeSettings(stored: ClaudeSettings, overrides: Partial<ClaudeSettings>): ClaudeSettings {
  const out = { ...stored }
  for (const key of Object.keys(overrides) as (keyof ClaudeSettings)[]) {
    const v = overrides[key]
    if (v !== undefined) {
      ;(out as Record<keyof ClaudeSettings, ClaudeSettings[keyof ClaudeSettings]>)[key] = v
    }
  }
  return out
}

export class SettingsStore {
  get(): ClaudeSettings {
    const stored = store.get('settings', DEFAULT_SETTINGS)

    // [2026-04-28] 迁移：旧版扁平配置转为 profile 格式
    if (!stored.profiles || stored.profiles.length === 0) {
      // 检测旧版格式（有 authToken 等顶层字段但无 profiles）
      if ('authToken' in stored || 'baseUrl' in stored) {
        const oldFormat = stored as unknown as Record<string, unknown>
        const migrated = migrateOldSettings(oldFormat)
        this.set(migrated)
        const local = readLocalClaudeOverrides()
        return local ? mergeClaudeSettings(migrated, local) : migrated
      }
      // 无旧数据也无 profiles，使用默认
      const defaultSettings = DEFAULT_SETTINGS
      this.set(defaultSettings)
      return defaultSettings
    }

    // 正常读取，合并 local overrides
    const mergedStored = { ...DEFAULT_SETTINGS, ...stored }
    const local = readLocalClaudeOverrides()
    return local ? mergeClaudeSettings(mergedStored, local) : mergedStored
  }

  set(settings: ClaudeSettings): void {
    store.set('settings', settings)
  }

  /** [2026-04-28] 获取当前激活的 API 配置 */
  getActiveProfile(): ApiProfile {
    const settings = this.get()
    const active = settings.profiles.find(p => p.id === settings.activeProfileId)
    return active ?? settings.profiles[0] ?? createDefaultProfile('Default', 'default')
  }

  /** [2026-04-28] 转换 ApiProfile 为环境变量 */
  profileToEnv(profile: ApiProfile): Record<string, string> {
    return {
      ANTHROPIC_AUTH_TOKEN: profile.authToken,
      ANTHROPIC_API_KEY: profile.authToken,
      ANTHROPIC_BASE_URL: profile.baseUrl,
      ANTHROPIC_MODEL: profile.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: profile.sonnetModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.haikuModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: profile.opusModel,
      CLAUDE_CODE_SUBAGENT_MODEL: profile.subagentModel,
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: profile.disableExperimentalBetas ? '1' : '0'
    }
  }

  /** [2026-04-28] Convert settings to env vars for PTY injection (uses active profile) */
  toEnv(): Record<string, string> {
    return this.profileToEnv(this.getActiveProfile())
  }

  /** [2026-04-28] 添加新配置 */
  addProfile(profile: ApiProfile): void {
    const settings = this.get()
    settings.profiles.push(profile)
    this.set(settings)
  }

  /** [2026-04-28] 更新配置 */
  updateProfile(profileId: string, updates: Partial<ApiProfile>): void {
    const settings = this.get()
    const idx = settings.profiles.findIndex(p => p.id === profileId)
    if (idx >= 0) {
      settings.profiles[idx] = { ...settings.profiles[idx], ...updates }
      this.set(settings)
    }
  }

  /** [2026-04-28] 删除配置（不能删除最后一个） */
  deleteProfile(profileId: string): { success: boolean; error?: string } {
    const settings = this.get()
    if (settings.profiles.length <= 1) {
      return { success: false, error: 'Cannot delete the last profile' }
    }
    const idx = settings.profiles.findIndex(p => p.id === profileId)
    if (idx < 0) {
      return { success: false, error: 'Profile not found' }
    }
    settings.profiles.splice(idx, 1)
    // 如果删除的是当前激活的，切换到第一个
    if (settings.activeProfileId === profileId) {
      settings.activeProfileId = settings.profiles[0]?.id ?? ''
    }
    this.set(settings)
    return { success: true }
  }

  /** [2026-04-28] 设置激活配置 */
  setActiveProfile(profileId: string): { success: boolean; error?: string } {
    const settings = this.get()
    if (!settings.profiles.some(p => p.id === profileId)) {
      return { success: false, error: 'Profile not found' }
    }
    settings.activeProfileId = profileId
    this.set(settings)
    return { success: true }
  }
}