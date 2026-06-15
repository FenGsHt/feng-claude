import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useFocusWindow } from '../../hooks/useFocusWindow'
import { createPortal } from 'react-dom'
import { useGlobalTokenStore, tokenSum, computeCost, DEFAULT_PRICING, type TokenTotals, type Pricing } from '../../store/globalTokenStore'
import type { ClaudeSettings, ApiProfile } from '../../types/settings'
import { OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE } from '../../types/settings'
import { useI18n } from '../../i18n'
import { UsageOverviewDashboard } from './UsageOverviewDashboard'
import { computeClaudeModelsCost } from '../../lib/modelPricing'

/** 返回需要在图表中展示的配置列表，包含官方虚拟 profile（若有数据）*/
function displayProfiles(settings: ClaudeSettings | null, perProfileData: Record<string, unknown>): Array<ApiProfile> {
  const profiles: ApiProfile[] = settings?.profiles ?? []
  if (perProfileData[OFFICIAL_PROFILE_ID] && !profiles.some(p => p.id === OFFICIAL_PROFILE_ID)) {
    return [...profiles, OFFICIAL_PROFILE as unknown as ApiProfile]
  }
  return profiles
}

const CHART_DAYS = 14
const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#8b5cf6']

const OTHER_STACK_COLOR = '#94a3b8'

type TimeRange = 'today' | 'week' | 'total'

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<¥0.001'
  if (usd < 1) return `¥${usd.toFixed(3)}`
  return `¥${usd.toFixed(2)}`
}

function lastNDates(n: number): string[] {
  const dates: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

const emptyTotals = (): TokenTotals => ({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 })

/** Get Monday-based week dates (Mon..Sun) for the current week */
function currentWeekDates(): string[] {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun,1=Mon,...
  const mondayOffset = day === 0 ? 6 : day - 1
  const dates: string[] = []
  for (let i = 0; i <= mondayOffset; i++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function sumDailyHistory(dailyHistory: Record<string, TokenTotals>, dates: string[]): TokenTotals {
  let result: TokenTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
  for (const d of dates) {
    const t = dailyHistory[d]
    if (t) {
      result = {
        input: result.input + t.input,
        output: result.output + t.output,
        cacheCreate: result.cacheCreate + t.cacheCreate,
        cacheRead: result.cacheRead + t.cacheRead
      }
    }
  }
  return result
}

function sumAllDailyHistory(dailyHistory: Record<string, TokenTotals>): TokenTotals {
  return sumDailyHistory(dailyHistory, Object.keys(dailyHistory))
}

function sumPerModelHistory(
  dailyHistoryPerModel: Record<string, Record<string, TokenTotals>>,
  dates: string[]
): Record<string, TokenTotals> {
  const result: Record<string, TokenTotals> = {}
  for (const d of dates) {
    const dayModels = dailyHistoryPerModel[d]
    if (!dayModels) continue
    for (const [mid, t] of Object.entries(dayModels)) {
      const prev = result[mid] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
      result[mid] = {
        input: prev.input + t.input,
        output: prev.output + t.output,
        cacheCreate: prev.cacheCreate + t.cacheCreate,
        cacheRead: prev.cacheRead + t.cacheRead
      }
    }
  }
  return result
}

function sumPerProfileHistory(
  dailyHistoryPerProfile: Record<string, Record<string, TokenTotals>>,
  dates: string[]
): Record<string, TokenTotals> {
  const result: Record<string, TokenTotals> = {}
  for (const d of dates) {
    const dayProfiles = dailyHistoryPerProfile[d]
    if (!dayProfiles) continue
    for (const [pid, t] of Object.entries(dayProfiles)) {
      const prev = result[pid] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
      result[pid] = {
        input: prev.input + t.input,
        output: prev.output + t.output,
        cacheCreate: prev.cacheCreate + t.cacheCreate,
        cacheRead: prev.cacheRead + t.cacheRead
      }
    }
  }
  return result
}

// ── Pie chart for per-profile distribution ──────────────────────

interface PieSlice {
  label: string
  value: number
  color: string
  percent: number
}

function buildPieSlices(settings: ClaudeSettings | null, perProfile: Record<string, TokenTotals>, total: TokenTotals): PieSlice[] {
  if (!settings || Object.keys(perProfile).length === 0) return []
  const totalTokens = tokenSum(total)
  if (totalTokens === 0) return []

  return displayProfiles(settings, perProfile).map((profile, i) => {
    const t = perProfile[profile.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    return {
      label: profile.name,
      value: tokenSum(t),
      color: COLORS[i % COLORS.length],
      percent: totalTokens > 0 ? tokenSum(t) / totalTokens : 0
    }
  }).filter(s => s.value > 0)
}

function PieChart({ slices, title }: { slices: PieSlice[]; title: string }): React.ReactElement | null {
  if (slices.length === 0) return null

  const SIZE = 120
  const R = 52
  const CX = SIZE / 2
  const CY = SIZE / 2
  const TOTAL = slices.reduce((s, p) => s + p.value, 0)

  let cumAngle = -Math.PI / 2

  const paths = slices.map((slice) => {
    const sliceAngle = (slice.value / TOTAL) * 2 * Math.PI
    const startAngle = cumAngle
    const endAngle = cumAngle + sliceAngle
    cumAngle = endAngle

    const largeArc = sliceAngle > Math.PI ? 1 : 0
    const x1 = CX + R * Math.cos(startAngle)
    const y1 = CY + R * Math.sin(startAngle)
    const x2 = CX + R * Math.cos(endAngle)
    const y2 = CY + R * Math.sin(endAngle)

    const d = sliceAngle >= 2 * Math.PI - 0.01
      ? `M ${CX},${CY - R} A ${R},${R} 0 1,0 ${CX},${CY + R} A ${R},${R} 0 1,0 ${CX},${CY - R}`
      : `M ${CX},${CY} L ${x1},${y1} A ${R},${R} 0 ${largeArc} 1 ${x2},${y2} Z`

    return { d, color: slice.color, label: slice.label, value: slice.value, percent: slice.percent }
  })

  return (
    <div>
      <div className="text-[10px] text-claude-muted mb-2 uppercase tracking-wider">{title}</div>
      <div className="flex items-center gap-4">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} opacity={0.85}>
              <title>{`${p.label}: ${formatK(p.value)} (${(p.percent * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="flex flex-col gap-1 flex-1">
          {paths.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-[10px] text-claude-muted flex-1 truncate">{p.label}</span>
              <span className="text-[10px] text-claude-text font-mono">{formatK(p.value)}</span>
              <span className="text-[9px] text-claude-muted w-10 text-right">{(p.percent * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main chart ──────────────────────────────────────────────────

export function UsageChart(): React.ReactElement {
  const { dailyHistory, total, today, todayDate, perProfile, pricing: globalPricing, dailyHistoryPerProfile, perModel, dailyHistoryPerModel } = useGlobalTokenStore()
  const { t } = useI18n()

  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [heatmapModalOpen, setHeatmapModalOpen] = useState(false)
  useFocusWindow(heatmapModalOpen)

  useEffect(() => {
    void window.electronAPI.settings.get().then(setSettings)
    return window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then(setSettings)
    })
  }, [])

  const activeProfile = settings?.profiles.find(p => p.id === settings.activeProfileId) ?? settings?.profiles[0]
  const pricing: Pricing = activeProfile?.pricing ?? globalPricing ?? DEFAULT_PRICING

  // Compute week data
  const weekDates = currentWeekDates()
  const weekTotal = sumDailyHistory(dailyHistory, weekDates)
  const weekPerProfile = sumPerProfileHistory(dailyHistoryPerProfile, weekDates)

  // Compute effective total from dailyHistory for consistency
  const dailyTotal = sumAllDailyHistory(dailyHistory)
  const effectiveTotal: TokenTotals = {
    input: Math.max(total.input, dailyTotal.input),
    output: Math.max(total.output, dailyTotal.output),
    cacheCreate: Math.max(total.cacheCreate, dailyTotal.cacheCreate),
    cacheRead: Math.max(total.cacheRead, dailyTotal.cacheRead)
  }
  // Effective per-profile: merge stored perProfile with dailyHistoryPerProfile sums
  const allDates = Object.keys(dailyHistoryPerProfile)
  const dailyPerProfileTotal = sumPerProfileHistory(dailyHistoryPerProfile, allDates)
  const effectivePerProfile: Record<string, TokenTotals> = { ...perProfile }
  for (const [pid, dt] of Object.entries(dailyPerProfileTotal)) {
    const existing = effectivePerProfile[pid]
    if (!existing) {
      effectivePerProfile[pid] = dt
    } else {
      effectivePerProfile[pid] = {
        input: Math.max(existing.input, dt.input),
        output: Math.max(existing.output, dt.output),
        cacheCreate: Math.max(existing.cacheCreate, dt.cacheCreate),
        cacheRead: Math.max(existing.cacheRead, dt.cacheRead)
      }
    }
  }

  // Select data based on time range
  const rangeData = timeRange === 'today' ? today : timeRange === 'week' ? weekTotal : effectiveTotal
  const rangeCost = computeCost(rangeData, pricing)
  const rangePerProfile = timeRange === 'today'
    ? (dailyHistoryPerProfile[todayDate] ?? {})
    : timeRange === 'week' ? weekPerProfile : effectivePerProfile

  // Breakdown rows
  const breakdownRows: { name: string; val: number; cost: number; color: string }[] = [
    { name: 'Input', val: rangeData.input, cost: (rangeData.input / 1_000_000) * pricing.inputPerM, color: 'text-blue-400' },
    { name: 'Output', val: rangeData.output, cost: (rangeData.output / 1_000_000) * pricing.outputPerM, color: 'text-green-400' },
    { name: 'Cache↑', val: rangeData.cacheCreate, cost: (rangeData.cacheCreate / 1_000_000) * pricing.cacheCreatePerM, color: 'text-purple-400' },
    { name: 'Cache↓', val: rangeData.cacheRead, cost: (rangeData.cacheRead / 1_000_000) * pricing.cacheReadPerM, color: 'text-amber-400' },
  ]

  // Per-model range totals (for official profile cost via per-model pricing)
  const rangePerModel = timeRange === 'today'
    ? (dailyHistoryPerModel[todayDate] ?? {})
    : timeRange === 'week'
      ? sumPerModelHistory(dailyHistoryPerModel, weekDates)
      : perModel

  // Per-profile pie chart
  const pieSlices = buildPieSlices(settings, rangePerProfile, rangeData)

  // Per-profile stats
  const profileStats = displayProfiles(settings, rangePerProfile).map((profile, i) => {
    const pt = rangePerProfile[profile.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    const cost = profile.id === OFFICIAL_PROFILE_ID
      ? computeClaudeModelsCost(rangePerModel)
      : computeCost(pt, profile.pricing ?? DEFAULT_PRICING)
    return { id: profile.id, name: profile.name, tokens: tokenSum(pt), cost, color: COLORS[i % COLORS.length] }
  }) ?? []

  // 14-day bar chart
  const dates = lastNDates(CHART_DAYS)
  const values = dates.map((d) => {
    const dh = dailyHistory[d] ?? null
    return dh ? tokenSum(dh) : 0
  })
  const maxVal = Math.max(...values, 1)
  const dayCosts = Object.fromEntries(Object.entries(dailyHistory).map(([d, dh]) => [d, computeCost(dh, pricing)]))

  const valuesFingerprint = values.join(',')
  const recentStackedLegend = useMemo(() => {
    if (!settings) return [] as { id: string; name: string; tokens: number; color: string; pct: number; other?: boolean }[]
    const totals: Record<string, number> = {}
    let attributed = 0
    const allPerProfileData = Object.values(dailyHistoryPerProfile).reduce<Record<string, unknown>>((acc, dm) => ({ ...acc, ...dm }), {})
    for (const d of dates) {
      const dm = dailyHistoryPerProfile[d] ?? {}
      for (const p of displayProfiles(settings, allPerProfileData)) {
        const v = tokenSum(dm[p.id] ?? emptyTotals())
        totals[p.id] = (totals[p.id] ?? 0) + v
        attributed += v
      }
    }
    const dayAll = values.reduce((a, b) => a + b, 0)
    const other = Math.max(0, dayAll - attributed)
    const grand = dayAll > 0 ? dayAll : attributed + other
    if (grand <= 0) return []
    const rows = settings.profiles
      .map((p, i) => ({
        id: p.id,
        name: p.name,
        tokens: totals[p.id] ?? 0,
        color: COLORS[i % COLORS.length],
        pct: ((totals[p.id] ?? 0) / grand) * 100
      }))
      .filter((r) => r.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
    if (other > 0) {
      rows.push({
        id: '_other',
        name: '',
        tokens: other,
        color: OTHER_STACK_COLOR,
        pct: (other / grand) * 100,
        other: true
      })
    }
    return rows
  }, [settings, dates.join(','), dailyHistoryPerProfile, valuesFingerprint])

  const BAR_H = 96
  const BAR_W = 26
  const BAR_GAP = 7
  const barScrollRef = useRef<HTMLDivElement>(null)
  const [hoverBar, setHoverBar] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const el = barScrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [dailyHistory, todayDate])

  useEffect(() => {
    if (!heatmapModalOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setHeatmapModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [heatmapModalOpen])

  const closeHeatmapModal = useCallback(() => setHeatmapModalOpen(false), [])

  const rangeLabel = timeRange === 'today' ? t.stats.today : timeRange === 'week' ? t.stats.thisWeek : t.stats.total
  const breakdownTitle = timeRange === 'today' ? t.stats.todayDetail : t.stats.periodDetail.replace('{period}', rangeLabel)

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto h-full">
      {/* Time range selector */}
      <div className="flex bg-claude-surface rounded-lg p-0.5 border border-claude-border">
        {([['today', t.stats.today], ['week', t.stats.thisWeek], ['total', t.stats.total]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTimeRange(key)}
            className={`flex-1 text-[11px] py-1.5 rounded-md transition-colors ${
              timeRange === key
                ? 'bg-amber-400/20 text-amber-400 font-semibold'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary card */}
      <SummaryCard label={rangeLabel} tokens={rangeData} cost={rangeCost} />

      {/* Breakdown */}
      <BreakdownSection label={breakdownTitle} rows={breakdownRows} />

      {/* Per-profile pie chart */}
      {pieSlices.length > 0 && <PieChart slices={pieSlices} title={t.stats.profileShare} />}

      {/* Per-profile list */}
      {profileStats.some(s => s.tokens > 0) && (
        <div>
          <div className="text-[10px] text-claude-muted mb-1.5 uppercase tracking-wider">{t.stats.profileUsage}</div>
          <div className="flex flex-col gap-1">
            {profileStats.map((stat) => (
              <div key={stat.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: stat.color }} />
                <span className="flex-1 truncate" style={{ color: stat.color }}>{stat.name}</span>
                <span className="font-mono text-claude-text">{formatK(stat.tokens)}</span>
                <span className="text-[10px] text-claude-muted font-mono ml-1">{formatCost(stat.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* [2026-05-12] 原柱 / 热力 / 堆叠三态切换；产品改为仅堆叠，且柱高按当日总 token 相对 maxVal 缩放（非 100% 等高堆叠） */}
      <div className="rounded-xl border border-[var(--theme-panel-border)] bg-[#f2efe8] p-3 shadow-sm dark:bg-[var(--theme-card-bg)] dark:shadow-none">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-claude-muted">
            {t.stats.recentDays.replace('{n}', String(CHART_DAYS))}
          </div>
        </div>
        <div
          ref={barScrollRef}
          className="-mx-0.5 overflow-x-auto px-0.5 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/90 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600"
        >
          <div
            className="flex items-end gap-[7px]"
            style={{ width: CHART_DAYS * (BAR_W + BAR_GAP), minWidth: '100%', height: BAR_H + 24 }}
          >
            {dates.map((date, i) => {
              const v = values[i]
              const isToday = date === todayDate
              const dm = dailyHistoryPerProfile[date] ?? {}
              type Seg = { val: number; color: string; label: string }
              const segs: Seg[] = []
              if (settings && v > 0) {
                displayProfiles(settings, dm).forEach((p, pi) => {
                  const tot = tokenSum(dm[p.id] ?? emptyTotals())
                  if (tot > 0) segs.push({ val: tot, color: COLORS[pi % COLORS.length], label: p.name })
                })
                segs.sort((a, b) => b.val - a.val)
                const sumP = segs.reduce((s, x) => s + x.val, 0)
                const other = Math.max(0, v - sumP)
                if (other > 0) segs.push({ val: other, color: OTHER_STACK_COLOR, label: t.stats.chartOther })
                segs.sort((a, b) => b.val - a.val)
              }
              const barTotalH = v > 0 ? Math.max(4, Math.round((v / maxVal) * BAR_H)) : 3

              const handleHover = (e: React.MouseEvent<HTMLDivElement>) => {
                setHoverBar(date)
                const rect = e.currentTarget.getBoundingClientRect()
                setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 4 })
              }

              const barClass = v <= 0
                ? 'w-full shrink-0 rounded-sm bg-stone-300/50 dark:bg-zinc-700/55 cursor-default'
                : segs.length === 0
                  ? `w-full shrink-0 overflow-hidden rounded-md cursor-default ${
                      isToday
                        ? 'bg-[#e8a820] shadow-sm ring-1 ring-amber-600/35 dark:ring-amber-400/30'
                        : 'bg-[#f5c84c] dark:bg-amber-500/75'
                    }`
                  : 'flex w-full shrink-0 flex-col-reverse gap-px overflow-hidden rounded-md bg-stone-200/60 dark:bg-zinc-950/80 cursor-default'

              return (
                <div key={date} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: BAR_W }}>
                  <div className="flex w-full flex-col justify-end relative" style={{ height: BAR_H }}
                    onMouseEnter={handleHover}
                    onMouseLeave={() => setHoverBar(null)}
                  >
                    {v <= 0 ? (
                      <div className={barClass} style={{ height: 3 }} />
                    ) : segs.length === 0 ? (
                      <div className={barClass} style={{ height: barTotalH }} />
                    ) : (
                      <div className={barClass} style={{ height: barTotalH }}>
                        {segs.map((s, si) => (
                          <div
                            key={`${date}-${si}-${s.label}`}
                            className="w-full min-h-[2px] shrink-0 rounded-[2px]"
                            style={{ flexGrow: s.val, flexBasis: 0, backgroundColor: s.color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[9px] leading-none tabular-nums ${
                      isToday
                        ? 'font-semibold text-amber-800 dark:text-amber-400'
                        : 'text-stone-500/80 dark:text-claude-muted/70'
                    }`}
                  >
                    {shortDate(date)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Custom tooltip showing all models for hovered day */}
        {hoverBar && createPortal(
          <div className="pointer-events-none fixed z-[200] rounded-lg border border-[var(--theme-panel-border)] bg-[var(--theme-card-bg)] px-3 py-2 shadow-lg dark:shadow-black/40"
            style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translate(-50%, -100%)' }}
          >
            <div className="text-[10px] font-semibold text-claude-text mb-1">{hoverBar}</div>
            {(() => {
              const dh = dailyHistory[hoverBar]
              if (!dh) return null
              const totalTokens = tokenSum(dh)
              const dm = dailyHistoryPerProfile[hoverBar] ?? {}
              const modelRows: { label: string; val: number; color: string }[] = []
              let attributed = 0
              if (settings) {
                displayProfiles(settings, dm).forEach((p, pi) => {
                  const t = tokenSum(dm[p.id] ?? emptyTotals())
                  if (t > 0) {
                    modelRows.push({ label: p.name, val: t, color: COLORS[pi % COLORS.length] })
                    attributed += t
                  }
                })
              }
              const other = Math.max(0, totalTokens - attributed)
              if (other > 0) modelRows.push({ label: t.stats.chartOther, val: other, color: OTHER_STACK_COLOR })
              modelRows.sort((a, b) => b.val - a.val)
              return (
                <>
                  <div className="text-[10px] text-claude-muted font-mono mb-1">{formatK(totalTokens)} tokens · {formatCost(dayCosts[hoverBar] ?? 0)}</div>
                  <div className="flex flex-col gap-0.5">
                    {modelRows.map((r) => (
                      <div key={r.label} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="text-[10px] text-claude-text flex-1 truncate">{r.label}</span>
                        <span className="text-[10px] font-mono text-claude-muted">{formatK(r.val)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>,
          document.body
        )}

        {recentStackedLegend.length > 0 ? (
          <div className="mt-2 space-y-1 border-t border-stone-300/45 pt-2 dark:border-[var(--theme-panel-border)]">
            <div className="text-[9px] font-medium uppercase tracking-wide text-stone-500 dark:text-claude-muted">
              {t.stats.chartStackLegend}
            </div>
            {recentStackedLegend.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[10px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-claude-text">
                  {r.other ? t.stats.chartOther : r.name}
                </span>
                <span className="shrink-0 font-mono text-stone-600 dark:text-claude-muted">{formatK(r.tokens)}</span>
                <span className="w-9 shrink-0 text-right font-mono text-stone-500 dark:text-claude-muted/80">
                  {r.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-2 border-t border-stone-300/45 pt-2 text-center text-[10px] text-stone-600 dark:border-[var(--theme-panel-border)] dark:text-claude-muted">
          {t.stats.peak}:{' '}
          <span className="font-mono font-semibold text-stone-800 dark:text-claude-text">{formatK(maxVal)}</span>{' '}
          {t.stats.tokensPerDay}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHeatmapModalOpen(true)}
        className="mt-1 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] py-2.5 text-[11px] font-medium text-claude-muted transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-300"
      >
        <span className="inline-grid h-3.5 w-3.5 grid-cols-2 gap-px" aria-hidden>
          <span className="rounded-[1px] bg-sky-300/90 dark:bg-sky-500/80" />
          <span className="rounded-[1px] bg-sky-200/80 dark:bg-sky-600/50" />
          <span className="rounded-[1px] bg-sky-400 dark:bg-sky-400/70" />
          <span className="rounded-[1px] bg-stone-300/70 dark:bg-zinc-600" />
        </span>
        {t.stats.overviewHeatmapOpen}
      </button>

      {heatmapModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="stats-heatmap-dialog-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeHeatmapModal()
              }}
            >
              <div
                className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--theme-panel-border)] bg-[var(--theme-card-bg)] shadow-2xl shadow-black/20 ring-1 ring-black/5 dark:ring-white/10"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg-soft)] px-4 py-3">
                  <div className="min-w-0">
                    <h2 id="stats-heatmap-dialog-title" className="text-sm font-semibold text-claude-text">
                      {t.stats.overviewHeatmapDialogTitle}
                    </h2>
                    <p className="mt-0.5 text-[10px] leading-snug text-claude-muted">{t.stats.overviewHeatmapDialogDesc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeHeatmapModal}
                    className="shrink-0 rounded-lg border border-transparent px-2 py-1 text-[11px] text-claude-muted transition-colors hover:border-[var(--theme-panel-border)] hover:bg-[var(--theme-card-bg)] hover:text-claude-text"
                    aria-label={t.common.close}
                  >
                    {t.common.close}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
                  <UsageOverviewDashboard
                    embedded
                    dailyHistory={dailyHistory}
                    dailyHistoryPerProfile={dailyHistoryPerProfile}
                    settings={settings}
                    profileStats={profileStats}
                    todayDate={todayDate}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

function SummaryCard({ label, tokens, cost }: { label: string; tokens: TokenTotals; cost: number }) {
  return (
    <div className="bg-claude-surface rounded-lg p-3 border border-claude-border">
      <div className="text-[10px] text-claude-muted mb-1.5">{label}</div>
      <div className="text-lg font-semibold text-claude-text leading-none">{formatK(tokenSum(tokens))}</div>
      <div className="text-[9px] text-claude-muted mt-0.5 mb-1.5">tokens</div>
      <div className="text-[11px] text-amber-400 font-mono">{formatCost(cost)}</div>
    </div>
  )
}

function BreakdownSection({ label, rows }: { label: string; rows: { name: string; val: number; cost: number; color: string }[] }) {
  return (
    <div>
      <div className="text-[10px] text-claude-muted mb-1.5 uppercase tracking-wider">{label}</div>
      <div className="flex flex-col gap-1">
        {rows.filter(r => r.val > 0).map(({ name, val, cost, color }) => (
          <div key={name} className="flex items-center text-[11px]">
            <span className={`${color} w-14 shrink-0`}>{name}</span>
            <span className="text-claude-text font-mono text-right flex-1">{formatK(val)}</span>
            <span className="text-[10px] text-claude-muted font-mono ml-3">{formatCost(cost)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
