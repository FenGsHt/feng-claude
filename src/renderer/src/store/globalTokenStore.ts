/**
 * Global persistent token usage store.
 * - Survives session close and window restart (localStorage via zustand/middleware).
 * - Tracks all-time `total` and rolling `today` (auto-resets on calendar day change).
 * - Stores a configurable `budget` (token cap) for the progress bar.
 * - Tracks per-day history (last 30 days) for the trend chart.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TokenTotals {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
}

export interface Pricing {
  inputPerM: number
  outputPerM: number
  cacheCreatePerM: number
  cacheReadPerM: number
}

export const DEFAULT_PRICING: Pricing = {
  inputPerM: 3,
  outputPerM: 15,
  cacheCreatePerM: 3.75,
  cacheReadPerM: 0.3
}

export function computeCost(t: TokenTotals, p: Pricing): number {
  return (
    (t.input / 1_000_000) * p.inputPerM +
    (t.output / 1_000_000) * p.outputPerM +
    (t.cacheCreate / 1_000_000) * p.cacheCreatePerM +
    (t.cacheRead / 1_000_000) * p.cacheReadPerM
  )
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
  /** Per-day token totals, keyed YYYY-MM-DD, last 30 days */
  dailyHistory: Record<string, TokenTotals>
  /** Pricing config ($ per million tokens) */
  pricing: Pricing

  /** Accumulate a per-turn delta from the JSONL watcher */
  ingest: (delta: TokenTotals) => void
  setBudget: (n: number) => void
  resetTotal: () => void
  setPricing: (p: Pricing) => void
}

export const useGlobalTokenStore = create<GlobalTokenStore>()(
  persist(
    (set) => ({
      total: { ...ZERO },
      today: { ...ZERO },
      todayDate: todayStr(),
      budget: 0,
      dailyHistory: {},
      pricing: { ...DEFAULT_PRICING },

      ingest: (delta) =>
        set((s) => {
          const now = todayStr()
          const isSameDay = s.todayDate === now
          const today = isSameDay ? add(s.today, delta) : { ...delta }

          // Update daily history: accumulate into today's bucket, keep last 30 days
          const prevDay = s.dailyHistory[now] ?? { ...ZERO }
          const allDays = { ...s.dailyHistory, [now]: add(prevDay, delta) }
          const keys = Object.keys(allDays).sort().slice(-30)
          const dailyHistory = Object.fromEntries(keys.map((k) => [k, allDays[k]]))

          return {
            total: add(s.total, delta),
            today,
            todayDate: now,
            dailyHistory
          }
        }),

      setBudget: (n) => set({ budget: Math.max(0, n) }),

      resetTotal: () =>
        set({ total: { ...ZERO }, today: { ...ZERO }, todayDate: todayStr() }),

      setPricing: (p) => set({ pricing: p })
    }),
    { name: 'global-token-usage' }
  )
)
