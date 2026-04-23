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

export class SettingsStore {
  get(): ClaudeSettings {
    return store.get('settings', DEFAULT_SETTINGS)
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
