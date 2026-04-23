import Store from 'electron-store'
import type { PersistedWorkspace } from '../renderer/src/types/workspace'

interface Schema {
  workspace: PersistedWorkspace | null
}

export class WorkspaceStore {
  private store = new Store<Schema>({
    name: 'claude-workspace',
    defaults: { workspace: null }
  })

  get(): PersistedWorkspace | null {
    return this.store.get('workspace') ?? null
  }

  set(workspace: PersistedWorkspace | null): void {
    this.store.set('workspace', workspace)
  }
}
