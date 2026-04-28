import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfigDir } from './configDir'

function getFile(): string {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, 'token-data.json')
}

export function getTokenData(): unknown {
  try {
    const file = getFile()
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

export function setTokenData(data: unknown): void {
  try {
    writeFileSync(getFile(), JSON.stringify(data), 'utf-8')
  } catch (e) {
    console.error('[tokenDataStore] write failed:', e)
  }
}
