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
}

export interface HistoryRecord {
  id: string
  title: string
  workdir: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}
