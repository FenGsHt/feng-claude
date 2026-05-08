import type { TelegramChannelSessionConfig } from './settings'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_result'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'
export type SessionStatus = 'idle' | 'running' | 'waiting_input' | 'error' | 'exited'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'running' | 'done' | 'error'
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  rawAnsi?: string
  toolCalls?: ToolCall[]
  status: MessageStatus
  createdAt: number
}

export interface Session {
  id: string
  title: string
  workdir: string
  status: SessionStatus
  messages: Message[]
  createdAt: number
  updatedAt: number
  ptyPid?: number
  /** [2026-04-28] 该 session 使用的 API profile ID（null 表示使用全局激活的 profile）*/
  profileId?: string | null
  /** [2026-05-06] 纯 Shell 会话：不自动启动 Claude Code */
  shellOnly?: boolean
  /** [2026-05-08] 官方 Telegram Channel：每会话独立 token/stateDir */
  telegramChannel?: TelegramChannelSessionConfig
}

export interface HistoryRecord {
  id: string
  title: string
  workdir: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  /** 侧栏右键设置，列表优先展示 */
  topic?: string
  /** 终端最近一次完整提交行（自动） */
  lastUserPrompt?: string
}
