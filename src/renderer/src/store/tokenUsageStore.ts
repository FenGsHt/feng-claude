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
  /** [2026-05-12] 当前上下文窗口已用 token 数（来自状态栏 N/M 解析） */
  contextTokensUsed?: number
  /** [2026-05-12] 上下文窗口总量 token 数 */
  contextTokensTotal?: number
  /** [2026-05-12] 状态栏仅给出百分比（如 `12% context`）时用于环形图；与 N/M 并存时 N/M 优先 */
  contextWindowPercent?: number
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
    extra?: {
      cacheCreate?: number
      cacheRead?: number
      contextTokensUsed?: number
      contextTokensTotal?: number
      contextWindowPercent?: number
    }
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
      const contextTokensUsed = Number.isFinite(extra?.contextTokensUsed) ? extra!.contextTokensUsed! : undefined
      const contextTokensTotal = Number.isFinite(extra?.contextTokensTotal) ? extra!.contextTokensTotal! : undefined
      const contextWindowPercent = Number.isFinite(extra?.contextWindowPercent)
        ? extra!.contextWindowPercent!
        : undefined
      let next: SessionTokenTotals

      /*
       * [2026-05-12] 原 set/add 的 next 仅含 input/output/cache，整对象替换时会丢掉 context* 字段；
       * 任意后续 ingest（如正则 token）都会抹掉刚写入的上下文用量，外嵌圆环恒为「—」。
       * 现从 cur 带入 context* / contextWindowPercent，再由本帧 extra 覆盖。
       */
      const carryCtx = (): Pick<
        SessionTokenTotals,
        'contextTokensUsed' | 'contextTokensTotal' | 'contextWindowPercent'
      > => ({
        contextTokensUsed: cur.contextTokensUsed,
        contextTokensTotal: cur.contextTokensTotal,
        contextWindowPercent: cur.contextWindowPercent
      })

      if (mode === 'override') {
        next = { input: safeInput, output: safeOutput, cacheCreate, cacheRead, ...carryCtx() }
      } else if (mode === 'add') {
        next = {
          input: cur.input + safeInput,
          output: cur.output + safeOutput,
          cacheCreate: cur.cacheCreate + cacheCreate,
          cacheRead: cur.cacheRead + cacheRead,
          ...carryCtx()
        }
      } else {
        // set — per-field max (regex fallback, only touches input/output)
        next = {
          input: Math.max(cur.input, safeInput),
          output: Math.max(cur.output, safeOutput),
          cacheCreate: Math.max(cur.cacheCreate, cacheCreate),
          cacheRead: Math.max(cur.cacheRead, cacheRead),
          ...carryCtx()
        }
      }

      // context window numbers are always "latest value wins" (not accumulated)
      if (contextTokensUsed !== undefined) next.contextTokensUsed = contextTokensUsed
      if (contextTokensTotal !== undefined) next.contextTokensTotal = contextTokensTotal
      if (contextWindowPercent !== undefined) next.contextWindowPercent = contextWindowPercent
      /* 同时拿到已用/总量时以 N/M 为准，去掉仅百分比的占位 */
      if (
        contextTokensUsed !== undefined &&
        contextTokensTotal !== undefined &&
        contextTokensTotal > 0
      ) {
        delete next.contextWindowPercent
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
