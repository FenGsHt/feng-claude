import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const FILE = join(app.getPath('userData'), 'token-data.json')

export function getTokenData(): unknown {
  try {
    if (!existsSync(FILE)) return null
    return JSON.parse(readFileSync(FILE, 'utf-8'))
  } catch {
    return null
  }
}

export function setTokenData(data: unknown): void {
  try {
    writeFileSync(FILE, JSON.stringify(data), 'utf-8')
  } catch (e) {
    console.error('[tokenDataStore] write failed:', e)
  }
}
