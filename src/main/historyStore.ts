import Store from 'electron-store'
import type { HistoryRecord } from '../renderer/src/types/session'
import { getConfigDir } from './configDir'

interface StoreSchema {
  history: HistoryRecord[]
}

const store = new Store<StoreSchema>({
  name: 'history',
  cwd: getConfigDir(),
  defaults: { history: [] }
})

/** [2026-04-28] Strip ANSI escape sequences and orphaned cursor codes from text */
function stripAnsiArtifacts(s: string | undefined): string | undefined {
  if (!s) return s
  let r = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  r = r.replace(/\x1b[()][AB012]/g, '')
  r = r.replace(/\x1b[\[\](){}#%;><=~^_\\]/g, '')
  r = r.replace(/\[[0-9;]*[A-Za-z]/g, '')
  return r
}

export class HistoryStore {
  list(): HistoryRecord[] {
    return store.get('history', [])
      .map((r) => ({ ...r, lastUserPrompt: stripAnsiArtifacts(r.lastUserPrompt) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  save(record: HistoryRecord): void {
    // [2026-04-28] Sanitize on save too
    const sanitized = { ...record, lastUserPrompt: stripAnsiArtifacts(record.lastUserPrompt) }
    const history = store.get('history', [])
    const existing = history.findIndex((r) => r.id === sanitized.id)
    if (existing >= 0) {
      history[existing] = sanitized
    } else {
      history.unshift(sanitized)
    }
    // Keep max 200 records
    store.set('history', history.slice(0, 200))
  }

  delete(id: string): void {
    const history = store.get('history', []).filter((r) => r.id !== id)
    store.set('history', history)
  }

  get(id: string): HistoryRecord | undefined {
    const r = store.get('history', []).find((r) => r.id === id)
    if (!r) return undefined
    return { ...r, lastUserPrompt: stripAnsiArtifacts(r.lastUserPrompt) }
  }
}
