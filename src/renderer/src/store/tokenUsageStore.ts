import { create } from 'zustand'

/** 每个终端会话（窗格）独立的 token 累计 */
export interface SessionTokenTotals {
  input: number
  output: number
}

interface TokenUsageStore {
  bySession: Record<string, SessionTokenTotals>
  /** mode: set — 取较大值（CLI 打印累计值）；add — 叠加增量行 */
  ingest: (sessionId: string, input: number, output: number, mode: 'set' | 'add') => void
  clearSession: (sessionId: string) => void
  resetAll: () => void
}

export const useTokenUsageStore = create<TokenUsageStore>((set) => ({
  bySession: {},
  ingest: (sessionId, input, output, mode) =>
    set((s) => {
      const cur = s.bySession[sessionId] ?? { input: 0, output: 0 }
      const next =
        mode === 'add'
          ? { input: cur.input + input, output: cur.output + output }
          : {
              input: Math.max(cur.input, input),
              output: Math.max(cur.output, output)
            }
      return { bySession: { ...s.bySession, [sessionId]: next } }
    }),
  clearSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.bySession
      return { bySession: rest }
    }),
  resetAll: () => set({ bySession: {} })
}))
