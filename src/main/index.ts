import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'path'

// 抑制 EPIPE 错误（dev 模式下父进程断开管道时 console.log 会触发）
process.stdout?.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') return })
process.stderr?.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') return })
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PtyManager } from './ptyManager'
import { FileSystemHandler } from './fileSystemHandler'
import { HistoryStore } from './historyStore'
import { SettingsStore } from './settingsStore'
import { WorkspaceStore } from './workspaceStore'
import { ClaudeSessionWatcher } from './claudeSessionWatcher'
import { registerIpcHandlers } from './ipcHandlers'
import { ensureClaudeHudPluginDefaults } from './claudeSessionConfigDir'

let ptyManager: PtyManager

function createWindow(): BrowserWindow {
  ensureClaudeHudPluginDefaults()

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const settingsStore = new SettingsStore()
  const workspaceStore = new WorkspaceStore()
  const claudeConfigDir = join(app.getPath('userData'), 'claude-session')
  const sessionWatcher = new ClaudeSessionWatcher(win, claudeConfigDir)
  ptyManager = new PtyManager(win, settingsStore)
  const fsHandler = new FileSystemHandler()
  const historyStore = new HistoryStore()

  registerIpcHandlers(ptyManager, fsHandler, historyStore, settingsStore, workspaceStore, sessionWatcher)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // [2026-04-23] 打包后 file:// 无 CSP 时 Electron 报 warnAboutInsecureCSP；开发态仍用 Vite 自带策略，不在此注入以免破坏 HMR
  if (app.isPackaged) {
    const csp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss: data:; worker-src 'self' blob:;"
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') {
        callback({ responseHeaders: details.responseHeaders })
        return
      }
      if (!details.url.startsWith('file:')) {
        callback({ responseHeaders: details.responseHeaders })
        return
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    })
  }

  // [2026-04-27] For Windows notifications to work, AppUserModelId must match the executable path
  // in portable mode. In installed mode, the installer creates a Start Menu shortcut with this ID.
  const appId = app.isPackaged ? 'com.claudegui' : process.execPath
  electronApp.setAppUserModelId(appId)
  console.log('[main] AppUserModelId set to:', appId)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  /* 用户在本应用内 /plugin install 后无需重启 Electron，轮询合并 statusLine */
  setInterval(() => ensureClaudeHudPluginDefaults(), 20_000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  ptyManager?.flushAll()
})

app.on('window-all-closed', () => {
  ptyManager?.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

