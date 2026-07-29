import Store from 'electron-store'
import type { HistoryRecord } from '../renderer/src/types/session'
import { sanitizeHistoryPrompt } from '../renderer/src/lib/historyPromptSanitize'
import { getConfigDir } from './configDir'

interface StoreSchema {
  history: HistoryRecord[]
}

const store = new Store<StoreSchema>({
  name: 'history',
  cwd: getConfigDir(),
  defaults: { history: [] }
})

export class HistoryStore {
  list(): HistoryRecord[] {
    return store.get('history', [])
      // 读取时清理可立即修复旧版本已经写入磁盘的乱码标题。
      .map((r) => ({ ...r, lastUserPrompt: sanitizeHistoryPrompt(r.lastUserPrompt) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  save(record: HistoryRecord): void {
    const sanitized = {
      ...record,
      lastUserPrompt: sanitizeHistoryPrompt(record.lastUserPrompt)
    }
    const history = store.get('history', [])
    const existing = history.findIndex((r) => r.id === sanitized.id)
    if (existing >= 0) {
      /* [2026-05-06] 原直接赋值 sanitized：与 upsertWorkdirHistory 并发时后者读到的 prev 不含刚写入的
       * lastUserPrompt，合并字段会把磁盘上的有效 lastUserPrompt 覆盖成 undefined（侧栏主标题长期空白）。 */
      // history[existing] = sanitized
      const ex = history[existing]
      history[existing] = {
        ...ex,
        ...sanitized,
        lastUserPrompt: sanitized.lastUserPrompt ?? ex.lastUserPrompt
      }
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
    return { ...r, lastUserPrompt: sanitizeHistoryPrompt(r.lastUserPrompt) }
  }
}
