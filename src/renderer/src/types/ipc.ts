import type { HistoryRecord } from './session'
import type { ApiProfile, TelegramChannelSessionConfig } from './settings'

export const IPC = {
  SESSION_CREATE: 'session:create',
  SESSION_CLOSE: 'session:close',
  SESSION_LIST: 'session:list',

  PTY_INPUT: 'pty:input',
  /** [2026-05-12] 调试：主进程回执本次 sendInput 是否真正写入 PTY/daemon */
  PTY_INPUT_ACK: 'pty:inputAck',
  PTY_OUTPUT: 'pty:output',
  PTY_RESIZE: 'pty:resize',
  PTY_STATUS: 'pty:status',
  /** [2026-05-08] 任意路径向 PTY 写入含 Ctrl+C 的字节时广播，供外嵌输入框恢复上次普通提问 */
  PTY_INTR_SENT: 'pty:intrSent',

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
  /** [2026-05-08] 当前安装版本是否尚未展示过「新版本介绍」 */
  APP_WHATS_NEW_SHOULD_SHOW: 'app:whatsNewShouldShow',
  /** [2026-05-08] 用户关闭介绍后记下版本号 */
  APP_WHATS_NEW_MARK_SEEN: 'app:whatsNewMarkSeen',

  /** [2026-04-29] 打开 Chrome DevTools（开发者模式用） */
  APP_OPEN_DEVTOOLS: 'app:openDevTools',

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
  /** [2026-05-06] Beta：Claude Code 会话 JSONL 解析后的对话条目（仅设置 embedClaudeOutputBeta 时主进程推送） */
  CLAUDE_TRANSCRIPT_UPDATE: 'claude-transcript:update',

  /** 主进程同步读剪贴板文本，供终端 Ctrl+V 注入（避免渲染进程剪贴板 API 失效） */
  CLIPBOARD_READ_TEXT_SYNC: 'clipboard:readTextSync',
  /** 主进程写剪贴板，供终端 Ctrl+Shift+C 复制 */
  CLIPBOARD_WRITE_TEXT: 'clipboard:writeText',
  /** [2026-05-10] 渲染进程传入 base64 图片数据，主进程存临时文件返回路径 */
  CLIPBOARD_SAVE_IMAGE: 'clipboard:saveImage',
  /** [2026-05-10] 删除临时文件（如图片附件发送后清理） */
  FS_DELETE_FILE: 'fs:deleteFile',
  /** [2026-05-12] 在系统文件管理器中打开文件/目录 */
  FS_REVEAL_FILE: 'fs:revealFile',

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
  /** 宠物游戏点评：调用 API 对玩家游戏决策生成点评 */
  PET_GAME_COMMENT: 'pet:gameComment',
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
  GIT_UPDATE_WORKTREE: 'git:updateWorktree',
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

  /** [2026-05-06] 检测本机可用 shell 列表 */
  SHELL_DETECT: 'shell:detect',
  /** [2026-05-08] 检测 Claude Code Telegram Channel 可用性 */
  TELEGRAM_CHANNEL_CHECK: 'telegram:channelCheck',

  /** [2026-05-12] OfficeCLI 内置 MCP：状态推送 / 查询 / 触发更新 */
  OFFICE_CLI_STATUS: 'officeCli:status',
  OFFICE_CLI_GET_STATUS: 'officeCli:getStatus',
  OFFICE_CLI_CHECK_UPDATE: 'officeCli:checkUpdate',

  OFFICE_PREVIEW_OPEN: 'office:preview:open',
  OFFICE_PREVIEW_TRIGGER: 'office:preview:trigger', // [2026-05-12] HTTP MCP → renderer push event

  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_OPEN_FILE_DIALOG: 'fs:openFileDialog',
} as const

export interface ShellOption {
  name: string
  path: string
}

export interface ShellDetectResult {
  shells: ShellOption[]
  tmuxAvailable: boolean
}

export interface TelegramChannelCheckResult {
  claudeVersion?: string
  pluginCommand: boolean
  channelsFlag: boolean
  telegramPluginInstalled: boolean
  error?: string
}

/** [2026-05-08] 主进程：当前安装版本是否尚未展示过「新版本介绍」 */
export interface WhatsNewShouldShowResult {
  show: boolean
  version: string
}

export interface SkillEntry {
  name: string
  title: string
  description: string
  isFolder: boolean
  filePath: string
  updatedAt: number
  /** Source directory: 'global' ( ~/.claude/commands) or 'extra' (sharedSkillAddDir) */
  source?: string
}

export type McpServerType = 'stdio' | 'sse' | 'streamable-http'

export interface McpServerConfig {
  /** stdio / sse use "type"; streamable-http uses "transport" per Claude Code spec */
  type?: McpServerType
  transport?: McpServerType
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
  /** [2026-05-06] true 时仅打开 Shell，不自动启动 Claude Code */
  shellOnly?: boolean
  /** [2026-05-08] 官方 Telegram Channel 每会话配置 */
  telegramChannel?: TelegramChannelSessionConfig
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
  /** [2026-05-08] Effective Telegram Channel config used for this session */
  telegramChannel?: TelegramChannelSessionConfig
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
  /** [2026-05-12] 调试链路：把一次发送和 ACK/后续输出关联起来 */
  traceId?: string
}

export interface PtyInputAckPayload {
  sessionId: string
  ok: boolean
  via?: 'daemon' | 'pty'
  bytes: number
  reason?: string
  /** [2026-05-12] 与 PtyInputPayload.traceId 对应 */
  traceId?: string
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

export interface PtyIntrSentPayload {
  sessionId: string
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

/** [2026-05-06] 外嵌 Beta：来自 ~/.claude/projects/.../*.jsonl 的结构化条目 */
export type ClaudeTranscriptEntryKind =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool'
  | 'history'
  | 'event'

/** 单条 assistant JSONL 上的 `message.usage`（本条回复的 token） */
export interface ClaudeTurnTokenUsage {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
}

export interface ClaudeTranscriptEntry {
  kind: ClaudeTranscriptEntryKind
  text: string
  messageId?: string
  /** [2026-05-06] 外嵌输入框乐观追加；JSONL 回落同一用户行时用服务端条目替换 */
  clientEcho?: boolean
  /** [2026-05-06] 外嵌模式 PTY 去 ANSI 后的流式块，便于与 JSONL 的 event 区分并合并 */
  ptyEcho?: boolean
  /** [2026-05-06] 本段助手内容对应 API 的 usage，展示在气泡底部 */
  usage?: ClaudeTurnTokenUsage
  /** [2026-05-06] 外嵌：从用户发送到本条助手首段出现在转录的耗时（ms） */
  latencyMs?: number
  /** [2026-05-07] 外嵌无法完整承载的交互工具（如 AskUserQuestion），需切回原生终端处理 */
  requiresNativeTerminal?: boolean
  toolName?: string
  /** [2026-05-11] tool_use 块的 Claude API ID，用于在外嵌界面关联 ToolCallStore 获取 input */
  toolId?: string
  /** [2026-05-11] tool_use 块的 input 数据，直接随 transcript 条目携带，避免依赖 toolCallStore 历史查找 */
  toolInput?: Record<string, unknown>
}

export interface ClaudeTranscriptPayload {
  sessionId: string
  entries: ClaudeTranscriptEntry[]
  /** true = 全量替换（含历史 JSONL 回填），默认 false 为增量追加 */
  replace?: boolean
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

export interface PetGameCommentPayload {
  petConfig: { name: string; personality: string; type?: string }
  growth?: {
    level: number
    affection: number
    skills: Array<{ id: string; level: number }>
  }
  decisions: string[]
  outcome: 'win' | 'lose' | 'push'
  pnlDelta: number
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
  repoPath: string
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

export interface GitUpdateWorktreePayload {
  worktreePath: string  // worktree 目录路径
  sourceBranch: string  // 从哪个分支拉取更新（当前分支）
}

export interface GitUpdateWorktreeResult {
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


export interface OfficeCLIStatus {
  installed: boolean
  version: string | null
  latestVersion: string | null
  checking: boolean
  downloading: boolean
  progress: number
  error: string | null
}

export interface OfficePreviewOpenPayload {
  filePath: string
}

export interface OfficePreviewOpenResult {
  success: boolean
  buffer?: ArrayBuffer
  html?: string // [2026-05-12] PPTX 预渲染 HTML（走 office-cli SVG）
  error?: string
}
