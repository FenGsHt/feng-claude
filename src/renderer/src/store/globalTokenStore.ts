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

/** [2026-04-28] Ensure TokenTotals has no null values (corrupted data fix) */
function sanitize(t: Partial<TokenTotals> | null | undefined): TokenTotals {
  return {
    input: Number(t?.input ?? 0) || 0,
    output: Number(t?.output ?? 0) || 0,
    cacheCreate: Number(t?.cacheCreate ?? 0) || 0,
    cacheRead: Number(t?.cacheRead ?? 0) || 0
  }
}

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
  // [2026-04-28] Sanitize before save to prevent null values in persisted data
  const sanitizedState = {
    total: sanitize(state.total),
    today: sanitize(state.today),
    todayDate: state.todayDate,
    budget: state.budget,
    dailyHistory: Object.fromEntries(Object.entries(state.dailyHistory).map(([k, v]) => [k, sanitize(v)])),
    dailyHistoryPerProfile: Object.fromEntries(Object.entries(state.dailyHistoryPerProfile).map(([k, profiles]) => [k, Object.fromEntries(Object.entries(profiles).map(([pid, v]) => [pid, sanitize(v)]))])),
    perProfile: Object.fromEntries(Object.entries(state.perProfile).map(([k, v]) => [k, sanitize(v)])),
    pricing: state.pricing,
    hideDetailedTokens: state.hideDetailedTokens
  }
  window.electronAPI.tokenData?.set(sanitizedState)
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
        // [2026-04-28] Sanitize all loaded token data to fix corrupted null values
        const sanitizedTotal = sanitize(d.total)
        const sanitizedToday = sanitize(d.today)
        const sanitizedPerProfile = Object.fromEntries(Object.entries(d.perProfile ?? {}).map(([k, v]) => [k, sanitize(v)]))
        const sanitizedDailyHistory = Object.fromEntries(Object.entries(d.dailyHistory ?? {}).map(([k, v]) => [k, sanitize(v)]))
        const sanitizedDailyPerProfile = Object.fromEntries(Object.entries(d.dailyHistoryPerProfile ?? {}).map(([k, profiles]) => [k, Object.fromEntries(Object.entries(profiles ?? {}).map(([pid, v]) => [pid, sanitize(v)]))]))

        // [2026-04-28] Recover total/input/output from perProfile if they were corrupted to 0
        const now = todayStr()
        let recoveredTotal = sanitizedTotal
        if (sanitizedTotal.input === 0 && sanitizedTotal.output === 0 && Object.keys(sanitizedPerProfile).length > 0) {
          recoveredTotal = Object.values(sanitizedPerProfile).reduce((acc, t) => add(acc, t), { ...ZERO })
          console.log(`[tokenStore] recovered total from perProfile: in=${recoveredTotal.input} out=${recoveredTotal.output}`)
        }
        let recoveredToday = sanitizedToday
        const todayProfiles = sanitizedDailyPerProfile[now]
        if (sanitizedToday.input === 0 && sanitizedToday.output === 0 && todayProfiles && Object.keys(todayProfiles).length > 0) {
          recoveredToday = Object.values(todayProfiles).reduce((acc, t) => add(acc, t), { ...ZERO })
          console.log(`[tokenStore] recovered today from perProfile: in=${recoveredToday.input} out=${recoveredToday.output}`)
        }
        // Recover dailyHistory entries from dailyHistoryPerProfile
        const recoveredDailyHistory = { ...sanitizedDailyHistory }
        for (const [date, profiles] of Object.entries(sanitizedDailyPerProfile)) {
          const existing = sanitizedDailyHistory[date]
          if (existing && existing.input === 0 && existing.output === 0 && Object.keys(profiles).length > 0) {
            recoveredDailyHistory[date] = Object.values(profiles).reduce((acc, t) => add(acc, t), { ...ZERO })
            console.log(`[tokenStore] recovered dailyHistory[${date}] from perProfile`)
          }
        }

        // [2026-05-01] If todayDate is stale (yesterday or older), reset today to ZERO
        const loadedTodayDate = d.todayDate ?? now
        const isStaleDay = loadedTodayDate !== now
        const finalToday = isStaleDay ? { ...ZERO } : recoveredToday
        const finalTodayDate = now

        set({
          total: recoveredTotal,
          today: finalToday,
          todayDate: finalTodayDate,
          budget: d.budget ?? 0,
          dailyHistory: recoveredDailyHistory,
          dailyHistoryPerProfile: sanitizedDailyPerProfile,
          perProfile: sanitizedPerProfile,
          pricing: d.pricing ?? { ...DEFAULT_PRICING },
          hideDetailedTokens: d.hideDetailedTokens ?? false,
          _hydrated: true
        })

        // [2026-05-01] Save corrected state immediately when day is stale
        if (isStaleDay) {
          console.log('[tokenStore] todayDate stale, reset today to ZERO')
          saveImmediately({
            total: recoveredTotal,
            today: finalToday,
            todayDate: finalTodayDate,
            budget: d.budget ?? 0,
            dailyHistory: recoveredDailyHistory,
            dailyHistoryPerProfile: sanitizedDailyPerProfile,
            perProfile: sanitizedPerProfile,
            pricing: d.pricing ?? { ...DEFAULT_PRICING },
            hideDetailedTokens: d.hideDetailedTokens ?? false
          })
        }
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
              // [2026-04-28] Sanitize migrated data too
              const total = sanitize(state.total)
              const today = sanitize(state.today)
              const todayDate = state.todayDate ?? todayStr()
              const dailyHistory = Object.fromEntries(Object.entries(state.dailyHistory ?? {}).map(([k, v]) => [k, sanitize(v)]))
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
      // [2026-04-28] Guard against NaN from corrupted JSONL data
      const safe: TokenTotals = {
        input: Number.isFinite(delta.input) ? delta.input : 0,
        output: Number.isFinite(delta.output) ? delta.output : 0,
        cacheCreate: Number.isFinite(delta.cacheCreate) ? delta.cacheCreate : 0,
        cacheRead: Number.isFinite(delta.cacheRead) ? delta.cacheRead : 0,
      }
      const sum = safe.input + safe.output + safe.cacheCreate + safe.cacheRead
      console.log('[Token] ingest — delta:', safe, 'sum:', sum, 'profileId:', profileId, '_hydrated:', s._hydrated)

      const now = todayStr()
      const isSameDay = s.todayDate === now
      const today = isSameDay ? add(s.today, safe) : { ...safe }

      const prevDay = s.dailyHistory[now] ?? { ...ZERO }
      const allDays = { ...s.dailyHistory, [now]: add(prevDay, safe) }
      const keys = Object.keys(allDays).sort().slice(-30)
      const dailyHistory = Object.fromEntries(keys.map((k) => [k, allDays[k]]))

      // [2026-04-28] Track per-profile usage
      const perProfile = { ...s.perProfile }
      if (profileId) {
        perProfile[profileId] = add(perProfile[profileId] ?? { ...ZERO }, safe)
      }

      // [2026-04-28] Track daily history per profile
      const dailyHistoryPerProfile = { ...s.dailyHistoryPerProfile }
      if (profileId) {
        const dayProfiles = { ...dailyHistoryPerProfile[now] }
        dayProfiles[profileId] = add(dayProfiles[profileId] ?? { ...ZERO }, safe)
        dailyHistoryPerProfile[now] = dayProfiles
        // Keep only last 30 days
        const dateKeys = Object.keys(dailyHistoryPerProfile).sort().slice(-30)
        const trimmedDailyPerProfile = Object.fromEntries(dateKeys.map((k) => [k, dailyHistoryPerProfile[k]]))
        const next = { total: add(s.total, safe), today, todayDate: now, dailyHistory, dailyHistoryPerProfile: trimmedDailyPerProfile, perProfile }
        if (s._hydrated) scheduleSave({ ...s, ...next })
        console.log('[Token] ingest next — today:', next.today, 'total:', next.total, 'perProfile:', next.perProfile)
        return next
      }

      const next = { total: add(s.total, safe), today, todayDate: now, dailyHistory, perProfile }
      if (s._hydrated) scheduleSave({ ...s, ...next })
      console.log('[Token] ingest next (no profile) — today:', next.today, 'total:', next.total)
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
