import Store from 'electron-store'
import type { PersistedWorkspace } from '../renderer/src/types/workspace'
import { getConfigDir } from './configDir'

interface Schema {
  workspace: PersistedWorkspace | null
}

export class WorkspaceStore {
  private store = new Store<Schema>({
    name: 'claude-workspace',
    cwd: getConfigDir(),
    defaults: { workspace: null }
  })

  get(): PersistedWorkspace | null {
    return this.store.get('workspace') ?? null
  }

  set(workspace: PersistedWorkspace | null): void {
    this.store.set('workspace', workspace)
  }
}
