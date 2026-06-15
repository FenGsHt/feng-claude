import Store from 'electron-store'
import type { PetLogRecord } from '../renderer/src/types/ipc'
import { getConfigDir } from './configDir'

interface StoreSchema {
  logs: PetLogRecord[]
}

const store = new Store<StoreSchema>({
  name: 'pet-logs',
  cwd: getConfigDir(),
  defaults: { logs: [] }
})

export class PetLogStore {
  add(record: PetLogRecord): void {
    const logs = store.get('logs', [])
    logs.unshift(record)
    // [2026-06-15] 上限 500 → 200：宠物日志为趣味性功能，200 条足够回看，
    // 且可降低 electron-store 每次写入的全量重写体积
    store.set('logs', logs.slice(0, 200))
  }

  list(limit?: number): PetLogRecord[] {
    const logs = store.get('logs', [])
    return limit ? logs.slice(0, limit) : logs
  }

  clear(): void {
    store.set('logs', [])
  }
}