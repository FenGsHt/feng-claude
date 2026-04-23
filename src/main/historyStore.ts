import Store from 'electron-store'
import type { HistoryRecord } from '../renderer/src/types/session'

interface StoreSchema {
  history: HistoryRecord[]
}

const store = new Store<StoreSchema>({
  name: 'history',
  defaults: { history: [] }
})

export class HistoryStore {
  list(): HistoryRecord[] {
    return store.get('history', []).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  save(record: HistoryRecord): void {
    const history = store.get('history', [])
    const existing = history.findIndex((r) => r.id === record.id)
    if (existing >= 0) {
      history[existing] = record
    } else {
      history.unshift(record)
    }
    // Keep max 200 records
    store.set('history', history.slice(0, 200))
  }

  delete(id: string): void {
    const history = store.get('history', []).filter((r) => r.id !== id)
    store.set('history', history)
  }

  get(id: string): HistoryRecord | undefined {
    return store.get('history', []).find((r) => r.id === id)
  }
}
