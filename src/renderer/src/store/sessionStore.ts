import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Session, HistoryRecord } from '../types/session'

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  history: HistoryRecord[]

  createSession: (workdir: string) => Promise<void>
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void

  updateSessionStatus: (sessionId: string, status: Session['status']) => void

  loadHistory: () => Promise<void>
  deleteHistory: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  history: [],

  createSession: async (workdir: string) => {
    const result = await window.electronAPI.createSession(workdir)
    const newSession: Session = {
      id: result.sessionId,
      title: workdir.split(/[/\\]/).pop() ?? workdir,
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

  updateSessionStatus: (sessionId: string, status: Session['status']) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, status } : sess
      )
    }))
  },

  loadHistory: async () => {
    const records = await window.electronAPI.history.list()
    set({ history: records ?? [] })
  },

  deleteHistory: async (id: string) => {
    await window.electronAPI.history.delete(id)
    set((s) => ({ history: s.history.filter((r) => r.id !== id) }))
  }
}))
