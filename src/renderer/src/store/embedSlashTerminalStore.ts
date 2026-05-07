import { create } from 'zustand'

interface State {
  visibleBySession: Record<string, boolean>
  show: (sessionId: string) => void
  hide: (sessionId: string) => void
}

export const useEmbedSlashTerminalStore = create<State>((set) => ({
  visibleBySession: {},
  show: (sessionId) =>
    set((s) => ({ visibleBySession: { ...s.visibleBySession, [sessionId]: true } })),
  hide: (sessionId) =>
    set((s) => ({ visibleBySession: { ...s.visibleBySession, [sessionId]: false } }))
}))
