import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { PtyOutputPayload, PtyStatusPayload, PtyIntrSentPayload, PtyInputAckPayload, SessionCreateResult, ToolCallPayload } from '../renderer/src/types/ipc'
import type { FileTreeNode } from '../renderer/src/types/fs'
import type { HistoryRecord } from '../renderer/src/types/session'
import type { ClaudeSettings, ApiProfile, TelegramChannelSessionConfig } from '../renderer/src/types/settings'
import type { PersistedWorkspace } from '../renderer/src/types/workspace'
import type { TokenUsageUpdatePayload, PluginEntry, McpEntry, McpServerConfig, SkillEntry, PetAskPayload, PetAskResult, PetGameCommentPayload, ContentBankGeneratePayload, ContentBankGenerateResult, GitWorktreeListResult, GitWorktreeCreatePayload, GitWorktreeCreateResult, GitWorktreeRemovePayload, GitWorktreeRemoveResult, GitBranchListResult, GitMergeBranchPayload, GitMergeBranchResult, GitUpdateWorktreePayload, GitUpdateWorktreeResult, GitUnmergedCommitsPayload, GitUnmergedCommitsResult, PetLogRecord, UpdateStatusPayload, UpdateProgressPayload, ProfileAddPayload, ProfileUpdatePayload, ProfileDeletePayload, ProfileSetActivePayload, ProfileResult, TestFrameworkInfo, TestOutputPayload, TestStatusPayload, TestRunPayload, ClaudeTranscriptPayload, TelegramChannelCheckResult, WhatsNewShouldShowResult, OfficeCLIStatus, OfficePreviewOpenResult } from '../renderer/src/types/ipc'

const electronAPI = {
  readClipboardTextSync: (): string => {
    const v = ipcRenderer.sendSync(IPC.CLIPBOARD_READ_TEXT_SYNC)
    return typeof v === 'string' ? v : ''
  },

  writeClipboardText: (text: string): void => {
    ipcRenderer.send(IPC.CLIPBOARD_WRITE_TEXT, text)
  },

  saveClipboardImage: (base64Data: string, workdir?: string): Promise<{ success: boolean; path: string }> => {
    return ipcRenderer.invoke(IPC.CLIPBOARD_SAVE_IMAGE, base64Data, workdir)
  },

  deleteFile: (path: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC.FS_DELETE_FILE, path)
  },

  revealFile: (path: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC.FS_REVEAL_FILE, path)
  },

  // Session
  createSession: (
    workdir: string,
    resume?: boolean,
    profileId?: string,
    shellOnly?: boolean,
    telegramChannel?: TelegramChannelSessionConfig
  ): Promise<SessionCreateResult> =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { workdir, resume, profileId, shellOnly, telegramChannel }),

  closeSession: (sessionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SESSION_CLOSE, { sessionId }),

  // PTY
  // [2026-05-12] 原 sendInput 仅传 sessionId/data；为定位“已发送但未生效”补充 traceId 贯通主进程 ACK。
  sendInput: (sessionId: string, data: string, traceId?: string): void =>
    ipcRenderer.send(IPC.PTY_INPUT, { sessionId, data, traceId }),

  resizePty: (sessionId: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.PTY_RESIZE, { sessionId, cols, rows }),

  onPtyOutput: (callback: (payload: PtyOutputPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyOutputPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_OUTPUT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_OUTPUT, handler)
  },

  onPtyStatus: (callback: (payload: PtyStatusPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyStatusPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_STATUS, handler)
  },

  onPtyIntrSent: (callback: (payload: PtyIntrSentPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyIntrSentPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_INTR_SENT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_INTR_SENT, handler)
  },
  onPtyInputAck: (callback: (payload: PtyInputAckPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyInputAckPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_INPUT_ACK, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_INPUT_ACK, handler)
  },

  // Working directory
  openDirDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC.WORKDIR_OPEN_DIALOG),

  resolveWorkdirMany: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke(IPC.WORKDIR_RESOLVE_MANY, { paths }),

  // File system
  readFileTree: (dirPath: string, depth?: number): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke(IPC.FS_READ_TREE, { dirPath, depth }),

  openTextFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.FS_OPEN_FILE_DIALOG),

  readTextFile: (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),

  writeTextFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),

  readFileAsDataUrl: (filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> =>
    ipcRenderer.invoke(IPC.FS_READ_FILE_AS_DATA_URL, filePath),

  walkFiles: (dirPath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.FS_WALK_FILES, dirPath),

  // History
  history: {
    list: (): Promise<HistoryRecord[]> => ipcRenderer.invoke(IPC.HISTORY_LIST),
    save: (record: HistoryRecord): Promise<void> =>
      ipcRenderer.invoke(IPC.HISTORY_SAVE, { record }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.HISTORY_DELETE, { id }),
    get: (id: string): Promise<HistoryRecord | undefined> =>
      ipcRenderer.invoke(IPC.HISTORY_GET, { id })
  },

  // Settings
  settings: {
    get: (): Promise<ClaudeSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (s: ClaudeSettings): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, s)
  },

  detectShells: (): Promise<import('../renderer/src/types/ipc').ShellDetectResult> =>
    ipcRenderer.invoke(IPC.SHELL_DETECT),

  checkTelegramChannel: (): Promise<TelegramChannelCheckResult> =>
    ipcRenderer.invoke(IPC.TELEGRAM_CHANNEL_CHECK),

  onSettingsChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.SETTINGS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, handler)
  },

  onSpeechToggle: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('speech:toggle', handler)
    return () => ipcRenderer.removeListener('speech:toggle', handler)
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onElementPicked: (callback: (info: any) => void): (() => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (_: Electron.IpcRendererEvent, info: any): void => callback(info)
    ipcRenderer.on('browser:element-picked', handler)
    return () => ipcRenderer.removeListener('browser:element-picked', handler)
  },

  // [2026-04-28] API Profile 管理
  profiles: {
    add: (profile: ApiProfile): Promise<ProfileResult> =>
      ipcRenderer.invoke(IPC.PROFILE_ADD, { profile }),
    update: (profileId: string, updates: Partial<ApiProfile>): Promise<ProfileResult> =>
      ipcRenderer.invoke(IPC.PROFILE_UPDATE, { profileId, updates }),
    delete: (profileId: string): Promise<ProfileResult> =>
      ipcRenderer.invoke(IPC.PROFILE_DELETE, { profileId }),
    setActive: (profileId: string): Promise<ProfileResult> =>
      ipcRenderer.invoke(IPC.PROFILE_SET_ACTIVE, { profileId }),
    getActive: (): Promise<{ profile: ApiProfile }> =>
      ipcRenderer.invoke(IPC.PROFILE_GET_ACTIVE),
  },

  onTokenUsageUpdate: (callback: (payload: TokenUsageUpdatePayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: TokenUsageUpdatePayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.TOKEN_USAGE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.TOKEN_USAGE_UPDATE, handler)
  },

  onToolCallUpdate: (callback: (payload: ToolCallPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ToolCallPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.TOOL_CALL_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.TOOL_CALL_UPDATE, handler)
  },

  onClaudeTranscriptUpdate: (callback: (payload: ClaudeTranscriptPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ClaudeTranscriptPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.CLAUDE_TRANSCRIPT_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.CLAUDE_TRANSCRIPT_UPDATE, handler)
  },

  workspace: {
    save: (workspace: PersistedWorkspace | null): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.WORKSPACE_SAVE, workspace),
    load: (): Promise<unknown> => ipcRenderer.invoke(IPC.WORKSPACE_LOAD)
  },

  plugins: {
    list: (): Promise<PluginEntry[]> => ipcRenderer.invoke(IPC.PLUGIN_LIST),
    setEnabled: (id: string, enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.PLUGIN_SET_ENABLED, { id, enabled }),
    refresh: (): Promise<{ plugins: PluginEntry[]; newPlugins: string[]; error?: string }> =>
      ipcRenderer.invoke(IPC.PLUGIN_REFRESH)
  },

  tokenData: {
    get: (): Promise<unknown> => ipcRenderer.invoke(IPC.TOKEN_DATA_GET),
    set: (data: unknown): Promise<void> => ipcRenderer.invoke(IPC.TOKEN_DATA_SET, data)
  },

  mcp: {
    list: (): Promise<McpEntry[]> => ipcRenderer.invoke(IPC.MCP_LIST),
    add: (name: string, cfg: McpServerConfig): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.MCP_ADD, { name, cfg }),
    remove: (name: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.MCP_REMOVE, { name }),
    setEnabled: (name: string, enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.MCP_SET_ENABLED, { name, enabled }),
    update: (name: string, cfg: McpServerConfig): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.MCP_UPDATE, { name, cfg })
  },

  officeCli: {
    getStatus: (): Promise<OfficeCLIStatus> => ipcRenderer.invoke(IPC.OFFICE_CLI_GET_STATUS),
    checkUpdate: (): Promise<{ started: boolean }> => ipcRenderer.invoke(IPC.OFFICE_CLI_CHECK_UPDATE),
    onStatus: (callback: (status: OfficeCLIStatus) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: OfficeCLIStatus): void => callback(status)
      ipcRenderer.on(IPC.OFFICE_CLI_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC.OFFICE_CLI_STATUS, handler)
    },
  },

  openOfficePreview: (filePath: string): Promise<OfficePreviewOpenResult> =>
    ipcRenderer.invoke(IPC.OFFICE_PREVIEW_OPEN, { filePath }),

  onOfficePreviewTrigger: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, fp: string): void => callback(fp)
    ipcRenderer.on(IPC.OFFICE_PREVIEW_TRIGGER, handler)
    return () => ipcRenderer.removeListener(IPC.OFFICE_PREVIEW_TRIGGER, handler)
  },

  skills: {
    list: (): Promise<SkillEntry[]> => ipcRenderer.invoke(IPC.SKILLS_LIST),
    get: (name: string, source?: string): Promise<string> => ipcRenderer.invoke(IPC.SKILLS_GET, { name, source }),
    save: (name: string, content: string, isFolder?: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SKILLS_SAVE, { name, content, isFolder }),
    delete: (name: string, isFolder: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SKILLS_DELETE, { name, isFolder }),
    openDir: (): Promise<void> => ipcRenderer.invoke(IPC.SKILLS_OPEN_DIR)
  },

  // Pet Agent
  pet: {
    ask: (payload: PetAskPayload): Promise<PetAskResult> =>
      ipcRenderer.invoke(IPC.PET_ASK, payload),
    gameComment: (payload: PetGameCommentPayload): Promise<PetAskResult> =>
      ipcRenderer.invoke(IPC.PET_GAME_COMMENT, payload),
    getLogs: (limit?: number): Promise<PetLogRecord[]> =>
      ipcRenderer.invoke(IPC.PET_LOG_LIST, { limit }),
    clearLogs: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.PET_LOG_CLEAR),
  },

  // Content Bank
  contentBank: {
    generate: (payload: ContentBankGeneratePayload): Promise<ContentBankGenerateResult> =>
      ipcRenderer.invoke(IPC.CONTENT_BANK_GENERATE, payload)
  },

  // Embedded browser for debugging
  browserView: {
    toggle: (): Promise<{ visible: boolean }> =>
      ipcRenderer.invoke('browser-view:toggle'),
    navigate: (url: string): Promise<{ success: boolean; url: string }> =>
      ipcRenderer.invoke('browser-view:navigate', url),
    // [2026-04-30] 设置浏览器面板宽度比例
    setRatio: (ratio: number): void =>
      ipcRenderer.send('browser-nav:set-ratio', ratio),
    onBrowserNavAction: (callback: (action: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, action: string): void => callback(action)
      ipcRenderer.on('browser-nav:action', handler)
      return () => ipcRenderer.removeListener('browser-nav:action', handler)
    },
    onBrowserNavNavigate: (callback: (url: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, url: string): void => callback(url)
      ipcRenderer.on('browser-nav:navigate', handler)
      return () => ipcRenderer.removeListener('browser-nav:navigate', handler)
    },
    onBrowserNavSetRatio: (callback: (ratio: number) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, ratio: number): void => callback(ratio)
      ipcRenderer.on('browser-nav:set-ratio', handler)
      return () => ipcRenderer.removeListener('browser-nav:set-ratio', handler)
    },
    onBrowserViewStateChanged: (callback: (state: { visible: boolean; width: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, state: { visible: boolean; width: number }): void => callback(state)
      ipcRenderer.on('browser-view:state-changed', handler)
      return () => ipcRenderer.removeListener('browser-view:state-changed', handler)
    },
    // [2026-05-01] 设置 Tools calls 面板宽度，浏览器需要在其左边布局
    setToolsPanelWidth: (width: number): void =>
      ipcRenderer.send('browser-view:set-tools-panel-width', width),
  },

  // Git Worktree
  git: {
    isRepo: (path: string): Promise<{ isRepo: boolean }> =>
      ipcRenderer.invoke(IPC.GIT_IS_REPO, { path }),
    branchList: (repoPath: string): Promise<GitBranchListResult> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_LIST, { repoPath }),
    branchDelete: (payload: { repoPath: string; branch: string; force?: boolean }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_DELETE, payload),
    worktreeList: (repoPath: string): Promise<GitWorktreeListResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_LIST, { repoPath }),
    worktreeCreate: (payload: GitWorktreeCreatePayload): Promise<GitWorktreeCreateResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_CREATE, payload),
    worktreeRemove: (payload: GitWorktreeRemovePayload): Promise<GitWorktreeRemoveResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, payload),
    mergeBranch: (payload: GitMergeBranchPayload): Promise<GitMergeBranchResult> =>
      ipcRenderer.invoke(IPC.GIT_MERGE_BRANCH, payload),
    updateWorktree: (payload: GitUpdateWorktreePayload): Promise<GitUpdateWorktreeResult> =>
      ipcRenderer.invoke(IPC.GIT_UPDATE_WORKTREE, payload),
    unmergedCommits: (payload: GitUnmergedCommitsPayload): Promise<GitUnmergedCommitsResult> =>
      ipcRenderer.invoke(IPC.GIT_UNMERGED_COMMITS, payload),
  },

  // Window controls
  appMinimize: (): void => ipcRenderer.send(IPC.APP_MINIMIZE),
  appMaximize: (): void => ipcRenderer.send(IPC.APP_MAXIMIZE),
  appClose: (): void => ipcRenderer.send(IPC.APP_CLOSE),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  getClaudeVersion: (): Promise<string | null> => ipcRenderer.invoke(IPC.APP_GET_CLAUDE_VERSION),

  whatsNew: {
    shouldShow: (): Promise<WhatsNewShouldShowResult> => ipcRenderer.invoke(IPC.APP_WHATS_NEW_SHOULD_SHOW),
    markSeen: (version?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.APP_WHATS_NEW_MARK_SEEN, { version })
  },

  openDevTools: (): void => ipcRenderer.send(IPC.APP_OPEN_DEVTOOLS),
  focusWindow: (): void => ipcRenderer.send(IPC.APP_FOCUS_WINDOW),

  // Notifications
  showNotification: (title: string, body: string): void =>
    ipcRenderer.send(IPC.NOTIFICATION_SHOW, { title, body }),

  // Auto Update
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: UpdateStatusPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler)
  },
  onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: UpdateProgressPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.UPDATE_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler)
  },
  checkForUpdates: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),

  // [2026-04-28] 测试验收
  test: {
    detectFramework: (workdir: string): Promise<TestFrameworkInfo> =>
      ipcRenderer.invoke(IPC.TEST_DETECT_FRAMEWORK, { workdir }),
    run: (sessionId: string, workdir: string, framework: TestFrameworkInfo): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.TEST_RUN, { sessionId, workdir, framework }),
    cancel: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.TEST_CANCEL, { sessionId }),
  },
  onTestOutput: (callback: (payload: TestOutputPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: TestOutputPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.TEST_OUTPUT, handler)
    return () => ipcRenderer.removeListener(IPC.TEST_OUTPUT, handler)
  },
  onTestStatus: (callback: (payload: TestStatusPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: TestStatusPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.TEST_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.TEST_STATUS, handler)
  },

  // [2026-05-01] 主进程拦截 Ctrl+Shift+C 后通知渲染进程执行复制
  onTerminalCopy: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('terminal:copy-selection', handler)
    return () => ipcRenderer.removeListener('terminal:copy-selection', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
