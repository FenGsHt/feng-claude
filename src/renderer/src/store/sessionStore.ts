import { create } from 'zustand'
import type { Session, HistoryRecord } from '../types/session'
import type { PaneNode, CreateSessionMode } from '../types/paneLayout'
import {
  collectLeafSessionIds,
  removeSessionFromLayout,
  replaceLeafWithSplit
} from '../lib/paneLayout'
import { destroyTerminal } from '../components/terminal/XTerminal'

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  /** [2026-04-23] 主区域多分屏布局；与 tabs 中 session 对应，切换 tab 到未入屏会话时会暂退为单屏 */
  layoutRoot: PaneNode | null
  history: HistoryRecord[]

  createSession: (workdir: string, mode?: CreateSessionMode) => Promise<void>
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void

  updateSessionStatus: (sessionId: string, status: Session['status']) => void

  loadHistory: () => Promise<void>
  deleteHistory: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  layoutRoot: null,
  history: [],

  createSession: async (workdir: string, mode: CreateSessionMode = 'fullscreen') => {
    const state = get()
    const cwd =
      mode !== 'fullscreen' && state.activeSessionId
        ? state.sessions.find((x) => x.id === state.activeSessionId)?.workdir ?? workdir
        : workdir

    const result = await window.electronAPI.createSession(cwd)
    const newSession: Session = {
      id: result.sessionId,
      title: cwd.split(/[/\\]/).pop() ?? cwd,
      workdir: cwd,
      status: 'running',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ptyPid: result.pid
    }

    set((s) => {
      let layoutRoot = s.layoutRoot

      if (mode === 'fullscreen') {
        layoutRoot = { type: 'leaf', sessionId: result.sessionId }
      } else if (!layoutRoot) {
        layoutRoot = { type: 'leaf', sessionId: result.sessionId }
      } else if (mode === 'split-right' && s.activeSessionId) {
        layoutRoot =
          replaceLeafWithSplit(layoutRoot, s.activeSessionId, 'horizontal', result.sessionId) ??
          ({ type: 'leaf', sessionId: result.sessionId } satisfies PaneNode)
      } else if (mode === 'split-down' && s.activeSessionId) {
        layoutRoot =
          replaceLeafWithSplit(layoutRoot, s.activeSessionId, 'vertical', result.sessionId) ??
          ({ type: 'leaf', sessionId: result.sessionId } satisfies PaneNode)
      }

      return {
        sessions: [...s.sessions, newSession],
        activeSessionId: result.sessionId,
        layoutRoot
      }
    })
  },

  closeSession: (id: string) => {
    destroyTerminal(id)
    window.electronAPI.closeSession(id)
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id)
      let layoutRoot = s.layoutRoot ? removeSessionFromLayout(s.layoutRoot, id) : null
      if (layoutRoot === null && remaining.length > 0) {
        layoutRoot = { type: 'leaf', sessionId: remaining[remaining.length - 1].id }
      }

      const newActive =
        s.activeSessionId === id
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s.activeSessionId

      return { sessions: remaining, activeSessionId: newActive, layoutRoot }
    })
  },

  setActiveSession: (id: string) => {
    set((s) => {
      const ids = s.layoutRoot ? collectLeafSessionIds(s.layoutRoot) : []
      if (!s.layoutRoot || !ids.includes(id)) {
        return {
          activeSessionId: id,
          layoutRoot: { type: 'leaf', sessionId: id }
        }
      }
      return { activeSessionId: id }
    })
  },

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
