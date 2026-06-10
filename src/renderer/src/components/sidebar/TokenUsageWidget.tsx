import React, { useState, useEffect } from 'react'
import { useGlobalTokenStore, tokenSum, computeCost, DEFAULT_PRICING, type TokenTotals, type Pricing } from '../../store/globalTokenStore'
import { fmtTokens } from '../../lib/formatTokens'
import { useI18n } from '../../i18n'
import type { ClaudeSettings } from '../../types/settings'
import { OFFICIAL_PROFILE_ID } from '../../types/settings'

// [2026-06-09] 模型定价映射（¥/M tokens，Anthropic USD × 7）— 用于 per-model 费用计算
// 来源: https://platform.claude.com/docs/en/about-claude/pricing
const MODEL_PRICING: Record<string, Pricing> = {
  'opus':    { inputPerM: 35,  outputPerM: 175, cacheCreatePerM: 43.75, cacheReadPerM: 3.50 },
  'sonnet':  { inputPerM: 21,  outputPerM: 105, cacheCreatePerM: 26.25, cacheReadPerM: 2.10 },
  'haiku':   { inputPerM: 7,   outputPerM: 35,  cacheCreatePerM: 8.75,  cacheReadPerM: 0.70 },
  'fable':   { inputPerM: 70,  outputPerM: 350, cacheCreatePerM: 87.50, cacheReadPerM: 7.00 },
}

/** 从模型 ID（如 "claude-sonnet-4-20250514"）提取定价 key */
function modelToPricingKey(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.includes('opus')) return 'opus'
  if (lower.includes('haiku')) return 'haiku'
  return 'sonnet' // 默认按 sonnet 计费
}

/** 模型 ID → 短显示名 */
function modelDisplayName(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.includes('opus')) return 'Opus'
  if (lower.includes('haiku')) return 'Haiku'
  if (lower.includes('sonnet')) return 'Sonnet'
  // 取最后一段作为 fallback
  return modelId.split('-').pop() ?? modelId
}

function fmtCost(usd: number): string {
  if (usd < 0.001) return '<¥0.001'
  if (usd < 1) return `¥${usd.toFixed(3)}`
  return `¥${usd.toFixed(2)}`
}

// ── 等级系统（300 级，幂次曲线，满级 = 1 万亿 token）──────
const MAX_LEVEL = 300
const MAX_TOKENS = 1_000_000_000_000   // 1 万亿
const CURVE_EXP = 2.5                  // 指数越大，后期越陡

/** 达到该等级所需的最低累计 token 数 */
function tokensForLevel(level: number): number {
  if (level <= 1) return 0
  if (level >= MAX_LEVEL) return MAX_TOKENS
  return Math.round(MAX_TOKENS * Math.pow((level - 1) / (MAX_LEVEL - 1), CURVE_EXP))
}

/** 根据累计 token 计算当前等级（1-300） */
function levelFromTokens(total: number): number {
  if (total >= MAX_TOKENS) return MAX_LEVEL
  let lo = 1, hi = MAX_LEVEL
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (tokensForLevel(mid) <= total) lo = mid
    else hi = mid - 1
  }
  return lo
}

interface TierDef { minLevel: number; maxLevel: number; title: string; emoji: string; color: string }

const TIERS: TierDef[] = [
  { minLevel: 1,   maxLevel: 30,  title: '石头',  emoji: '🪨', color: '#6b7280' },
  { minLevel: 31,  maxLevel: 60,  title: '青铜',  emoji: '🥉', color: '#b45309' },
  { minLevel: 61,  maxLevel: 100, title: '白银',  emoji: '🥈', color: '#94a3b8' },
  { minLevel: 101, maxLevel: 150, title: '黄金',  emoji: '🥇', color: '#d97706' },
  { minLevel: 151, maxLevel: 200, title: '铂金',  emoji: '💫', color: '#a78bfa' },
  { minLevel: 201, maxLevel: 250, title: '钻石',  emoji: '💎', color: '#38bdf8' },
  { minLevel: 251, maxLevel: 299, title: '王者',  emoji: '👑', color: '#f97316' },
  { minLevel: 300, maxLevel: 300, title: '神话',  emoji: '🌟', color: '#fbbf24' },
]

function getTier(level: number): TierDef {
  return TIERS.find((t) => level >= t.minLevel && level <= t.maxLevel) ?? TIERS[0]!
}

function getLevelInfo(totalTokens: number): {
  level: number
  tier: TierDef
  progress: number
  nextTokens: number
  curTokens: number
} {
  const level = levelFromTokens(totalTokens)
  const tier = getTier(level)
  const curTokens = tokensForLevel(level)
  const nextTokens = level < MAX_LEVEL ? tokensForLevel(level + 1) : MAX_TOKENS
  const progress = level >= MAX_LEVEL ? 1 : Math.min(1, (totalTokens - curTokens) / (nextTokens - curTokens))
  return { level, tier, progress, nextTokens, curTokens }
}

function LevelBar({ totalTokens }: { totalTokens: number }): React.ReactElement {
  const { level, tier, progress, nextTokens } = getLevelInfo(totalTokens)
  const isMax = level >= MAX_LEVEL
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <span className="text-sm leading-none">{tier.emoji}</span>
          <span className="text-[10px] font-semibold" style={{ color: tier.color }}>
            Lv.{level} {tier.title}
          </span>
        </div>
        {isMax ? (
          <span className="text-[9px] font-bold" style={{ color: tier.color }}>MAX</span>
        ) : (
          <span className="text-[9px] text-claude-muted">
            距 Lv.{level + 1}：{fmtTokens(nextTokens - totalTokens)}
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-claude-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progress * 100}%`, backgroundColor: tier.color }}
        />
      </div>
    </div>
  )
}

function parseBudget(s: string): number | null {
  const t = s.trim().toUpperCase()
  if (!t) return 0  // empty = clear budget
  const mM = t.match(/^([\d.]+)M$/)
  if (mM) return Math.round(parseFloat(mM[1]) * 1_000_000)
  const mK = t.match(/^([\d.]+)K$/)
  if (mK) return Math.round(parseFloat(mK[1]) * 1_000)
  const n = parseFloat(t)
  if (isNaN(n) || n < 0 || !/^\d+$/.test(t)) return null  // invalid
  return Math.floor(n)
}

function BudgetBar({ used, budget }: { used: number; budget: number }): React.ReactElement | null {
  if (budget <= 0) return null
  const pct = Math.min(1, used / budget)
  const color =
    pct >= 0.9
      ? '#ef4444'
      : pct >= 0.7
        ? '#f59e0b'
        : '#22c55e'
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[9px] text-claude-muted mb-0.5">
        <span>
          {fmtTokens(used)} / {fmtTokens(budget)}
        </span>
        <span>{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-claude-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function TokenUsageWidget(): React.ReactElement {
  const total = useGlobalTokenStore((s) => s.total)
  const today = useGlobalTokenStore((s) => s.today)
  const todayDate = useGlobalTokenStore((s) => s.todayDate)
  const budget = useGlobalTokenStore((s) => s.budget)
  const globalPricing = useGlobalTokenStore((s) => s.pricing)
  const perProfile = useGlobalTokenStore((s) => s.perProfile)
  const dailyHistoryPerProfile = useGlobalTokenStore((s) => s.dailyHistoryPerProfile)
  const perModel = useGlobalTokenStore((s) => s.perModel)
  const dailyHistoryPerModel = useGlobalTokenStore((s) => s.dailyHistoryPerModel)
  const hideDetailedTokens = useGlobalTokenStore((s) => s.hideDetailedTokens)
  const setBudget = useGlobalTokenStore((s) => s.setBudget)
  const resetTotal = useGlobalTokenStore((s) => s.resetTotal)
  const setHideDetailedTokens = useGlobalTokenStore((s) => s.setHideDetailedTokens)


  // [2026-04-28] Get profile pricing map — re-fetch on broadcast changes
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  useEffect(() => {
    void window.electronAPI.settings.get().then(setSettings)
    return window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then(setSettings)
    })
  }, [])

  // Fallback: single pricing for global aggregates (migration / no per-profile data)
  // [2026-06-05] 官方配置 (__official__) 不在 profiles 数组中，不能 fallback 到 profiles[0]
  const isOfficialActive = settings?.activeProfileId === OFFICIAL_PROFILE_ID
  const activeProfile = isOfficialActive
    ? null
    : (settings?.profiles.find(p => p.id === settings?.activeProfileId) ?? settings?.profiles[0])
  const singlePricing = activeProfile?.pricing ?? globalPricing ?? DEFAULT_PRICING

  // [2026-04-28] Compute costs using each profile's own pricing.
  // Also adds unattributed remainder (tokens ingested before per-profile tracking) at singlePricing.
  function computePerProfileCost(totals: Record<string, TokenTotals>, globalRef?: TokenTotals): number {
    let cost = 0
    let sumInput = 0, sumOutput = 0, sumCC = 0, sumCR = 0
    for (const [profileId, t] of Object.entries(totals)) {
      const profile = settings?.profiles.find(p => p.id === profileId)
      const p = profile?.pricing ?? globalPricing ?? singlePricing ?? DEFAULT_PRICING
      cost += computeCost(t, p)
      sumInput += t.input; sumOutput += t.output; sumCC += t.cacheCreate; sumCR += t.cacheRead
    }
    if (globalRef) {
      const unattributed: TokenTotals = {
        input: Math.max(0, globalRef.input - sumInput),
        output: Math.max(0, globalRef.output - sumOutput),
        cacheCreate: Math.max(0, globalRef.cacheCreate - sumCC),
        cacheRead: Math.max(0, globalRef.cacheRead - sumCR)
      }
      if (unattributed.input + unattributed.output + unattributed.cacheCreate + unattributed.cacheRead > 0) {
        cost += computeCost(unattributed, singlePricing)
      }
    }
    return cost
  }

  const hasPerProfileData = Object.keys(perProfile).length > 0
  const todayPerProfileTotals = dailyHistoryPerProfile[todayDate] ?? {}
  const hasTodayPerProfileData = Object.keys(todayPerProfileTotals).length > 0

  // [2026-06-09] Per-model cost computation — 使用各模型自己的定价
  const hasPerModelData = Object.keys(perModel).length > 0
  const todayPerModelTotals = dailyHistoryPerModel[todayDate] ?? {}
  const hasTodayPerModelData = Object.keys(todayPerModelTotals).length > 0

  function computePerModelCost(totals: Record<string, TokenTotals>): number {
    let cost = 0
    for (const [modelId, t] of Object.entries(totals)) {
      const key = modelToPricingKey(modelId)
      const p = MODEL_PRICING[key] ?? singlePricing
      cost += computeCost(t, p)
    }
    return cost
  }

  const todayCost = hasTodayPerProfileData
    ? computePerProfileCost(todayPerProfileTotals, today)
    : computeCost(today, singlePricing)
  const totalCost = hasPerProfileData
    ? computePerProfileCost(perProfile, total)
    : computeCost(total, singlePricing)

  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [budgetError, setBudgetError] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { t } = useI18n()

  const totalUsed = tokenSum(total)
  const todayUsed = tokenSum(today)

  function startEdit(): void {
    setBudgetDraft(budget > 0 ? String(budget) : '')
    setBudgetError(false)
    setEditingBudget(true)
  }

  function commitBudget(): void {
    const result = parseBudget(budgetDraft)
    if (result === null) {
      // Invalid input — flash error state, keep editor open
      setBudgetError(true)
      setTimeout(() => setBudgetError(false), 1500)
      return
    }
    setBudget(result)
    setEditingBudget(false)
  }

  function handleBudgetKey(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') commitBudget()
    if (e.key === 'Escape') {
      setBudgetError(false)
      setEditingBudget(false)
    }
  }

  function handleReset(): void {
    if (confirmReset) {
      resetTotal()
      setConfirmReset(false)
    } else {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
    }
  }

  return (
    <div className="px-3 py-2 border-t border-claude-border text-[10px] text-claude-muted shrink-0">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold uppercase tracking-wider text-[9px]">{t.token.title}</span>
        <div className="flex items-center gap-1.5">
          {/* 切换详细显示 */}
          <button
            onClick={() => setHideDetailedTokens(!hideDetailedTokens)}
            title={hideDetailedTokens ? '显示详细用量' : '隐藏详细用量，只显示等级'}
            className={`text-[9px] transition-colors ${
              hideDetailedTokens ? 'text-amber-400' : 'text-claude-muted hover:text-amber-400'
            }`}
          >
            {hideDetailedTokens ? '📊' : '🔒'}
          </button>
          <button
            onClick={startEdit}
            title={budget > 0 ? `Budget: ${fmtTokens(budget)} — click to edit` : t.token.budgetTitle}
            className="text-[9px] text-claude-muted hover:text-amber-400 transition-colors"
          >
            {budget > 0 ? `⚡${fmtTokens(budget)}` : t.token.addBudget}
          </button>
          <button
            onClick={handleReset}
            title={confirmReset ? t.token.confirmReset : t.token.resetTitle}
            className={`text-[9px] transition-colors ${
              confirmReset ? 'text-red-400' : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {confirmReset ? t.token.confirmReset : '↺'}
          </button>
        </div>
      </div>

      {/* Budget editor */}
      {editingBudget && (
        <div className="flex gap-1 mb-1.5">
          <input
            autoFocus
            value={budgetDraft}
            onChange={(e) => { setBudgetDraft(e.target.value); setBudgetError(false) }}
            onKeyDown={handleBudgetKey}
            onBlur={commitBudget}
            placeholder={t.token.budgetPlaceholder}
            className={`flex-1 rounded border px-1.5 py-0.5 text-[10px] text-claude-text outline-none font-mono bg-claude-bg ${
              budgetError ? 'border-red-500 animate-pulse' : 'border-amber-600/50'
            }`}
          />
          {budgetError ? (
            <span className="text-[9px] text-red-400 px-1 self-center">{t.token.budgetInvalid}</span>
          ) : (
            <button onClick={commitBudget} className="text-[9px] text-amber-400 hover:text-amber-300 px-1">
              OK
            </button>
          )}
        </div>
      )}

      {/* Today / Total rows - 根据 hideDetailedTokens 决定显示 */}
      {hideDetailedTokens ? (
        <div className="space-y-0.5">
          <div className="flex justify-between items-baseline">
            <span className="text-claude-muted">{t.token.today}</span>
            <span className="font-mono tabular-nums text-right text-amber-400">
              {fmtCost(todayCost)}
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-claude-muted">{t.token.total}</span>
            <span className="font-mono tabular-nums text-right text-amber-400">
              {fmtCost(totalCost)}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="flex justify-between items-baseline">
            <span className="text-claude-muted">{t.token.today}</span>
            <span className="font-mono tabular-nums text-right">
              {fmtTokens(today.input)}↑ {fmtTokens(today.output)}↓
              {today.cacheRead > 0 && (
                <span className="text-sky-400/70 ml-1">{fmtTokens(today.cacheRead)}⚡</span>
              )}
              <span className="text-amber-400 ml-1.5">{fmtCost(todayCost)}</span>
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-claude-muted">{t.token.total}</span>
            <span className="font-mono tabular-nums text-right">
              {fmtTokens(total.input)}↑ {fmtTokens(total.output)}↓
              {total.cacheRead > 0 && (
                <span className="text-sky-400/70 ml-1">{fmtTokens(total.cacheRead)}⚡</span>
              )}
              <span className="text-amber-400 ml-1.5">{fmtCost(totalCost)}</span>
            </span>
          </div>
        </div>
      )}

      {/* 等级经验条 */}
      <LevelBar totalTokens={totalUsed} />

      {/* Budget progress bar — uses total when budget set, otherwise hidden */}
      {!hideDetailedTokens && <BudgetBar used={budget > 0 ? totalUsed : todayUsed} budget={budget} />}

      {/* [2026-06-09] Per-model breakdown（官方配置下自动路由的模型细分） */}
      {hasPerModelData && !hideDetailedTokens && (() => {
        // 按 token 总量降序排列
        const sorted = Object.entries(perModel)
          .map(([id, t]) => ({ id, t, total: tokenSum(t) }))
          .filter(e => e.total > 0)
          .sort((a, b) => b.total - a.total)
        if (sorted.length < 1) return null
        const totalModelCost = computePerModelCost(perModel)
        return (
          <div className="mt-1.5 pt-1 border-t border-claude-border/40">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-claude-muted/70 uppercase tracking-wider">Models</span>
              <span className="font-mono text-[9px] text-amber-400/80">{fmtCost(totalModelCost)}</span>
            </div>
            {sorted.map(({ id, t: mt }) => {
              const key = modelToPricingKey(id)
              const p = MODEL_PRICING[key] ?? singlePricing
              const cost = computeCost(mt, p)
              return (
                <div key={id} className="flex items-center justify-between text-[9px] py-px">
                  <span className="text-claude-muted/80">{modelDisplayName(id)}</span>
                  <span className="font-mono tabular-nums text-claude-muted/70">
                    {fmtTokens(mt.input)}↑ {fmtTokens(mt.output)}↓
                    <span className="text-amber-400/70 ml-1">{fmtCost(cost)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
