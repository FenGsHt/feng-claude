/**
 * Global persistent token usage store.
 * - Survives session close and window restart (localStorage via zustand/middleware).
 * - Tracks all-time `total` and rolling `today` (auto-resets on calendar day change).
 * - Stores a configurable `budget` (token cap) for the progress bar.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TokenTotals {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
}

const ZERO: TokenTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
}

function add(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead
  }
}

/** Sum all token fields into a single number for budget comparison */
export function tokenSum(t: TokenTotals): number {
  return t.input + t.output + t.cacheCreate + t.cacheRead
}

interface GlobalTokenStore {
  total: TokenTotals
  today: TokenTotals
  /** YYYY-MM-DD of when `today` was last written — used to detect day rollover */
  todayDate: string
  /** Budget cap in tokens (0 = unlimited / no progress bar) */
  budget: number

  /** Accumulate a per-turn delta from the JSONL watcher */
  ingest: (delta: TokenTotals) => void
  setBudget: (n: number) => void
  resetTotal: () => void
}

export const useGlobalTokenStore = create<GlobalTokenStore>()(
  persist(
    (set) => ({
      total: { ...ZERO },
      today: { ...ZERO },
      todayDate: todayStr(),
      budget: 0,

      ingest: (delta) =>
        set((s) => {
          const now = todayStr()
          const today =
            s.todayDate === now
              ? add(s.today, delta) // same day — accumulate
              : { ...delta } // new day — start fresh
          return {
            total: add(s.total, delta),
            today,
            todayDate: now
          }
        }),

      setBudget: (n) => set({ budget: Math.max(0, n) }),

      resetTotal: () =>
        set({ total: { ...ZERO }, today: { ...ZERO }, todayDate: todayStr() })
    }),
    { name: 'global-token-usage' }
  )
)
