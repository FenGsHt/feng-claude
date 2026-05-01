import React, { useState, useEffect } from 'react'
import { useGlobalTokenStore, tokenSum, computeCost, DEFAULT_PRICING, type TokenTotals, type Pricing } from '../../store/globalTokenStore'
import type { ClaudeSettings } from '../../types/settings'
import { useI18n } from '../../i18n'

const CHART_DAYS = 14
const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#8b5cf6']

type TimeRange = 'today' | 'week' | 'total'

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
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

  return settings.profiles.map((profile, i) => {
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
  const { dailyHistory, total, today, todayDate, perProfile, pricing: globalPricing, dailyHistoryPerProfile } = useGlobalTokenStore()
  const { t } = useI18n()

  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('today')

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

  // Select data based on time range
  const rangeData = timeRange === 'today' ? today : timeRange === 'week' ? weekTotal : total
  const rangeCost = computeCost(rangeData, pricing)
  const rangePerProfile = timeRange === 'today'
    ? (() => {
        // today per-profile from dailyHistoryPerProfile[todayDate]
        const dayProfiles = dailyHistoryPerProfile[todayDate]
        return dayProfiles ?? {}
      })()
    : timeRange === 'week' ? weekPerProfile : perProfile

  // Breakdown rows
  const breakdownRows: { name: string; val: number; cost: number; color: string }[] = [
    { name: 'Input', val: rangeData.input, cost: (rangeData.input / 1_000_000) * pricing.inputPerM, color: 'text-blue-400' },
    { name: 'Output', val: rangeData.output, cost: (rangeData.output / 1_000_000) * pricing.outputPerM, color: 'text-green-400' },
    { name: 'Cache↑', val: rangeData.cacheCreate, cost: (rangeData.cacheCreate / 1_000_000) * pricing.cacheCreatePerM, color: 'text-purple-400' },
    { name: 'Cache↓', val: rangeData.cacheRead, cost: (rangeData.cacheRead / 1_000_000) * pricing.cacheReadPerM, color: 'text-amber-400' },
  ]

  // Per-profile pie chart
  const pieSlices = buildPieSlices(settings, rangePerProfile, rangeData)

  // Per-profile stats
  const profileStats = settings?.profiles.map((profile, i) => {
    const pt = rangePerProfile[profile.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    const profilePricing: Pricing = profile.pricing ?? DEFAULT_PRICING
    return {
      id: profile.id,
      name: profile.name,
      tokens: tokenSum(pt),
      cost: computeCost(pt, profilePricing),
      color: COLORS[i % COLORS.length]
    }
  }) ?? []

  // 14-day bar chart
  const dates = lastNDates(CHART_DAYS)
  const values = dates.map((d) => {
    const dh = dailyHistory[d] ?? null
    return dh ? tokenSum(dh) : 0
  })
  const maxVal = Math.max(...values, 1)
  const dayCosts = Object.fromEntries(Object.entries(dailyHistory).map(([d, dh]) => [d, computeCost(dh, pricing)]))

  const BAR_H = 80
  const BAR_W = 32
  const BAR_GAP = 8

  const rangeLabel = timeRange === 'today' ? t('stats.today') : timeRange === 'week' ? t('stats.thisWeek') : t('stats.total')
  const breakdownTitle = timeRange === 'today' ? t('stats.todayDetail') : t('stats.periodDetail').replace('{period}', rangeLabel)

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto h-full">
      {/* Time range selector */}
      <div className="flex bg-claude-surface rounded-lg p-0.5 border border-claude-border">
        {([['today', t('stats.today')], ['week', t('stats.thisWeek')], ['total', t('stats.total')]] as const).map(([key, label]) => (
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
      {pieSlices.length > 0 && <PieChart slices={pieSlices} title={t('stats.profileShare')} />}

      {/* Per-profile list */}
      {profileStats.some(s => s.tokens > 0) && (
        <div>
          <div className="text-[10px] text-claude-muted mb-1.5 uppercase tracking-wider">{t('stats.profileUsage')}</div>
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

      {/* Bar chart */}
      <div>
        <div className="text-[10px] text-claude-muted mb-2 uppercase tracking-wider">{t('stats.recentDays').replace('{n}', String(CHART_DAYS))}</div>
        <div ref={(el) => { if (el) el.scrollLeft = el.scrollWidth }} className="overflow-x-auto pb-1 -mx-3 px-3">
          <div className="flex items-end gap-[8px]" style={{ width: CHART_DAYS * (BAR_W + BAR_GAP), minWidth: '100%', height: BAR_H + 22 }}>
            {dates.map((date, i) => {
              const v = values[i]
              const barH = v > 0 ? Math.max(3, Math.round((v / maxVal) * BAR_H)) : 2
              const isToday = date === todayDate
              return (
                <div key={date} className="flex flex-col items-center gap-1 shrink-0" style={{ width: BAR_W }}>
                  <div
                    title={`${date}: ${formatK(v)} tokens · ${formatCost(dayCosts[date] ?? 0)}`}
                    className={`w-full rounded-sm ${isToday ? 'bg-amber-400' : v > 0 ? 'bg-amber-400/70' : 'bg-claude-border/30'}`}
                    style={{ height: barH, marginTop: BAR_H - barH }}
                  />
                  <span className={`text-[9px] leading-none ${isToday ? 'text-amber-400 font-semibold' : 'text-claude-muted/50'}`}>
                    {shortDate(date)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="text-[10px] text-claude-muted text-center mt-2">
          {t('stats.peak')}: <span className="text-claude-text">{formatK(maxVal)}</span> {t('stats.tokensPerDay')}
        </div>
      </div>
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
