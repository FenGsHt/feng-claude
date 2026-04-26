import React, { useState } from 'react'
import { useGlobalTokenStore, tokenSum, computeCost } from '../../store/globalTokenStore'
import { fmtTokens } from '../../lib/formatTokens'
import { useI18n } from '../../i18n'

function fmtCost(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
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
      <div className="h-1 rounded-full bg-claude-border overflow-hidden">
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
  const budget = useGlobalTokenStore((s) => s.budget)
  const pricing = useGlobalTokenStore((s) => s.pricing)
  const setBudget = useGlobalTokenStore((s) => s.setBudget)
  const resetTotal = useGlobalTokenStore((s) => s.resetTotal)

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

      {/* Today / Total rows */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-baseline">
          <span className="text-claude-muted">{t.token.today}</span>
          <span className="font-mono tabular-nums text-right">
            {fmtTokens(today.input)}↑ {fmtTokens(today.output)}↓
            {today.cacheRead > 0 && (
              <span className="text-sky-400/70 ml-1">{fmtTokens(today.cacheRead)}⚡</span>
            )}
            <span className="text-amber-400 ml-1.5">{fmtCost(computeCost(today, pricing))}</span>
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-claude-muted">{t.token.total}</span>
          <span className="font-mono tabular-nums text-right">
            {fmtTokens(total.input)}↑ {fmtTokens(total.output)}↓
            {total.cacheRead > 0 && (
              <span className="text-sky-400/70 ml-1">{fmtTokens(total.cacheRead)}⚡</span>
            )}
            <span className="text-amber-400 ml-1.5">{fmtCost(computeCost(total, pricing))}</span>
          </span>
        </div>
      </div>

      {/* Budget progress bar — uses total when budget set, otherwise hidden */}
      <BudgetBar used={budget > 0 ? totalUsed : todayUsed} budget={budget} />
    </div>
  )
}
