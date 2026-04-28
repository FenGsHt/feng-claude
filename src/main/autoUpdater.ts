import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types/ipc'

let mainWindow: BrowserWindow | null = null

export function setupAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  // Auto-download silently in background; user only sees a notification when ready
  autoUpdater.autoDownload = true
  // Install silently on quit if user didn't manually trigger install
  autoUpdater.autoInstallOnAppQuit = true

  // Log for debugging
  autoUpdater.logger = {
    error: (msg: string) => console.error('[autoUpdater]', msg),
    info: (msg: string) => console.info('[autoUpdater]', msg),
    warn: (msg: string) => console.warn('[autoUpdater]', msg),
    debug: (msg: string) => console.debug('[autoUpdater]', msg),
  }

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
    })
  })

  autoUpdater.on('update-not-available', () => {
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
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: error?.message || String(error),
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
    console.error('[autoUpdater] checkForUpdates error:', err)
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: err?.message || String(err),
    })
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('[autoUpdater] downloadUpdate error:', err)
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
      status: 'error',
      error: err?.message || String(err),
    })
  })
}

export function installUpdate(): void {
  // quitAndInstall triggers app.quit() → before-quit → PTY cleanup → process exit
  // isSilent=true  → NSIS /S flag, no installer UI
  // isForceRunAfter=true → relaunch app after install
  autoUpdater.quitAndInstall(true, true)
}