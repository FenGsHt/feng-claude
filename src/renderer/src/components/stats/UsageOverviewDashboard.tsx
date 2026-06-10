/**
 * [2026-05-12] 参考 Claude/Cursor 类「Overview」页：Overview / Models 标签、指标卡 2×4、GitHub 式贡献热力格。
 * 数据来自 globalTokenStore 的按日历史 + session 历史条数；无埋点的项显示「—」。
 */
import React, { useMemo, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { tokenSum, type TokenTotals } from '../../store/globalTokenStore'
import type { ClaudeSettings } from '../../types/settings'
import { useI18n } from '../../i18n'

const CONTRIBUTION_WEEKS = 44

/** 固定 7 行 × N 列；列等分铺满宽度，aspect-ratio 保证格点接近正方形 */
function localYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(Math.round(n))
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<¥0.001'
  if (usd < 1) return `¥${usd.toFixed(3)}`
  return `¥${usd.toFixed(2)}`
}

function dayDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86_400_000)
}

function longestStreak(activeSorted: string[]): number {
  if (activeSorted.length === 0) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < activeSorted.length; i++) {
    if (dayDiffDays(activeSorted[i - 1]!, activeSorted[i]!) === 1) {
      run++
      best = Math.max(best, run)
    } else {
      run = 1
    }
  }
  return best
}

function currentStreakFromToday(active: Set<string>, today: string): number {
  let d = today
  let n = 0
  while (active.has(d)) {
    n++
    const x = new Date(d + 'T12:00:00')
    x.setDate(x.getDate() - 1)
    d = localYMD(x)
  }
  return n
}

/** GitHub 蓝系 5 档（含空） */
function contributionColor(tokens: number, maxT: number, dateStr: string, todayStr: string, inScope: boolean): string {
  if (dateStr > todayStr) return '#ebedf0'
  if (!inScope) return '#ebedf0'
  if (tokens <= 0) return '#ebedf0'
  const r = maxT > 0 ? tokens / maxT : 0
  if (r <= 0.2) return '#ddf4ff'
  if (r <= 0.4) return '#9cd6ff'
  if (r <= 0.6) return '#54aeff'
  if (r <= 0.85) return '#218bff'
  return '#0969da'
}

function scopeFromDate(todayStr: string, scope: 'all' | '30d' | '7d'): string {
  if (scope === 'all') return '1970-01-01'
  const d = new Date(todayStr + 'T12:00:00')
  const back = scope === '30d' ? 29 : 6
  d.setDate(d.getDate() - back)
  return localYMD(d)
}

function sumHistoryRange(
  dailyHistory: Record<string, TokenTotals>,
  from: string,
  to: string
): TokenTotals {
  let z: TokenTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
  for (const [day, t] of Object.entries(dailyHistory)) {
    if (day >= from && day <= to) {
      z = {
        input: z.input + t.input,
        output: z.output + t.output,
        cacheCreate: z.cacheCreate + t.cacheCreate,
        cacheRead: z.cacheRead + t.cacheRead
      }
    }
  }
  return z
}

function activeDaysInRange(dailyHistory: Record<string, TokenTotals>, from: string, to: string): Set<string> {
  const s = new Set<string>()
  for (const [day, t] of Object.entries(dailyHistory)) {
    if (day >= from && day <= to && tokenSum(t) > 0) s.add(day)
  }
  return s
}

function buildContributionColumns(
  dailyHistory: Record<string, TokenTotals>,
  weeks: number,
  todayStr: string
): { cols: { date: string; t: number }[][]; maxTokens: number } {
  const anchorMonday = startOfWeekMonday(new Date())
  const gridStart = new Date(anchorMonday)
  gridStart.setDate(gridStart.getDate() - (weeks - 1) * 7)
  const cols: { date: string; t: number }[][] = []
  let maxTokens = 1
  for (let c = 0; c < weeks; c++) {
    const weekStart = new Date(gridStart)
    weekStart.setDate(weekStart.getDate() + c * 7)
    const col: { date: string; t: number }[] = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + r)
      const ds = localYMD(d)
      let t = 0
      if (ds <= todayStr) {
        const raw = dailyHistory[ds]
        t = raw ? tokenSum(raw) : 0
        if (t > maxTokens) maxTokens = t
      }
      col.push({ date: ds, t })
    }
    cols.push(col)
  }
  return { cols, maxTokens }
}

export interface ProfileStatRow {
  id: string
  name: string
  tokens: number
  cost: number
  color: string
}

interface Props {
  dailyHistory: Record<string, TokenTotals>
  dailyHistoryPerProfile: Record<string, Record<string, TokenTotals>>
  settings: ClaudeSettings | null
  profileStats: ProfileStatRow[]
  todayDate: string
  /** [2026-05-12] 弹窗内嵌：去掉外层卡片避免双层边框，略加大间距 */
  embedded?: boolean
}

export function UsageOverviewDashboard({
  dailyHistory,
  dailyHistoryPerProfile,
  settings,
  profileStats,
  todayDate,
  embedded = false
}: Props): React.ReactElement {
  const { t } = useI18n()
  const st = t.stats
  const sessions = useSessionStore((s) => s.sessions.length)
  const historyLen = useSessionStore((s) => s.history.length)

  const [tab, setTab] = useState<'overview' | 'models'>('overview')
  const [scope, setScope] = useState<'all' | '30d' | '7d'>('all')

  const fromStr = useMemo(() => scopeFromDate(todayDate, scope), [todayDate, scope])

  const rangeTotals = useMemo(
    () => sumHistoryRange(dailyHistory, fromStr, todayDate),
    [dailyHistory, fromStr, todayDate]
  )

  const activeSet = useMemo(
    () => activeDaysInRange(dailyHistory, fromStr, todayDate),
    [dailyHistory, fromStr, todayDate]
  )

  const activeSorted = useMemo(() => [...activeSet].sort(), [activeSet])

  const favorite = useMemo(() => {
    if (!settings) return null as { name: string; tokens: number } | null
    const map: Record<string, number> = {}
    for (const [day, dm] of Object.entries(dailyHistoryPerProfile)) {
      if (day < fromStr || day > todayDate) continue
      for (const p of settings.profiles) {
        const v = tokenSum(dm[p.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 })
        map[p.id] = (map[p.id] ?? 0) + v
      }
    }
    let bestId: string | null = null
    let best = 0
    for (const p of settings.profiles) {
      const v = map[p.id] ?? 0
      if (v > best) {
        best = v
        bestId = p.id
      }
    }
    if (!bestId || best <= 0) return null
    const name = settings.profiles.find((x) => x.id === bestId)?.name ?? bestId
    return { name, tokens: best }
  }, [settings, dailyHistoryPerProfile, fromStr, todayDate])

  const { cols, maxTokens } = useMemo(
    () => buildContributionColumns(dailyHistory, CONTRIBUTION_WEEKS, todayDate),
    [dailyHistory, todayDate]
  )

  const totalTok = tokenSum(rangeTotals)
  const curStreak = currentStreakFromToday(activeSet, todayDate)
  const longStreak = longestStreak(activeSorted)

  const statCards: { label: string; value: string; muted?: boolean; title?: string }[] = [
    { label: st.overviewStatSessions, value: String(historyLen > 0 ? historyLen : sessions), title: st.overviewSessionsHint },
    { label: st.overviewStatMessages, value: st.overviewMsgsUnavailable, muted: true, title: st.overviewMsgsHint },
    { label: st.overviewStatTokens, value: formatK(totalTok) },
    { label: st.overviewStatActiveDays, value: String(activeSet.size) },
    { label: st.overviewStatCurStreak, value: `${curStreak}d` },
    { label: st.overviewStatLongStreak, value: `${longStreak}d` },
    { label: st.overviewStatPeakHour, value: st.overviewMsgsUnavailable, muted: true, title: st.overviewPeakHint },
    { label: st.overviewStatFavorite, value: favorite ? favorite.name : '—' }
  ]

  const shell = embedded
    ? 'min-w-0 space-y-4'
    : 'min-w-0 rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95'

  return (
    <div className={shell}>
      <div className={`flex flex-wrap items-center justify-between gap-3 ${embedded ? '' : 'mb-3'}`}>
        <div
          className={`inline-flex rounded-lg p-0.5 ${
            embedded
              ? 'bg-[var(--theme-panel-bg-soft)] ring-1 ring-[var(--theme-panel-border)] dark:bg-zinc-800/80'
              : 'bg-neutral-100 dark:bg-zinc-800'
          }`}
          role="tablist"
          aria-label={st.overviewTabsAria}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overview'}
            onClick={() => setTab('overview')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === 'overview'
                ? embedded
                  ? 'bg-[var(--theme-card-bg)] text-claude-text shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                  : 'bg-white text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                : embedded
                  ? 'text-claude-muted hover:text-claude-text'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {st.overviewTabOverview}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'models'}
            onClick={() => setTab('models')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === 'models'
                ? embedded
                  ? 'bg-[var(--theme-card-bg)] text-claude-text shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                  : 'bg-white text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                : embedded
                  ? 'text-claude-muted hover:text-claude-text'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {st.overviewTabModels}
          </button>
        </div>
        <div
          className={`inline-flex shrink-0 rounded-lg p-0.5 ${
            embedded
              ? 'bg-[var(--theme-panel-bg-soft)] ring-1 ring-[var(--theme-panel-border)] dark:bg-zinc-800/80'
              : 'bg-neutral-100 dark:bg-zinc-800'
          }`}
        >
          {(['all', '30d', '7d'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={scope === k}
              onClick={() => setScope(k)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                scope === k
                  ? embedded
                    ? 'bg-[var(--theme-card-bg)] text-claude-text shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                    : 'bg-white text-neutral-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                  : embedded
                    ? 'text-claude-muted hover:text-claude-text'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {k === 'all' ? st.overviewScopeAll : k === '30d' ? st.overviewScope30d : st.overviewScope7d}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' ? (
        <>
          <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5 ${embedded ? '' : 'mb-3'}`}>
            {statCards.map((c) => (
              <div
                key={c.label}
                title={c.title}
                className={`min-w-0 rounded-lg px-2 py-2 sm:rounded-xl sm:px-2.5 sm:py-2 ${
                  embedded
                    ? 'border border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] dark:bg-zinc-800/50'
                    : 'bg-neutral-100/90 dark:bg-zinc-800/90'
                }`}
              >
                <div className="truncate text-[9px] font-medium leading-tight text-neutral-500 dark:text-zinc-400">
                  {c.label}
                </div>
                <div
                  className={`mt-0.5 truncate font-mono text-[13px] font-semibold leading-tight tracking-tight dark:text-zinc-50 ${
                    c.muted ? 'text-neutral-400 dark:text-zinc-500' : embedded ? 'text-claude-text' : 'text-neutral-900'
                  }`}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
          <div
            className={`w-full min-w-0 overflow-x-auto rounded-lg pb-1.5 pt-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-panel-bg-soft)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/90 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600 ${
              embedded ? 'border border-[var(--theme-panel-border)] bg-[#f8fafc] px-1.5 dark:bg-zinc-950/40' : '-mx-0.5 pb-1 pt-0.5 [&::-webkit-scrollbar-track]:bg-transparent'
            }`}
          >
            <div
              className="mx-auto w-full max-w-full"
              style={{
                aspectRatio: `${Math.max(cols.length, 1)} / 7`,
                minHeight: '56px'
              }}
            >
              <div
                className="grid h-full w-full gap-px sm:gap-[2px]"
                style={{
                  gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`,
                  gridTemplateRows: 'repeat(7, minmax(0, 1fr))'
                }}
              >
                {cols.map((col, ci) =>
                  col.map((cell, ri) => (
                    <div
                      key={cell.date}
                      title={`${cell.date}: ${formatK(cell.t)} tokens`}
                      className={
                        embedded
                          ? 'min-h-0 min-w-0 rounded-[2px] ring-1 ring-black/5 dark:ring-white/10'
                          : 'min-h-0 min-w-0 rounded-[1.5px]'
                      }
                      style={{
                        gridColumn: ci + 1,
                        gridRow: ri + 1,
                        backgroundColor: contributionColor(
                          cell.t,
                          maxTokens,
                          cell.date,
                          todayDate,
                          cell.date >= fromStr && cell.date <= todayDate
                        )
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-claude-muted/90 dark:text-zinc-500">{st.overviewHeatmapCaption}</p>
        </>
      ) : (
        <div className={`flex flex-col gap-2 overflow-y-auto pr-0.5 ${embedded ? 'max-h-[min(40vh,320px)]' : 'max-h-[220px]'}`}>
          {profileStats.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-neutral-500 dark:text-zinc-400">{st.noData}</p>
          ) : (
            profileStats.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/80 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-800/60"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-800 dark:text-zinc-100">
                  {row.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-neutral-700 dark:text-zinc-200">
                  {formatK(row.tokens)}
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[10px] text-neutral-500 dark:text-zinc-400">
                  {formatCost(row.cost)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
