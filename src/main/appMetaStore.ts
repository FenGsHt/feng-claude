import Store from 'electron-store'
import { getConfigDir } from './configDir'

/** [2026-05-08] 与 settings 分离：记录「新版本介绍」已读版本，避免污染 ClaudeSettings */
interface AppMetaSchema {
  lastSeenWhatsNewVersion: string
}

const metaStore = new Store<AppMetaSchema>({
  name: 'feng-app-meta',
  cwd: getConfigDir(),
  defaults: { lastSeenWhatsNewVersion: '' }
})

export function getLastSeenWhatsNewVersion(): string {
  return (metaStore.get('lastSeenWhatsNewVersion') ?? '').trim()
}

export function setLastSeenWhatsNewVersion(version: string): void {
  metaStore.set('lastSeenWhatsNewVersion', (version ?? '').trim())
}
