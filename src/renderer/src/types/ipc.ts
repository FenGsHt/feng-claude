import type { HistoryRecord } from './session'

export const IPC = {
  SESSION_CREATE: 'session:create',
  SESSION_CLOSE: 'session:close',
  SESSION_LIST: 'session:list',

  PTY_INPUT: 'pty:input',
  PTY_OUTPUT: 'pty:output',
  PTY_RESIZE: 'pty:resize',
  PTY_STATUS: 'pty:status',

  WORKDIR_OPEN_DIALOG: 'workdir:openDialog',
  /** 与 SESSION_CREATE 一致，将路径 resolve 为绝对路径，供侧栏历史「同目录复用标签」比对 */
  WORKDIR_RESOLVE_MANY: 'workdir:resolveMany',
  WORKDIR_CHANGE: 'workdir:change',

  FS_READ_TREE: 'fs:readTree',
  FS_WATCH_START: 'fs:watchStart',
  FS_WATCH_STOP: 'fs:watchStop',
  FS_CHANGED: 'fs:changed',

  HISTORY_LIST: 'history:list',
  HISTORY_SAVE: 'history:save',
  HISTORY_DELETE: 'history:delete',
  HISTORY_GET: 'history:get',

  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  WORKSPACE_SAVE: 'workspace:save',
  WORKSPACE_LOAD: 'workspace:load',

  TOKEN_USAGE_UPDATE: 'token-usage:update',
  TOOL_CALL_UPDATE: 'tool-call:update',

  /** 主进程同步读剪贴板文本，供终端 Ctrl+V 注入（避免渲染进程剪贴板 API 失效） */
  CLIPBOARD_READ_TEXT_SYNC: 'clipboard:readTextSync',

  PLUGIN_LIST: 'plugin:list',
  PLUGIN_SET_ENABLED: 'plugin:setEnabled',
  PLUGIN_REFRESH: 'plugin:refresh',

  TOKEN_DATA_GET: 'token-data:get',
  TOKEN_DATA_SET: 'token-data:set',

  MCP_LIST: 'mcp:list',
  MCP_ADD: 'mcp:add',
  MCP_REMOVE: 'mcp:remove',
  MCP_SET_ENABLED: 'mcp:setEnabled',
  MCP_UPDATE: 'mcp:update',

  SKILLS_LIST: 'skills:list',
  SKILLS_GET: 'skills:get',
  SKILLS_SAVE: 'skills:save',
  SKILLS_DELETE: 'skills:delete',
  SKILLS_OPEN_DIR: 'skills:openDir',

  /** 主进程显示系统通知 */
  NOTIFICATION_SHOW: 'notification:show',

  /** 宠物 Agent：调用 Anthropic API 返回建议 */
  PET_ASK: 'pet:ask',

  /** 内容库生成：调用 API 生成笑话/技巧/新闻 */
  CONTENT_BANK_GENERATE: 'content-bank:generate',

  /** Git worktree 操作 */
  GIT_WORKTREE_LIST: 'git:worktreeList',
  GIT_WORKTREE_CREATE: 'git:worktreeCreate',
  GIT_WORKTREE_REMOVE: 'git:worktreeRemove',
  GIT_BRANCH_LIST: 'git:branchList',
  GIT_IS_REPO: 'git:isRepo',
} as const

export interface SkillEntry {
  name: string
  title: string
  description: string
  isFolder: boolean
  filePath: string
  updatedAt: number
}

export type McpServerType = 'stdio' | 'sse'

export interface McpServerConfig {
  type?: McpServerType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface McpEntry {
  name: string
  type: McpServerType
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  isEnabled: boolean
}

export interface PluginEntry {
  id: string
  name: string
  marketplace: string
  description: string
  installCount: number
  isEnabled: boolean
  isInstalled: boolean
}

export interface TokenUsageUpdatePayload {
  sessionId: string
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  /** true = new claude conversation detected; renderer should reset counter first */
  reset: boolean
}

export interface SessionCreatePayload {
  workdir: string
  resume?: boolean
}

export interface SessionCreateResult {
  sessionId: string
  pid: number
  /** Resolved absolute workdir — always an absolute path, even if '.' was passed */
  workdir: string
  /** Base64-encoded raw terminal data from previous session in this workdir */
  scrollback?: string | null
}

export interface PtyInputPayload {
  sessionId: string
  data: string
}

export interface PtyOutputPayload {
  sessionId: string
  data: string
  timestamp: number
}

export interface PtyResizePayload {
  sessionId: string
  cols: number
  rows: number
}

export interface PtyStatusPayload {
  sessionId: string
  status: 'idle' | 'running' | 'exited' | 'error'
  exitCode?: number
}

export interface WorkdirChangePayload {
  sessionId: string
  workdir: string
}

export interface FsReadTreePayload {
  dirPath: string
  depth?: number
}

export interface HistorySavePayload {
  record: HistoryRecord
}

export interface ToolCallPayload {
  sessionId: string
  toolId: string
  name: string
  input: Record<string, unknown>
  timestamp: number
}

export interface PetAskPayload {
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  petConfig: { name: string; personality: string }
}

export interface PetAskResult {
  text?: string
  error?: string
  usage?: {
    input: number
    output: number
    cacheCreate: number
    cacheRead: number
  }
}

export type ContentCategory = 'chitchat' | 'joke' | 'news' | 'tip'

export interface ContentBankGeneratePayload {
  category: ContentCategory
  count: number
}

export interface ContentBankGenerateResult {
  items: string[]
  error?: string
}

// Git worktree
export interface GitWorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

export interface GitWorktreeListResult {
  worktrees: GitWorktreeInfo[]
  mainPath: string
  error?: string
}

export interface GitWorktreeCreatePayload {
  mainRepoPath: string
  branchName: string
  worktreePath?: string  // 可选，默认自动生成
  createBranch?: boolean  // 是否创建新分支
  baseBranch?: string    // 新分支基于哪个分支
}

export interface GitWorktreeCreateResult {
  worktreePath: string
  branch: string
  error?: string
}

export interface GitWorktreeRemovePayload {
  worktreePath: string
  force?: boolean
}

export interface GitWorktreeRemoveResult {
  success: boolean
  error?: string
}

export interface GitBranchListResult {
  branches: Array<{ name: string; isCurrent: boolean; isRemote: boolean }>
  currentBranch: string
  error?: string
}
