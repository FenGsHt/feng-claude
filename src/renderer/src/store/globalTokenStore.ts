/**
 * Global token usage store.
 * Persistence: IPC → main process → userData/token-data.json
 * (localStorage proved unreliable in Electron portable builds)
 */
import { create } from 'zustand'

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
  return new Date().toISOString().slice(0, 10)
}

function add(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead
  }
}

export function tokenSum(t: TokenTotals): number {
  return t.input + t.output + t.cacheCreate + t.cacheRead
}

/** [2026-04-28] Per-profile token usage stats */
export interface PerProfileUsage {
  /** profileId → cumulative totals */
  perProfile: Record<string, TokenTotals>
}

interface PersistedTokenData extends PerProfileUsage {
  total: TokenTotals
  today: TokenTotals
  todayDate: string
  budget: number
  dailyHistory: Record<string, TokenTotals>
  /** [2026-04-28] Daily history per profile: date → profileId → totals */
  dailyHistoryPerProfile: Record<string, Record<string, TokenTotals>>
  pricing: Pricing
  /** 屏蔽详细 token 数字，只显示等级 */
  hideDetailedTokens: boolean
}

interface GlobalTokenStore extends PersistedTokenData {
  /** true after initial load from disk completes */
  _hydrated: boolean

  /** [2026-04-28] Ingest token delta with optional profileId for per-profile tracking */
  ingest: (delta: TokenTotals, profileId?: string) => void
  setBudget: (n: number) => void
  resetTotal: () => void
  setPricing: (p: Pricing) => void
  setHideDetailedTokens: (v: boolean) => void
  /** Called once at app startup to load persisted data from main process */
  hydrate: () => Promise<void>
}

// Debounced save to main process (for high-frequency token ingest)
let _saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(state: PersistedTokenData): void {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    saveImmediately(state)
  }, 800)
}

// Immediate save (for user-initiated actions like setBudget/resetTotal)
function saveImmediately(state: PersistedTokenData): void {
  const { total, today, todayDate, budget, dailyHistory, dailyHistoryPerProfile, perProfile, pricing, hideDetailedTokens } = state
  window.electronAPI.tokenData?.set({ total, today, todayDate, budget, dailyHistory, dailyHistoryPerProfile, perProfile, pricing, hideDetailedTokens })
    .catch((e: unknown) => console.error('[tokenStore] save failed:', e))
}

export const useGlobalTokenStore = create<GlobalTokenStore>()((set, get) => ({
  total: { ...ZERO },
  today: { ...ZERO },
  todayDate: todayStr(),
  budget: 0,
  dailyHistory: {},
  dailyHistoryPerProfile: {},
  perProfile: {},
  pricing: { ...DEFAULT_PRICING },
  hideDetailedTokens: false,
  _hydrated: false,

  hydrate: async () => {
    try {
      const raw = await window.electronAPI.tokenData?.get()
      if (raw && typeof raw === 'object') {
        const d = raw as Partial<PersistedTokenData>
        set({
          total: d.total ?? { ...ZERO },
          today: d.today ?? { ...ZERO },
          todayDate: d.todayDate ?? todayStr(),
          budget: d.budget ?? 0,
          dailyHistory: d.dailyHistory ?? {},
          dailyHistoryPerProfile: d.dailyHistoryPerProfile ?? {},
          perProfile: d.perProfile ?? {},
          pricing: d.pricing ?? { ...DEFAULT_PRICING },
          hideDetailedTokens: d.hideDetailedTokens ?? false,
          _hydrated: true
        })
      } else {
        // [2026-04-27] Migration: localStorage (old) → IPC (new)
        const lsKey = 'global-token-usage'
        const lsRaw = localStorage.getItem(lsKey)
        let migrated = false
        if (lsRaw) {
          try {
            const parsed = JSON.parse(lsRaw) as { state?: Partial<PersistedTokenData>; version?: number }
            const state = parsed?.state ?? parsed
            if (state && typeof state === 'object') {
              const budget = state.budget ?? 0
              const total = state.total ?? { ...ZERO }
              const today = state.today ?? { ...ZERO }
              const todayDate = state.todayDate ?? todayStr()
              const dailyHistory = state.dailyHistory ?? {}
              const pricing = state.pricing ?? { ...DEFAULT_PRICING }
              set({ total, today, todayDate, budget, dailyHistory, pricing, dailyHistoryPerProfile: {}, perProfile: {}, _hydrated: true })
              await window.electronAPI.tokenData?.set({ total, today, todayDate, budget, dailyHistory, dailyHistoryPerProfile: {}, perProfile: {}, pricing })
              migrated = true
              console.log('[tokenStore] migrated from localStorage to IPC')
            }
          } catch {
            // Invalid localStorage data, ignore
          }
        }
        if (migrated) {
          localStorage.removeItem(lsKey)
        }
        if (!migrated) {
          set({ dailyHistoryPerProfile: {}, perProfile: {}, _hydrated: true })
        }
      }
    } catch (e) {
      console.error('[tokenStore] hydrate failed:', e)
      set({ dailyHistoryPerProfile: {}, perProfile: {}, _hydrated: true })
    }
  },

  ingest: (delta, profileId) =>
    set((s) => {
      const now = todayStr()
      const isSameDay = s.todayDate === now
      const today = isSameDay ? add(s.today, delta) : { ...delta }

      const prevDay = s.dailyHistory[now] ?? { ...ZERO }
      const allDays = { ...s.dailyHistory, [now]: add(prevDay, delta) }
      const keys = Object.keys(allDays).sort().slice(-30)
      const dailyHistory = Object.fromEntries(keys.map((k) => [k, allDays[k]]))

      // [2026-04-28] Track per-profile usage
      const perProfile = { ...s.perProfile }
      if (profileId) {
        perProfile[profileId] = add(perProfile[profileId] ?? { ...ZERO }, delta)
      }

      // [2026-04-28] Track daily history per profile
      const dailyHistoryPerProfile = { ...s.dailyHistoryPerProfile }
      if (profileId) {
        const dayProfiles = { ...dailyHistoryPerProfile[now] }
        dayProfiles[profileId] = add(dayProfiles[profileId] ?? { ...ZERO }, delta)
        dailyHistoryPerProfile[now] = dayProfiles
        // Keep only last 30 days
        const dateKeys = Object.keys(dailyHistoryPerProfile).sort().slice(-30)
        const trimmedDailyPerProfile = Object.fromEntries(dateKeys.map((k) => [k, dailyHistoryPerProfile[k]]))
        const next = { total: add(s.total, delta), today, todayDate: now, dailyHistory, dailyHistoryPerProfile: trimmedDailyPerProfile, perProfile }
        if (s._hydrated) scheduleSave({ ...s, ...next })
        return next
      }

      const next = { total: add(s.total, delta), today, todayDate: now, dailyHistory, perProfile }
      if (s._hydrated) scheduleSave({ ...s, ...next })
      return next
    }),

  setBudget: (n) => {
    const budget = Math.max(0, n)
    set({ budget })
    const s = get()
    // [2026-04-27] User-initiated action: save immediately (not debounced) to avoid data loss on quick window close
    if (s._hydrated) saveImmediately({ ...s, budget })
  },

  resetTotal: () => {
    const next = { total: { ...ZERO }, today: { ...ZERO }, todayDate: todayStr(), perProfile: {}, dailyHistoryPerProfile: {} }
    set(next)
    const s = get()
    // [2026-04-27] User-initiated action: save immediately
    if (s._hydrated) saveImmediately({ ...s, ...next })
  },

  setPricing: (pricing) => {
    set({ pricing })
    const s = get()
    // [2026-04-27] User-initiated action: save immediately
    if (s._hydrated) saveImmediately({ ...s, pricing })
  },

  setHideDetailedTokens: (v) => {
    set({ hideDetailedTokens: v })
    const s = get()
    if (s._hydrated) saveImmediately({ ...s, hideDetailedTokens: v })
  }
}))
