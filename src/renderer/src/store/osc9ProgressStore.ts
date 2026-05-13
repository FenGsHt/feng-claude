import { create } from 'zustand'

/** OSC 9;4 progress bar state per session */
interface Osc9ProgressEntry {
  percent: number
  message?: string
  updatedAt: number
}

interface Osc9ProgressState {
  bySession: Record<string, Osc9ProgressEntry | undefined>
  setProgress: (sessionId: string, percent: number, message?: string) => void
  clearProgress: (sessionId: string) => void
}

export const useOsc9ProgressStore = create<Osc9ProgressState>((set) => ({
  bySession: {},
  setProgress: (sessionId: string, percent: number, message?: string) => {
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: { percent, message, updatedAt: Date.now() }
      }
    }))
  },
  clearProgress: (sessionId: string) => {
    set((s) => {
      const next = { ...s.bySession }
      delete next[sessionId]
      return { bySession: next }
    })
  }
}))
