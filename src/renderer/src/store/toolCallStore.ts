import { create } from 'zustand'

export interface ToolCallEntry {
  id: string
  sessionId: string
  name: string
  input: Record<string, unknown>
  timestamp: number
}

const MAX_CALLS = 200

interface ToolCallStore {
  calls: ToolCallEntry[]
  selected: ToolCallEntry | null
  addCall: (call: ToolCallEntry) => void
  clearSession: (sessionId: string) => void
  select: (call: ToolCallEntry | null) => void
}

export const useToolCallStore = create<ToolCallStore>((set) => ({
  calls: [],
  selected: null,

  addCall: (call) =>
    set((s) => ({
      calls: [call, ...s.calls].slice(0, MAX_CALLS)
    })),

  clearSession: (sessionId) =>
    set((s) => ({
      calls: s.calls.filter((c) => c.sessionId !== sessionId),
      selected: s.selected?.sessionId === sessionId ? null : s.selected
    })),

  select: (call) => set({ selected: call })
}))
