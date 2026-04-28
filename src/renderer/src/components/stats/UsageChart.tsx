import React, { useState, useEffect } from 'react'
import { useGlobalTokenStore, tokenSum, computeCost, DEFAULT_PRICING, type TokenTotals, type Pricing } from '../../store/globalTokenStore'
import type { ClaudeSettings } from '../../types/settings'

const CHART_DAYS = 14

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

export function UsageChart(): React.ReactElement {
  const { dailyHistory, total, today, perProfile, pricing: globalPricing } = useGlobalTokenStore()

  // [2026-04-28] Get settings for profile names and pricing — re-fetch on broadcast changes
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  useEffect(() => {
    void window.electronAPI.settings.get().then(setSettings)
    return window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then(setSettings)
    })
  }, [])
  const activeProfile = settings?.profiles.find(p => p.id === settings.activeProfileId) ?? settings?.profiles[0]
  const pricing: Pricing = activeProfile?.pricing ?? globalPricing ?? DEFAULT_PRICING

  const dayCosts = Object.fromEntries(
    Object.entries(dailyHistory).map(([d, t]) => [d, computeCost(t, pricing)])
  )

  const dates = lastNDates(CHART_DAYS)
  const values = dates.map((d) => {
    const t = dailyHistory[d] ?? null
    return t ? tokenSum(t) : 0
  })
  const maxVal = Math.max(...values, 1)

  const BAR_H = 80
  const BAR_W = 12

  // [2026-04-28] Build per-profile stats - show ALL profiles including those with 0 usage
  const allProfileStats = settings?.profiles.map((profile) => {
    const totals = perProfile[profile.id] ?? { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
    const profilePricing: Pricing = profile.pricing ?? DEFAULT_PRICING
    return {
      id: profile.id,
      name: profile.name,
      totals,
      cost: computeCost(totals, profilePricing),
      tokens: tokenSum(totals)
    }
  }) ?? []

  // [2026-04-28] If there's total usage but no per-profile data, assign to active profile
  const hasPerProfileData = Object.keys(perProfile).length > 0
  const profileStats = allProfileStats.map((stat) => {
    // If no per-profile tracking yet and this is active profile, show total
    if (!hasPerProfileData && stat.id === settings?.activeProfileId && tokenSum(total) > 0) {
      const profilePricing: Pricing = (settings?.profiles.find(p => p.id === stat.id)?.pricing) ?? DEFAULT_PRICING
      return {
        ...stat,
        totals: total,
        cost: computeCost(total, profilePricing),
        tokens: tokenSum(total)
      }
    }
    return stat
  })

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto h-full">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="今日" value={tokenSum(today)} cost={computeCost(today, pricing)} />
        <StatCard label="累计" value={tokenSum(total)} cost={computeCost(total, pricing)} />
      </div>

      {/* Breakdown today */}
      <BreakdownRow label="今日明细" totals={today} pricing={pricing} />

      {/* [2026-04-28] Per-profile breakdown */}
      {profileStats.length > 0 && (
        <div>
          <div className="text-[10px] text-claude-muted mb-2 uppercase tracking-wider">各配置用量</div>
          <div className="flex flex-col gap-1">
            {profileStats.map((stat) => (
              <div key={stat.id} className="flex items-center text-[11px]">
                <span className="text-amber-400 w-16 shrink-0 truncate">{stat.name}</span>
                <span className="text-claude-text font-mono w-10 text-right shrink-0">{formatK(stat.tokens)}</span>
                <span className="text-[10px] text-claude-muted font-mono ml-auto text-right">{formatCost(stat.cost)}</span>
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
            const isToday = date === new Date().toISOString().slice(0, 10)
            return (
              <div key={date} className="flex flex-col items-center gap-0.5" style={{ width: BAR_W }}>
                <div
                  title={`${date}: ${formatK(v)} tokens · ${formatCost(dayCosts[date] ?? 0)}`}
                  className={`w-full rounded-sm transition-all ${isToday ? 'bg-amber-400' : v > 0 ? 'bg-amber-600/70' : 'bg-claude-border/30'}`}
                  style={{ height: barH, marginTop: BAR_H - barH }}
                />
                {(i === 0 || i === CHART_DAYS - 1 || isToday) && (
                  <span className={`text-[8px] leading-none ${isToday ? 'text-amber-400' : 'text-claude-border'}`}>
                    {shortDate(date)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="text-[10px] text-claude-muted text-center">
        最高: <span className="text-claude-text">{formatK(maxVal)}</span> tokens/天
      </div>
    </div>
  )
}

function StatCard({ label, value, cost }: { label: string; value: number; cost: number }) {
  return (
    <div className="bg-claude-surface rounded-md p-2.5 border border-claude-border">
      <div className="text-[10px] text-claude-muted mb-1">{label}</div>
      <div className="text-base font-semibold text-claude-text">{formatK(value)}</div>
      <div className="text-[9px] text-claude-muted">tokens</div>
      <div className="text-[10px] text-amber-400 mt-0.5 font-mono">{formatCost(cost)}</div>
    </div>
  )
}

function BreakdownRow({ label, totals, pricing }: { label: string; totals: TokenTotals; pricing: Pricing }) {
  const rows: [string, number, number, string][] = [
    ['Input', totals.input, (totals.input / 1_000_000) * pricing.inputPerM, 'text-blue-400'],
    ['Output', totals.output, (totals.output / 1_000_000) * pricing.outputPerM, 'text-green-400'],
    ['Cache↑', totals.cacheCreate, (totals.cacheCreate / 1_000_000) * pricing.cacheCreatePerM, 'text-purple-400'],
    ['Cache↓', totals.cacheRead, (totals.cacheRead / 1_000_000) * pricing.cacheReadPerM, 'text-amber-400'],
  ]
  return (
    <div>
      <div className="text-[10px] text-claude-muted mb-1.5 uppercase tracking-wider">{label}</div>
      <div className="flex flex-col gap-0.5">
        {rows.map(([name, val, cost, color]) => (
          <div key={name} className="flex items-center text-[11px]">
            <span className={`${color} w-12 shrink-0`}>{name}</span>
            <span className="text-claude-text font-mono w-10 text-right shrink-0">{formatK(val)}</span>
            <span className="text-[10px] text-claude-muted font-mono ml-auto text-right">{formatCost(cost)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
