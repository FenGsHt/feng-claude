import type { HistoryRecord } from './session'
import type { ApiProfile } from './settings'

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
  APP_GET_VERSION: 'app:getVersion',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  /** 主进程广播 settings 变更，渲染层重新拉取 */
  SETTINGS_CHANGED: 'settings:changed',

  /** [2026-04-28] API Profile 管理 */
  PROFILE_ADD: 'profile:add',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_SET_ACTIVE: 'profile:setActive',
  PROFILE_GET_ACTIVE: 'profile:getActive',

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
  PET_LOG_LIST: 'pet:logList',
  PET_LOG_CLEAR: 'pet:logClear',

  /** 内容库生成：调用 API 生成笑话/技巧/新闻 */
  CONTENT_BANK_GENERATE: 'content-bank:generate',

  /** Git worktree 操作 */
  GIT_WORKTREE_LIST: 'git:worktreeList',
  GIT_WORKTREE_CREATE: 'git:worktreeCreate',
  GIT_WORKTREE_REMOVE: 'git:worktreeRemove',
  GIT_BRANCH_LIST: 'git:branchList',
  GIT_BRANCH_DELETE: 'git:branchDelete',
  GIT_IS_REPO: 'git:isRepo',
  GIT_MERGE_BRANCH: 'git:mergeBranch',
  GIT_UNMERGED_COMMITS: 'git:unmergedCommits',

  /** 自动更新状态 */
  UPDATE_STATUS: 'update:status',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',

  /** [2026-04-28] 测试验收 */
  TEST_DETECT_FRAMEWORK: 'test:detectFramework',
  TEST_RUN: 'test:run',
  TEST_OUTPUT: 'test:output',
  TEST_STATUS: 'test:status',
  TEST_CANCEL: 'test:cancel',
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
  /** [2026-04-28] 指定使用的 API profile ID（可选，默认使用全局激活的 profile）*/
  profileId?: string
}

/** [2026-04-23] 原仅有成功字段；PTY spawn 失败时 invoke 抛错导致渲染层大量未捕获 rejection，改为判别联合 */
export type SessionCreateResult = SessionCreateOk | SessionCreateErr

export interface SessionCreateOk {
  ok: true
  sessionId: string
  pid: number
  /** Resolved absolute workdir — always an absolute path, even if '.' was passed */
  workdir: string
  /** Base64-encoded raw terminal data from previous session in this workdir */
  scrollback?: string | null
  /** [2026-04-28] The profile ID used for this session */
  profileId?: string
}

export interface SessionCreateErr {
  ok: false
  error: string
  /** resolve 后的绝对路径，便于 UI 提示 */
  workdir: string
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
  petConfig: { name: string; personality: string; type?: string }
  triggerType?: 'auto' | 'manual' | 'pet' | 'content-bank'
  growth?: {
    level: number
    affection: number
    skills: Array<{ id: string; level: number }>
  }
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

export interface GitMergeBranchPayload {
  repoPath: string
  branch: string
  targetBranch?: string  // 合并到哪个分支，默认当前分支
}

export interface GitMergeBranchResult {
  success: boolean
  error?: string
}

export interface GitUnmergedCommitsPayload {
  repoPath: string
  branch: string
}

export interface GitUnmergedCommitsResult {
  count: number
  commits: Array<{ hash: string; message: string; author: string; date: string }>
  error?: string
}

// Pet Log
export interface PetLogRecord {
  id: string
  timestamp: number
  userMessage: string
  assistantMessage: string
  petName: string
  petType: string
  triggerType: 'auto' | 'manual' | 'pet' | 'content-bank'
}

// Auto update
export interface UpdateStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'downloaded' | 'error'
  version?: string
  releaseDate?: string
  releaseName?: string
  error?: string
}

export interface UpdateProgressPayload {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// [2026-04-28] API Profile 管理
export interface ProfileAddPayload {
  profile: ApiProfile
}

export interface ProfileUpdatePayload {
  profileId: string
  updates: Partial<ApiProfile>
}

export interface ProfileDeletePayload {
  profileId: string
}

export interface ProfileSetActivePayload {
  profileId: string
}

export interface ProfileResult {
  success: boolean
  error?: string
  profile?: ApiProfile
}

// [2026-04-28] 测试验收
export type TestFrameworkName = 'vitest' | 'jest' | 'playwright' | 'mocha' | 'none'

export interface TestFrameworkInfo {
  name: TestFrameworkName
  configFile?: string
  testCommand: string
  jsonReporterAvailable: boolean
}

export interface TestRunPayload {
  sessionId: string
  workdir: string
  framework: TestFrameworkInfo
}

export interface TestOutputPayload {
  sessionId: string
  data: string
  timestamp: number
}

export type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error'

export interface TestStatusPayload {
  sessionId: string
  status: TestStatus
  summary?: TestSummary
}

export interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  coverage?: TestCoverage
}

export interface TestCoverage {
  lines: number
  branches: number
  functions: number
  statements: number
}

export interface TestResultItem {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  error?: string
  file?: string
  line?: number
}
