import { app } from 'electron'
import {
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  createWriteStream,
  unlinkSync,
  renameSync,
} from 'fs'
import { join } from 'path'
import https from 'https'
import type { IncomingMessage } from 'http'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import { addMcpServer } from './mcpManager'

const REPO = 'iOfficeAI/OfficeCLI'
const MCP_NAME = 'office-cli'

export interface OfficeCLIStatus {
  installed: boolean
  version: string | null
  latestVersion: string | null
  checking: boolean
  downloading: boolean
  progress: number
  error: string | null
}

let _win: BrowserWindow | null = null
let _currentStatus: OfficeCLIStatus = {
  installed: false,
  version: null,
  latestVersion: null,
  checking: false,
  downloading: false,
  progress: 0,
  error: null,
}

export function setOfficeCliWindow(win: BrowserWindow): void {
  _win = win
}

function emitStatus(patch: Partial<OfficeCLIStatus>): void {
  _currentStatus = { ..._currentStatus, ...patch }
  if (_win && !_win.isDestroyed()) {
    _win.webContents.send(IPC.OFFICE_CLI_STATUS, _currentStatus)
  }
}

// ── Platform ──────────────────────────────────────────────────

function getPlatformAsset(): string | null {
  const { platform, arch } = process
  if (platform === 'win32') return arch === 'arm64' ? 'officecli-win-arm64.exe' : 'officecli-win-x64.exe'
  if (platform === 'darwin') return arch === 'arm64' ? 'officecli-mac-arm64' : 'officecli-mac-x64'
  if (platform === 'linux') return arch === 'arm64' ? 'officecli-linux-arm64' : 'officecli-linux-x64'
  return null
}

function getBinaryFilename(): string {
  return process.platform === 'win32' ? 'officecli.exe' : 'officecli'
}

export function getOfficeCLIPath(): string {
  return join(app.getPath('userData'), getBinaryFilename())
}

function getVersionFilePath(): string {
  return join(app.getPath('userData'), 'officecli-version.txt')
}

// ── Version tracking ──────────────────────────────────────────

export function getInstalledVersion(): string | null {
  try {
    const p = getVersionFilePath()
    if (!existsSync(p)) return null
    return readFileSync(p, 'utf-8').trim() || null
  } catch {
    return null
  }
}

function saveVersion(version: string): void {
  writeFileSync(getVersionFilePath(), version, 'utf-8')
}

// ── HTTP helpers ──────────────────────────────────────────────

function httpsGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const doGet = (target: string): void => {
      const req = https.get(target, { headers: { 'User-Agent': 'feng-claude-app' } }, (res: IncomingMessage) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume()
          doGet(res.headers.location)
          return
        }
        let body = ''
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(new Error('timeout')) })
    }
    doGet(url)
  })
}

async function fetchLatestRelease(): Promise<{ tag: string; assetUrl: string } | null> {
  const assetName = getPlatformAsset()
  if (!assetName) return null
  try {
    const data = await httpsGetJson(
      `https://api.github.com/repos/${REPO}/releases/latest`
    ) as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }
    const found = data.assets?.find((a) => a.name === assetName)
    if (!found) return null
    return { tag: data.tag_name, assetUrl: found.browser_download_url }
  } catch {
    return null
  }
}

function downloadFile(
  url: string,
  destPath: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp'

    const doGet = (target: string): void => {
      https.get(target, { headers: { 'User-Agent': 'feng-claude-app' } }, (res: IncomingMessage) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume()
          doGet(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(String(res.headers['content-length'] ?? '0'), 10)
        let downloaded = 0
        const out = createWriteStream(tmpPath)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (total > 0) onProgress(Math.round((downloaded / total) * 100))
        })
        res.pipe(out)

        out.on('finish', () => {
          out.close()
          // chmod on Unix
          if (process.platform !== 'win32') {
            try { chmodSync(tmpPath, 0o755) } catch { /* ignore */ }
          }
          // Atomic replace
          try { if (existsSync(destPath)) unlinkSync(destPath) } catch { /* ignore */ }
          try {
            renameSync(tmpPath, destPath)
          } catch {
            // Fallback if rename fails (e.g. cross-device)
            writeFileSync(destPath, readFileSync(tmpPath))
            try { unlinkSync(tmpPath) } catch { /* ignore */ }
            if (process.platform !== 'win32') {
              try { chmodSync(destPath, 0o755) } catch { /* ignore */ }
            }
          }
          resolve()
        })
        out.on('error', (e) => { try { unlinkSync(tmpPath) } catch { /* ignore */ }; reject(e) })
        res.on('error', reject)
      }).on('error', reject)
    }

    doGet(url)
  })
}

// ── Core logic ────────────────────────────────────────────────

function registerMcp(): void {
  const binaryPath = getOfficeCLIPath()
  if (!existsSync(binaryPath)) return
  addMcpServer(MCP_NAME, {
    type: 'stdio',
    command: binaryPath,
    args: ['mcp'],
  })
  console.log('[OfficeCLI] MCP registered →', binaryPath)
}

/** 检查并下载更新；返回是否有更新安装 */
export async function checkAndUpdateOfficeCLI(): Promise<boolean> {
  if (!getPlatformAsset()) {
    emitStatus({ checking: false, error: 'Unsupported platform' })
    return false
  }

  emitStatus({ checking: true, error: null })

  const release = await fetchLatestRelease()
  if (!release) {
    emitStatus({ checking: false, error: 'Failed to fetch release info' })
    return false
  }

  emitStatus({ checking: false, latestVersion: release.tag })

  const currentVersion = getInstalledVersion()
  const binaryExists = existsSync(getOfficeCLIPath())

  if (currentVersion === release.tag && binaryExists) {
    console.log('[OfficeCLI] already up to date:', release.tag)
    return false
  }

  console.log('[OfficeCLI] downloading', release.tag, '…')
  emitStatus({ downloading: true, progress: 0 })

  try {
    await downloadFile(release.assetUrl, getOfficeCLIPath(), (pct) => {
      emitStatus({ progress: pct })
    })
    saveVersion(release.tag)
    emitStatus({ installed: true, version: release.tag, downloading: false, progress: 100 })
    registerMcp()
    console.log('[OfficeCLI] installed', release.tag)
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    emitStatus({ downloading: false, error: `Download failed: ${msg}` })
    console.error('[OfficeCLI] download failed:', e)
    return false
  }
}

/** 启动时调用：同步注册已有版本，异步后台检查更新 */
export function ensureOfficeCliMcpRegistered(win: BrowserWindow): void {
  setOfficeCliWindow(win)

  const binaryPath = getOfficeCLIPath()
  const version = getInstalledVersion()
  const installed = existsSync(binaryPath)

  _currentStatus = {
    installed,
    version: installed ? version : null,
    latestVersion: null,
    checking: false,
    downloading: false,
    progress: 0,
    error: null,
  }

  // If binary exists, register immediately (don't wait for update check)
  if (installed) registerMcp()

  // Background update check (non-blocking)
  setTimeout(() => {
    checkAndUpdateOfficeCLI().catch((e) => {
      console.error('[OfficeCLI] background update check failed:', e)
    })
  }, 5000)
}

export function getOfficeCLICurrentStatus(): OfficeCLIStatus {
  return { ..._currentStatus }
}
