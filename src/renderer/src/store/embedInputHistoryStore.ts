import { create } from 'zustand'

const MAX_HISTORY = 50

interface EmbedInputHistoryState {
  bySession: Record<string, string[]>
  pushHistory: (sessionId: string, text: string) => void
}

export const useEmbedInputHistoryStore = create<EmbedInputHistoryState>((set) => ({
  bySession: {},
  pushHistory: (sessionId, text) => {
    const clean = text.trimEnd()
    if (!clean.trim()) return
    set((s) => {
      const prev = s.bySession[sessionId] ?? []
      const withoutDuplicateTail = prev[prev.length - 1] === clean ? prev.slice(0, -1) : prev
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: [...withoutDuplicateTail, clean].slice(-MAX_HISTORY)
        }
      }
    })
  }
}))
