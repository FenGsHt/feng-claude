import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { PtyOutputPayload, PtyStatusPayload, SessionCreateResult, ToolCallPayload } from '../renderer/src/types/ipc'
import type { FileTreeNode } from '../renderer/src/types/fs'
import type { HistoryRecord } from '../renderer/src/types/session'
import type { ClaudeSettings, ApiProfile } from '../renderer/src/types/settings'
import type { PersistedWorkspace } from '../renderer/src/types/workspace'
import type { TokenUsageUpdatePayload, PluginEntry, McpEntry, McpServerConfig, SkillEntry, PetAskPayload, PetAskResult, ContentBankGeneratePayload, ContentBankGenerateResult, GitWorktreeListResult, GitWorktreeCreatePayload, GitWorktreeCreateResult, GitWorktreeRemovePayload, GitWorktreeRemoveResult, GitBranchListResult, GitMergeBranchPayload, GitMergeBranchResult, GitUnmergedCommitsPayload, GitUnmergedCommitsResult, PetLogRecord, UpdateStatusPayload, UpdateProgressPayload, ProfileAddPayload, ProfileUpdatePayload, ProfileDeletePayload, ProfileSetActivePayload, ProfileResult } from '../renderer/src/types/ipc'

const electronAPI = {
  readClipboardTextSync: (): string => {
    const v = ipcRenderer.sendSync(IPC.CLIPBOARD_READ_TEXT_SYNC)
    return typeof v === 'string' ? v : ''
  },

  // Session
  createSession: (workdir: string, resume?: boolean): Promise<SessionCreateResult> =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { workdir, resume }),

  closeSession: (sessionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SESSION_CLOSE, { sessionId }),

  // PTY
  sendInput: (sessionId: string, data: string): void =>
    ipcRenderer.send(IPC.PTY_INPUT, { sessionId, data }),

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

  // Working directory
  openDirDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC.WORKDIR_OPEN_DIALOG),

  resolveWorkdirMany: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke(IPC.WORKDIR_RESOLVE_MANY, { paths }),

  // File system
  readFileTree: (dirPath: string, depth?: number): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke(IPC.FS_READ_TREE, { dirPath, depth }),

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

  skills: {
    list: (): Promise<SkillEntry[]> => ipcRenderer.invoke(IPC.SKILLS_LIST),
    get: (name: string): Promise<string> => ipcRenderer.invoke(IPC.SKILLS_GET, { name }),
    save: (name: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SKILLS_SAVE, { name, content }),
    delete: (name: string, isFolder: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SKILLS_DELETE, { name, isFolder }),
    openDir: (): Promise<void> => ipcRenderer.invoke(IPC.SKILLS_OPEN_DIR)
  },

  // Pet Agent
  pet: {
    ask: (payload: PetAskPayload): Promise<PetAskResult> =>
      ipcRenderer.invoke(IPC.PET_ASK, payload),
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

  // Git Worktree
  git: {
    isRepo: (path: string): Promise<{ isRepo: boolean }> =>
      ipcRenderer.invoke(IPC.GIT_IS_REPO, { path }),
    branchList: (repoPath: string): Promise<GitBranchListResult> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_LIST, { repoPath }),
    worktreeList: (repoPath: string): Promise<GitWorktreeListResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_LIST, { repoPath }),
    worktreeCreate: (payload: GitWorktreeCreatePayload): Promise<GitWorktreeCreateResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_CREATE, payload),
    worktreeRemove: (payload: GitWorktreeRemovePayload): Promise<GitWorktreeRemoveResult> =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, payload),
    mergeBranch: (payload: GitMergeBranchPayload): Promise<GitMergeBranchResult> =>
      ipcRenderer.invoke(IPC.GIT_MERGE_BRANCH, payload),
    unmergedCommits: (payload: GitUnmergedCommitsPayload): Promise<GitUnmergedCommitsResult> =>
      ipcRenderer.invoke(IPC.GIT_UNMERGED_COMMITS, payload),
  },

  // Window controls
  appMinimize: (): void => ipcRenderer.send(IPC.APP_MINIMIZE),
  appMaximize: (): void => ipcRenderer.send(IPC.APP_MAXIMIZE),
  appClose: (): void => ipcRenderer.send(IPC.APP_CLOSE),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),

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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
