import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Session, Message, HistoryRecord } from '../types/session'
import { parseClaudeOutput, extractTitle } from '../utils/claudeParser'

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  history: HistoryRecord[]

  // Session management
  createSession: (workdir: string) => Promise<void>
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void
  getActiveSession: () => Session | undefined

  // PTY data
  appendRawOutput: (sessionId: string, raw: string, timestamp: number) => void
  updateSessionStatus: (sessionId: string, status: Session['status']) => void

  // Messaging
  sendMessage: (sessionId: string, text: string) => void

  // History
  loadHistory: () => Promise<void>
  saveToHistory: (sessionId: string) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  restoreFromHistory: (record: HistoryRecord) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  history: [],

  createSession: async (workdir: string) => {
    const result = await window.electronAPI.createSession(workdir)
    const newSession: Session = {
      id: result.sessionId,
      title: 'New Session',
      workdir,
      status: 'running',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ptyPid: result.pid
    }
    set((s) => ({
      sessions: [...s.sessions, newSession],
      activeSessionId: result.sessionId
    }))
  },

  closeSession: (id: string) => {
    window.electronAPI.closeSession(id)
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id)
      const newActive =
        s.activeSessionId === id
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s.activeSessionId
      return { sessions: remaining, activeSessionId: newActive }
    })
  },

  setActiveSession: (id: string) => set({ activeSessionId: id }),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId)
  },

  appendRawOutput: (sessionId: string, raw: string, timestamp: number) => {
    const chunks = parseClaudeOutput(raw)
    if (chunks.length === 0) return

    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess

        let messages = [...sess.messages]
        let status = sess.status

        for (const chunk of chunks) {
          if (chunk.type === 'prompt_ready') {
            // Mark last streaming message as done
            messages = messages.map((m) =>
              m.status === 'streaming' ? { ...m, status: 'done' as const } : m
            )
            status = 'waiting_input'
          } else if (chunk.type === 'clear') {
            // ignore clear sequences
          } else if (chunk.type === 'text' || chunk.type === 'tool_use') {
            const content = chunk.content
            const lastMsg = messages[messages.length - 1]

            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'streaming') {
              // Append to existing streaming message
              messages = [
                ...messages.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + content, rawAnsi: (lastMsg.rawAnsi ?? '') + raw }
              ]
            } else {
              // Start a new assistant message
              messages = [
                ...messages,
                {
                  id: uuidv4(),
                  sessionId,
                  role: 'assistant' as const,
                  content,
                  rawAnsi: raw,
                  status: 'streaming' as const,
                  createdAt: timestamp
                }
              ]
            }
            status = 'running'
          }
        }

        return { ...sess, messages, status, updatedAt: timestamp }
      })
    }))
  },

  updateSessionStatus: (sessionId: string, status: Session['status']) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, status } : sess
      )
    }))
  },

  sendMessage: (sessionId: string, text: string) => {
    if (!text.trim()) return

    const userMsg: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: text,
      status: 'done',
      createdAt: Date.now()
    }

    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess
        const isFirstMessage = sess.messages.filter((m) => m.role === 'user').length === 0
        return {
          ...sess,
          messages: [...sess.messages, userMsg],
          title: isFirstMessage ? extractTitle(text) : sess.title,
          status: 'running' as const,
          updatedAt: Date.now()
        }
      })
    }))

    window.electronAPI.sendInput(sessionId, text + '\r')
  },

  loadHistory: async () => {
    const records = await window.electronAPI.history.list()
    set({ history: records ?? [] })
  },

  saveToHistory: async (sessionId: string) => {
    const session = get().sessions.find((s) => s.id === sessionId)
    if (!session) return

    const record: HistoryRecord = {
      id: uuidv4(),
      title: session.title,
      workdir: session.workdir,
      messages: session.messages.map((m) => ({ ...m, status: 'done' as const })),
      createdAt: session.createdAt,
      updatedAt: Date.now()
    }

    await window.electronAPI.history.save(record)
    set((s) => ({ history: [record, ...s.history] }))
  },

  deleteHistory: async (id: string) => {
    await window.electronAPI.history.delete(id)
    set((s) => ({ history: s.history.filter((r) => r.id !== id) }))
  },

  restoreFromHistory: (record: HistoryRecord) => {
    set((s) => {
      const existing = s.sessions.find((sess) => sess.id === record.id)
      if (existing) return { activeSessionId: record.id }

      const restored: Session = {
        id: record.id,
        title: record.title,
        workdir: record.workdir,
        status: 'idle',
        messages: record.messages,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }

      return {
        sessions: [...s.sessions, restored],
        activeSessionId: record.id
      }
    })
  }
}))
