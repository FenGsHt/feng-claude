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
  APP_CLOSE: 'app:close'
} as const

export interface SessionCreatePayload {
  workdir: string
}

export interface SessionCreateResult {
  sessionId: string
  pid: number
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
