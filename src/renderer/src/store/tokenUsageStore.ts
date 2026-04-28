import { create } from 'zustand'

/** Per-pane token totals for the current claude conversation */
export interface SessionTokenTotals {
  /** Regular input tokens billed at full price */
  input: number
  /** Output tokens */
  output: number
  /** Cache-creation input tokens (written to cache, billed at 1.25×) */
  cacheCreate: number
  /** Cache-read input tokens (read from cache, billed at 0.1×) */
  cacheRead: number
}

export type TokenIngestMode = 'set' | 'add' | 'override'

interface TokenUsageStore {
  bySession: Record<string, SessionTokenTotals>

  /**
   * Ingest token counts from JSONL watcher (accurate) or regex fallback.
   *
   * set      — take per-field max (used by regex fallback, avoids decrements)
   * add      — accumulate per-turn deltas (used by JSONL watcher)
   * override — replace entirely (used by status-bar ↑↓ snapshot, avoids stale max)
   */
  ingest: (
    sessionId: string,
    input: number,
    output: number,
    mode: TokenIngestMode,
    extra?: { cacheCreate?: number; cacheRead?: number }
  ) => void

  clearSession: (sessionId: string) => void
  resetAll: () => void
}

const ZERO: SessionTokenTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }

export const useTokenUsageStore = create<TokenUsageStore>((set) => ({
  bySession: {},

  ingest: (sessionId, input, output, mode, extra) =>
    set((s) => {
      const cur = s.bySession[sessionId] ?? { ...ZERO }
      // [2026-04-28] Guard against NaN from corrupted JSONL data
      const safeInput = Number.isFinite(input) ? input : 0
      const safeOutput = Number.isFinite(output) ? output : 0
      const cacheCreate = Number.isFinite(extra?.cacheCreate) ? extra?.cacheCreate ?? 0 : 0
      const cacheRead = Number.isFinite(extra?.cacheRead) ? extra?.cacheRead ?? 0 : 0
      let next: SessionTokenTotals

      if (mode === 'override') {
        next = { input: safeInput, output: safeOutput, cacheCreate, cacheRead }
      } else if (mode === 'add') {
        next = {
          input: cur.input + safeInput,
          output: cur.output + safeOutput,
          cacheCreate: cur.cacheCreate + cacheCreate,
          cacheRead: cur.cacheRead + cacheRead
        }
      } else {
        // set — per-field max (regex fallback, only touches input/output)
        next = {
          input: Math.max(cur.input, safeInput),
          output: Math.max(cur.output, safeOutput),
          cacheCreate: Math.max(cur.cacheCreate, cacheCreate),
          cacheRead: Math.max(cur.cacheRead, cacheRead)
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
