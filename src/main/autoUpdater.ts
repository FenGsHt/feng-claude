import { autoUpdater } from 'electron-updater'
import { BrowserWindow, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { IPC } from '../renderer/src/types/ipc'
import { getConfigDir } from './configDir'

let mainWindow: BrowserWindow | null = null
let availableVersion: string | null = null

function updaterLog(level: 'ERROR' | 'INFO' | 'WARN' | 'DEBUG', message: unknown): void {
  const text = typeof message === 'string' ? message : String(message)
  const consoleMethod = level === 'ERROR' ? console.error
    : level === 'WARN' ? console.warn
      : level === 'DEBUG' ? console.debug
        : console.info
  consoleMethod('[autoUpdater]', text)

  try {
    const logDir = getConfigDir()
    mkdirSync(logDir, { recursive: true })
    appendFileSync(
      join(logDir, 'update.log'),
      `${new Date().toISOString()} [${level}] ${text}\n`,
      'utf8'
    )
  } catch {
    // Logging must never interrupt update checks.
  }
}

export function setupAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  // [2026-07-31] Squirrel.Mac requires a signed application. Until the macOS
  // build is signed/notarized, only check for updates and let the user install
  // the architecture-matched DMG manually.
  const supportsAutomaticInstall = process.platform !== 'darwin'
  autoUpdater.autoDownload = supportsAutomaticInstall
  autoUpdater.autoInstallOnAppQuit = supportsAutomaticInstall

  autoUpdater.logger = {
    error: (msg: unknown) => updaterLog('ERROR', msg),
    info: (msg: unknown) => updaterLog('INFO', msg),
    warn: (msg: unknown) => updaterLog('WARN', msg),
    debug: (msg: unknown) => updaterLog('DEBUG', msg),
  }

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
    })
  })

  autoUpdater.on('update-not-available', () => {
    availableVersion = null
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('error', (error) => {
    const msg = error?.message || String(error)
    // [2026-04-29] Suppress CDN-propagation noise (404 on latest.yml right after release)
    if (msg.includes('404') && msg.includes('latest.yml')) return
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: msg,
    })
  })

  // 启动后延迟 3 秒自动检查更新（避免阻塞启动）
  setTimeout(() => {
    checkForUpdates()
  }, 3000)
}

export function checkForUpdates(): void {
  if (!mainWindow) return
  autoUpdater.checkForUpdates().catch((err) => {
    const msg = err?.message || String(err)
    // [2026-04-29] Suppress CDN-propagation noise (404 on latest.yml right after release)
    if (msg.includes('404') && msg.includes('latest.yml')) {
      console.debug('[autoUpdater] silenced 404 (release not yet propagated):', msg)
      return
    }
    console.error('[autoUpdater] checkForUpdates error:', err)
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: msg,
    })
  })
}

export function downloadUpdate(): void {
  if (process.platform === 'darwin') {
    const version = availableVersion
    if (!version) {
      void shell.openExternal('https://github.com/FenGsHt/feng-claude/releases/latest')
      return
    }

    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const fileName = `feng-claude-${version}-${arch}.dmg`
    const url = `https://github.com/FenGsHt/feng-claude/releases/download/v${encodeURIComponent(version)}/${fileName}`
    updaterLog('INFO', `Opening manual macOS update: ${url}`)
    void shell.openExternal(url).catch((err) => {
      const msg = err?.message || String(err)
      updaterLog('ERROR', `Unable to open macOS update: ${msg}`)
      mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
        status: 'error',
        error: msg,
      })
    })
    return
  }

  autoUpdater.downloadUpdate().catch((err) => {
    updaterLog('ERROR', `downloadUpdate error: ${err?.message || String(err)}`)
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: err?.message || String(err),
    })
  })
}

export function installUpdate(): void {
  if (process.platform === 'darwin') {
    downloadUpdate()
    return
  }

  // quitAndInstall triggers app.quit() → before-quit → PTY cleanup → process exit
  // isSilent=true  → NSIS /S flag, no installer UI
  // isForceRunAfter=true → relaunch app after install
  autoUpdater.quitAndInstall(true, true)
}
