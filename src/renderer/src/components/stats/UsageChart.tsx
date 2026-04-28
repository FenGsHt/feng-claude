import React, { useState, useEffect } from 'react'
import { useGlobalTokenStore, tokenSum, computeCost, DEFAULT_PRICING, type TokenTotals, type Pricing } from '../../store/globalTokenStore'
import type { ClaudeSettings } from '../../types/settings'

const CHART_DAYS = 14
const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#8b5cf6']

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

function PieChart({ slices }: { slices: PieSlice[] }): React.ReactElement | null {
  if (slices.length === 0) return null

  const SIZE = 120
  const R = 52
  const CX = SIZE / 2
  const CY = SIZE / 2
  const TOTAL = slices.reduce((s, p) => s + p.value, 0)

  let cumAngle = -Math.PI / 2 // start from top

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
      <div className="text-[10px] text-claude-muted mb-2 uppercase tracking-wider">各配置占比</div>
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

  // Get settings for profile names and pricing
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  useEffect(() => {
    void window.electronAPI.settings.get().then(setSettings)
    return window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then(setSettings)
    })
  }, [])

  const activeProfile = settings?.profiles.find(p => p.id === settings.activeProfileId) ?? settings?.profiles[0]
  const pricing: Pricing = activeProfile?.pricing ?? globalPricing ?? DEFAULT_PRICING

  const todayCost = computeCost(today, pricing)
  const totalCost = computeCost(total, pricing)

  // Today breakdown
  const todayRows: { name: string; val: number; cost: number; color: string }[] = [
    { name: 'Input', val: today.input, cost: (today.input / 1_000_000) * pricing.inputPerM, color: 'text-blue-400' },
    { name: 'Output', val: today.output, cost: (today.output / 1_000_000) * pricing.outputPerM, color: 'text-green-400' },
    { name: 'Cache↑', val: today.cacheCreate, cost: (today.cacheCreate / 1_000_000) * pricing.cacheCreatePerM, color: 'text-purple-400' },
    { name: 'Cache↓', val: today.cacheRead, cost: (today.cacheRead / 1_000_000) * pricing.cacheReadPerM, color: 'text-amber-400' },
  ]

  // Per-profile pie chart
  const pieSlices = buildPieSlices(settings, perProfile, total)

  // Per-profile stats
  const profileStats = settings?.profiles.map((profile, i) => {
    const t = perProfile[profile.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    const profilePricing: Pricing = profile.pricing ?? DEFAULT_PRICING
    return {
      id: profile.id,
      name: profile.name,
      tokens: tokenSum(t),
      cost: computeCost(t, profilePricing),
      color: COLORS[i % COLORS.length]
    }
  }) ?? []

  // 14-day bar chart
  const dates = lastNDates(CHART_DAYS)
  const values = dates.map((d) => {
    const t = dailyHistory[d] ?? null
    return t ? tokenSum(t) : 0
  })
  const maxVal = Math.max(...values, 1)
  const dayCosts = Object.fromEntries(Object.entries(dailyHistory).map(([d, t]) => [d, computeCost(t, pricing)]))

  const BAR_H = 80
  const BAR_W = 10

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto h-full">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label="今日" tokens={today} cost={todayCost} />
        <SummaryCard label="累计" tokens={total} cost={totalCost} />
      </div>

      {/* Today breakdown */}
      <BreakdownSection label="今日明细" rows={todayRows} />

      {/* Per-profile pie chart */}
      {pieSlices.length > 0 && <PieChart slices={pieSlices} />}

      {/* Per-profile list (compact) */}
      {profileStats.some(s => s.tokens > 0) && (
        <div>
          <div className="text-[10px] text-claude-muted mb-1.5 uppercase tracking-wider">各配置用量</div>
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
        <div className="text-[10px] text-claude-muted mb-2 uppercase tracking-wider">近 {CHART_DAYS} 天</div>
        <div className="flex items-end gap-[4px]" style={{ height: BAR_H + 18 }}>
          {dates.map((date, i) => {
            const v = values[i]
            const barH = v > 0 ? Math.max(3, Math.round((v / maxVal) * BAR_H)) : 2
            const isToday = date === todayDate
            return (
              <div key={date} className="flex flex-col items-center gap-0.5" style={{ width: BAR_W }}>
                <div
                  title={`${date}: ${formatK(v)} tokens · ${formatCost(dayCosts[date] ?? 0)}`}
                  className={`w-full rounded-sm ${isToday ? 'bg-amber-400' : v > 0 ? 'bg-amber-400/70' : 'bg-claude-border/30'}`}
                  style={{ height: barH, marginTop: BAR_H - barH }}
                />
                <span className={`text-[8px] leading-none ${isToday ? 'text-amber-400 font-semibold' : 'text-claude-muted/50'}`}>
                  {shortDate(date)}
                </span>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-claude-muted text-center mt-2">
          最高: <span className="text-claude-text">{formatK(maxVal)}</span> tokens/天
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
