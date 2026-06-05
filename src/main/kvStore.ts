/** [2026-06-05] 通用键值持久化：存到 getConfigDir()/kv/<key>.json（稳定路径，便携版/升级后仍在）。
 *  供 renderer 的 zustand persist 通过 IPC 使用，替代不可靠的 localStorage。
 *  值按字符串原样读写（zustand 已序列化好）。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { getConfigDir } from './configDir'

function fileFor(key: string): string {
  const dir = join(getConfigDir(), 'kv')
  mkdirSync(dir, { recursive: true })
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(dir, `${safe}.json`)
}

export function getKv(key: string): string | null {
  try {
    const f = fileFor(key)
    if (!existsSync(f)) return null
    return readFileSync(f, 'utf-8')
  } catch {
    return null
  }
}

export function setKv(key: string, value: string): void {
  try {
    const f = fileFor(key)
    if (value === '' ) {
      if (existsSync(f)) rmSync(f, { force: true })
      return
    }
    writeFileSync(f, value, 'utf-8')
  } catch (e) {
    console.error('[kvStore] write failed:', key, e)
  }
}
