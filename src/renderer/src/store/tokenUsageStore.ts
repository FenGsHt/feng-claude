import { create } from 'zustand'

/** 每个终端会话（窗格）独立的 token 累计 */
export interface SessionTokenTotals {
  input: number
  output: number
}

export type TokenIngestMode = 'set' | 'add' | 'override'

interface TokenUsageStore {
  bySession: Record<string, SessionTokenTotals>
  /**
   * set — 与各来源匹配值取 max（累计口径）
   * add — 增量叠加
   * override — 直接覆盖（的状态栏 ↑↓ 尾部快照，避免与滚动区误匹配取 max）
   */
  ingest: (sessionId: string, input: number, output: number, mode: TokenIngestMode) => void
  clearSession: (sessionId: string) => void
  resetAll: () => void
}

export const useTokenUsageStore = create<TokenUsageStore>((set) => ({
  bySession: {},
  ingest: (sessionId, input, output, mode) =>
    set((s) => {
      const cur = s.bySession[sessionId] ?? { input: 0, output: 0 }
      let next: SessionTokenTotals
      if (mode === 'override') {
        next = { input, output }
      } else if (mode === 'add') {
        next = { input: cur.input + input, output: cur.output + output }
      } else {
        next = {
          input: Math.max(cur.input, input),
          output: Math.max(cur.output, output)
        }
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
