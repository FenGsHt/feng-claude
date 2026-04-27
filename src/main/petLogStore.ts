import Store from 'electron-store'
import type { PetLogRecord } from '../renderer/src/types/ipc'

interface StoreSchema {
  logs: PetLogRecord[]
}

const store = new Store<StoreSchema>({
  name: 'pet-logs',
  defaults: { logs: [] }
})

export class PetLogStore {
  add(record: PetLogRecord): void {
    const logs = store.get('logs', [])
    logs.unshift(record)
    // Keep max 500 records
    store.set('logs', logs.slice(0, 500))
  }

  list(limit?: number): PetLogRecord[] {
    const logs = store.get('logs', [])
    return limit ? logs.slice(0, limit) : logs
  }

  clear(): void {
    store.set('logs', [])
  }
}