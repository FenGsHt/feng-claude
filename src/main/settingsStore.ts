import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Store from 'electron-store'
import type { ClaudeSettings } from '../renderer/src/types/settings'
import { DEFAULT_SETTINGS } from '../renderer/src/types/settings'

export type { ClaudeSettings }

interface StoreSchema {
  settings: ClaudeSettings
}

const store = new Store<StoreSchema>({
  name: 'claude-settings',
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
    // [2026-04-23] 原先仅从 electron-store 读取；增加读取 gitignore 的 local/claude.local.json 合并层，便于个人密钥只放本地文件、不提交仓库
    // return store.get('settings', DEFAULT_SETTINGS)
    const stored = store.get('settings', DEFAULT_SETTINGS)
    const local = readLocalClaudeOverrides()
    return local ? mergeClaudeSettings(stored, local) : stored
  }

  set(settings: ClaudeSettings): void {
    store.set('settings', settings)
  }

  /** Convert settings to env vars for PTY injection */
  toEnv(settings: ClaudeSettings): Record<string, string> {
    return {
      ANTHROPIC_AUTH_TOKEN: settings.authToken,
      ANTHROPIC_API_KEY: settings.authToken,
      ANTHROPIC_BASE_URL: settings.baseUrl,
      ANTHROPIC_MODEL: settings.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: settings.sonnetModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: settings.haikuModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: settings.opusModel,
      CLAUDE_CODE_SUBAGENT_MODEL: settings.subagentModel,
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: settings.disableExperimentalBetas ? '1' : '0'
    }
  }
}
