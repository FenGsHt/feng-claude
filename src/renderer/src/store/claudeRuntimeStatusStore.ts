import { create } from 'zustand'

export interface ClaudeRuntimeStatus {
  label: string
  detail?: string
  updatedAt: number
}

interface State {
  bySession: Record<string, ClaudeRuntimeStatus>
  setRuntimeStatus: (sessionId: string, status: Omit<ClaudeRuntimeStatus, 'updatedAt'>) => void
  touchRuntimeStatus: (sessionId: string) => void
  clearRuntimeStatus: (sessionId: string) => void
}

export const useClaudeRuntimeStatusStore = create<State>((set) => ({
  bySession: {},
  setRuntimeStatus: (sessionId, status) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: {
          ...status,
          updatedAt: Date.now()
        }
      }
    })),
  touchRuntimeStatus: (sessionId) =>
    set((s) => {
      const prev = s.bySession[sessionId]
      if (!prev) return s
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...prev,
            updatedAt: Date.now()
          }
        }
      }
    }),
  clearRuntimeStatus: (sessionId) =>
    set((s) => {
      const { [sessionId]: _removed, ...rest } = s.bySession
      return { bySession: rest }
    })
}))
