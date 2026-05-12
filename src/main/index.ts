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
import { startBrowserServer, registerBrowserViewIpc, toggleBrowserView, startElementPicker, startCdpProxy } from './browserViewManager'
import { ensureBrowserToolsMcpRegistered, ensureVisualAgentMcpRegistered } from './mcpManager'
import { ensureOfficeCliMcpRegistered } from './officeCliManager'
import { startApiProxy, stopApiProxy } from './apiProxyServer'

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
  /* [2026-05-06] 原: new ClaudeSessionWatcher(win, claudeConfigDir) — 无转录开关；现注入闭包读设置，仅 embedClaudeOutputBeta 为 true 时 JSONL 才推送转录 */
  const sessionWatcher = new ClaudeSessionWatcher(win, claudeConfigDir, () =>
    settingsStore.get().embedClaudeOutputBeta === true
  )
  ptyManager = new PtyManager(win, settingsStore)
  const fsHandler = new FileSystemHandler()
  const historyStore = new HistoryStore()
  const testManager = new TestManager(win)

  registerIpcHandlers(ptyManager, fsHandler, historyStore, settingsStore, workspaceStore, sessionWatcher, testManager)

  // [2026-04-29] 启动时把已保存的「跳过危险模式确认」写入 claude-session/settings.json
  mergeSkipDangerousPromptFromApp(Boolean(settingsStore.get().skipDangerousModePermissionPrompt))

  // [2026-04-29] MCP 迁移：从旧的 settings.json 迁移 mcpServers 到 .claude.json
  listMcpServersForMigration()

  // [2026-04-30] 自动注册浏览器工具 MCP（默认开启，用户可手动删除）
  ensureBrowserToolsMcpRegistered()

  // [2026-05-01] 自动注册视觉代理 MCP（需要配置 API 才能工作）
  ensureVisualAgentMcpRegistered()

  // [2026-05-12] 自动注册 OfficeCLI MCP（处理 docx/xlsx/pptx），后台静默更新
  ensureOfficeCliMcpRegistered(win)

  // [2026-04-30] API 容灾代理：开启时启动本地转发服务
  if (settingsStore.get().enableApiProxy) {
    startApiProxy()
  }

  // Setup auto updater
  setupAutoUpdater(win)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // [2026-05-11] dev 模式下始终打开 DevTools
  if (is.dev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // ── Embedded browser for debugging ──────────────────────────────
  void startBrowserServer(win)
  startCdpProxy()
  registerBrowserViewIpc()

  win.webContents.on('before-input-event', (event, input) => {
    // Ctrl+Shift+D — toggle embedded browser
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'd') {
      event.preventDefault()
      toggleBrowserView(win)
    }
    // Ctrl+Shift+Q — element picker
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'q') {
      event.preventDefault()
      void startElementPicker()
    }
    // [2026-05-01] 在主进程拦截 Ctrl+Shift+C，绕过 Electron 菜单加速器
    if (input.control && input.shift && !input.alt && input.type === 'keyDown' && input.key.toLowerCase() === 'c') {
      event.preventDefault()
      win.webContents.send('terminal:copy-selection')
    }
    // [2026-05-03] 语音快捷键：在主进程拦截以绕过 Windows Alt 菜单捕获
    if (input.type === 'keyDown') {
      const sp = settingsStore.get().speech
      if (sp?.enabled && sp.shortcut) {
        const parts = sp.shortcut.split('+')
        const key = parts[parts.length - 1]
        const mods = parts.slice(0, -1).map((m: string) => m.toLowerCase())
        const matches =
          (mods.includes('alt') === input.alt) &&
          (mods.includes('ctrl') === input.control) &&
          (mods.includes('shift') === input.shift) &&
          input.key.toLowerCase() === key.toLowerCase()
        if (matches) {
          event.preventDefault()
          win.webContents.send('speech:toggle')
        }
      }
    }
  })

  mainWindow = win
  return win
}

app.whenReady().then(() => {
  // 允许渲染进程请求麦克风权限（语音识别功能）
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

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
  stopApiProxy()            // [2026-04-30] 关闭 API 容灾代理
  ptyManager?.flushAll()   // save scrollback
  ptyManager?.closeAll()   // kill PTY child processes so they don't keep the process alive
  // Hard-exit after 1 s as a backstop (e.g. NSIS installer update flow)
  setTimeout(() => process.exit(0), 1000).unref()
})

app.on('window-all-closed', () => {
  ptyManager?.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

