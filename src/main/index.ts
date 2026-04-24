import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PtyManager } from './ptyManager'
import { FileSystemHandler } from './fileSystemHandler'
import { HistoryStore } from './historyStore'
import { SettingsStore } from './settingsStore'
import { WorkspaceStore } from './workspaceStore'
import { ClaudeSessionWatcher } from './claudeSessionWatcher'
import { registerIpcHandlers } from './ipcHandlers'

let ptyManager: PtyManager

function createWindow(): BrowserWindow {
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
  electronApp.setAppUserModelId('com.claudegui')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager?.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

