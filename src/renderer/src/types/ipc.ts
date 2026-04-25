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
  CLIPBOARD_READ_TEXT_SYNC: 'clipboard:readTextSync'
} as const

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
