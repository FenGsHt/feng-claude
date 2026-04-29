import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'path'
import { homedir } from 'os'

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
import { TestManager } from './testManager'
import { registerIpcHandlers } from './ipcHandlers'
import {
  ensureClaudeHudPluginDefaults,
  mergeSkipDangerousPromptFromApp,
  migrateLegacyClaudeSessionDirOnce
} from './claudeSessionConfigDir'
import { setupAutoUpdater, checkForUpdates } from './autoUpdater'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
import { getConfigDir } from './configDir'
import { listMcpServers as listMcpServersForMigration } from './mcpManager'

/** 一次性把旧路径的 token-data.json 迁移到新路径（打包版首次升级时） */
function migrateLegacyTokenDataOnce(): void {
  const newPath = join(getConfigDir(), 'token-data.json')
  if (existsSync(newPath)) return
  const oldPath = join(app.getPath('userData'), 'token-data.json')
  if (!existsSync(oldPath)) return
  try {
    mkdirSync(getConfigDir(), { recursive: true })
    copyFileSync(oldPath, newPath)
    console.log('[claude-gui] 已迁移 token-data.json:', oldPath, '→', newPath)
  } catch (e) {
    console.warn('[claude-gui] token-data.json 迁移失败:', e)
  }
}

/** 一次性迁移 scrollback 目录（打包版首次升级时） */
function migrateLegacyScrollbackOnce(): void {
  const { cpSync, readdirSync } = require('fs') as typeof import('fs')
  const newDir = join(getConfigDir(), 'scrollback')
  const oldDir = join(app.getPath('userData'), 'scrollback')
  if (oldDir === newDir) return
  if (!existsSync(oldDir)) return
  try {
    // Only migrate if new dir is empty or doesn't exist
    const newExists = existsSync(newDir)
    const newEmpty = !newExists || readdirSync(newDir).length === 0
    if (!newEmpty) return
    mkdirSync(newDir, { recursive: true })
    cpSync(oldDir, newDir, { recursive: true })
    console.log('[claude-gui] 已迁移 scrollback:', oldDir, '→', newDir)
  } catch (e) {
    console.warn('[claude-gui] scrollback 迁移失败:', e)
  }
}

let ptyManager: PtyManager
let mainWindow: BrowserWindow

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
  const claudeConfigDir = join(homedir(), '.claude')
  const sessionWatcher = new ClaudeSessionWatcher(win, claudeConfigDir)
  ptyManager = new PtyManager(win, settingsStore)
  const fsHandler = new FileSystemHandler()
  const historyStore = new HistoryStore()
  const testManager = new TestManager(win)

  registerIpcHandlers(ptyManager, fsHandler, historyStore, settingsStore, workspaceStore, sessionWatcher, testManager)

  // [2026-04-29] 启动时把已保存的「跳过危险模式确认」写入 claude-session/settings.json
  mergeSkipDangerousPromptFromApp(Boolean(settingsStore.get().skipDangerousModePermissionPrompt))

  // [2026-04-29] MCP 迁移：从旧的 settings.json 迁移 mcpServers 到 .claude.json
  listMcpServersForMigration()

  // Setup auto updater
  setupAutoUpdater(win)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
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
  const appId = app.isPackaged ? 'com.fengclaude.app' : process.execPath
  electronApp.setAppUserModelId(appId)
  console.log('[main] AppUserModelId set to:', appId)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  // [2026-04-30] 与 getConfigDir 对齐后再建窗口，避免 claude-session 仍留在旧路径
  migrateLegacyClaudeSessionDirOnce()
  // [2026-04-28] token-data.json 也需迁移到 getConfigDir()（打包版）
  migrateLegacyTokenDataOnce()
  migrateLegacyScrollbackOnce()
  createWindow()
  /* 用户在本应用内 /plugin install 后无需重启 Electron，轮询合并 statusLine */
  setInterval(() => ensureClaudeHudPluginDefaults(), 20_000)
  // Check for updates after 3 seconds (only in production)
  if (app.isPackaged) {
    setTimeout(() => checkForUpdates(), 3000)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  ptyManager?.flushAll()   // save scrollback
  ptyManager?.closeAll()   // kill PTY child processes so they don't keep the process alive
  // Hard-exit after 1 s as a backstop (e.g. NSIS installer update flow)
  setTimeout(() => process.exit(0), 1000).unref()
})

app.on('window-all-closed', () => {
  ptyManager?.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

