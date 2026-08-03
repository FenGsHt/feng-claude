import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, net, shell } from 'electron'
import { appendFileSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { IPC } from '../renderer/src/types/ipc'
import { getConfigDir } from './configDir'

let mainWindow: BrowserWindow | null = null
let availableVersion: string | null = null
let macDownloadInProgress = false
let downloadedMacInstaller: { version: string; path: string } | null = null

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
    if (downloadedMacInstaller?.version !== info.version) downloadedMacInstaller = null
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

    if (downloadedMacInstaller?.version === version && existsSync(downloadedMacInstaller.path)) {
      void openMacInstaller(downloadedMacInstaller.path)
      return
    }
    if (macDownloadInProgress) return

    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const safeVersion = version.replace(/[^0-9A-Za-z._+-]/g, '')
    if (!safeVersion || safeVersion !== version) {
      mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
        status: 'error',
        error: `无效的更新版本号：${version}`,
      })
      return
    }
    const fileName = `feng-claude-${safeVersion}-${arch}.dmg`
    const url = `https://github.com/FenGsHt/feng-claude/releases/download/v${encodeURIComponent(version)}/${fileName}`
    downloadMacInstaller(version, url, fileName)
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
    if (downloadedMacInstaller && existsSync(downloadedMacInstaller.path)) {
      void openMacInstaller(downloadedMacInstaller.path)
    } else {
      downloadUpdate()
    }
    return
  }

  // quitAndInstall triggers app.quit() → before-quit → PTY cleanup → process exit
  // isSilent=true  → NSIS /S flag, no installer UI
  // isForceRunAfter=true → relaunch app after install
  autoUpdater.quitAndInstall(true, true)
}

/** [2026-08-02] 未正式签名的 macOS 构建无法走 Squirrel 自动替换，改为应用内下载并自动打开 DMG。 */
function downloadMacInstaller(version: string, url: string, fileName: string): void {
  const updateDir = join(app.getPath('temp'), 'feng-claude-updates')
  const installerPath = join(updateDir, fileName)
  const partialPath = `${installerPath}.download`
  mkdirSync(updateDir, { recursive: true })
  rmSync(partialPath, { force: true })

  macDownloadInProgress = true
  const startedAt = Date.now()
  let transferred = 0
  let total = 0
  let settled = false
  const output = createWriteStream(partialPath)
  const request = net.request({ method: 'GET', url, redirect: 'follow' })

  const fail = (error: unknown): void => {
    if (settled) return
    settled = true
    macDownloadInProgress = false
    output.destroy()
    rmSync(partialPath, { force: true })
    const msg = error instanceof Error ? error.message : String(error)
    updaterLog('ERROR', `macOS installer download failed: ${msg}`)
    mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status: 'error', error: msg })
  }

  output.once('error', fail)
  request.once('error', fail)
  request.on('response', (response) => {
    const statusCode = response.statusCode ?? 0
    if (statusCode < 200 || statusCode >= 300) {
      response.resume()
      fail(new Error(`下载安装包失败：HTTP ${statusCode}`))
      return
    }

    const rawTotal = response.headers['content-length']?.[0]
    total = rawTotal ? Number(rawTotal) : 0
    mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, {
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total,
    })

    response.on('data', (chunk: Buffer) => {
      transferred += chunk.length
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
      mainWindow?.webContents.send(IPC.UPDATE_PROGRESS, {
        percent: total > 0 ? (transferred / total) * 100 : 0,
        bytesPerSecond: transferred / elapsedSeconds,
        transferred,
        total,
      })
    })
    response.once('error', fail)
    response.pipe(output)
  })

  output.once('finish', () => {
    if (settled) return
    try {
      if (transferred === 0 || (total > 0 && transferred !== total)) {
        fail(new Error(`安装包下载不完整：${transferred}/${total} 字节`))
        return
      }
      output.close()
      rmSync(installerPath, { force: true })
      renameSync(partialPath, installerPath)
      settled = true
      macDownloadInProgress = false
      downloadedMacInstaller = { version, path: installerPath }
      updaterLog('INFO', `macOS installer downloaded: ${installerPath}`)
      mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status: 'downloaded', version })
      void openMacInstaller(installerPath)
    } catch (error) {
      fail(error)
    }
  })

  updaterLog('INFO', `Downloading macOS installer in app: ${url}`)
  request.end()
}

async function openMacInstaller(installerPath: string): Promise<void> {
  const error = await shell.openPath(installerPath)
  if (!error) return
  updaterLog('ERROR', `Unable to open macOS installer: ${error}`)
  mainWindow?.webContents.send(IPC.UPDATE_STATUS, {
    status: 'error',
    error: `安装包已下载，但无法自动打开：${error}\n${installerPath}`,
  })
}
