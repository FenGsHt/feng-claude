import React, { useState } from 'react'
import { useGlobalTokenStore, tokenSum } from '../../store/globalTokenStore'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`
  return String(n)
}

function parseBudget(s: string): number {
  const t = s.trim().toUpperCase()
  if (/^\d+M$/.test(t)) return parseFloat(t) * 1_000_000
  if (/^\d+K$/.test(t)) return parseFloat(t) * 1_000
  const n = parseFloat(t)
  return isNaN(n) ? 0 : Math.floor(n)
}

function BudgetBar({ used, budget }: { used: number; budget: number }): React.ReactElement | null {
  if (budget <= 0) return null
  const pct = Math.min(1, used / budget)
  const color =
    pct >= 0.9
      ? '#ef4444' // red-500
      : pct >= 0.7
        ? '#f59e0b' // amber-500
        : '#22c55e' // green-500
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[9px] text-claude-muted mb-0.5">
        <span>
          {fmt(used)} / {fmt(budget)}
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
  const setBudget = useGlobalTokenStore((s) => s.setBudget)
  const resetTotal = useGlobalTokenStore((s) => s.resetTotal)

  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const totalUsed = tokenSum(total)
  const todayUsed = tokenSum(today)

  function startEdit(): void {
    setBudgetDraft(budget > 0 ? fmt(budget).replace(/[MK]$/, (m) => m) : '')
    setEditingBudget(true)
  }

  function commitBudget(): void {
    const n = parseBudget(budgetDraft)
    setBudget(n)
    setEditingBudget(false)
  }

  function handleBudgetKey(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') commitBudget()
    if (e.key === 'Escape') setEditingBudget(false)
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
        <span className="font-semibold uppercase tracking-wider text-[9px]">Token Usage</span>
        <div className="flex items-center gap-1.5">
          {/* Budget edit */}
          <button
            onClick={startEdit}
            title={budget > 0 ? `Budget: ${fmt(budget)} — click to edit` : 'Set token budget'}
            className="text-[9px] text-claude-muted hover:text-amber-400 transition-colors"
          >
            {budget > 0 ? `⚡${fmt(budget)}` : '+ budget'}
          </button>
          {/* Reset */}
          <button
            onClick={handleReset}
            title={confirmReset ? 'Click again to confirm reset' : 'Reset all-time counters'}
            className={`text-[9px] transition-colors ${
              confirmReset ? 'text-red-400' : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {confirmReset ? 'confirm?' : '↺'}
          </button>
        </div>
      </div>

      {/* Budget editor */}
      {editingBudget && (
        <div className="flex gap-1 mb-1.5">
          <input
            autoFocus
            value={budgetDraft}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onKeyDown={handleBudgetKey}
            onBlur={commitBudget}
            placeholder="e.g. 100M, 50k, 5000000"
            className="flex-1 bg-claude-bg border border-amber-600/50 rounded px-1.5 py-0.5 text-[10px] text-claude-text outline-none font-mono"
          />
          <button
            onClick={commitBudget}
            className="text-[9px] text-amber-400 hover:text-amber-300 px-1"
          >
            OK
          </button>
        </div>
      )}

      {/* Today / Total rows */}
      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span className="text-claude-muted">Today</span>
          <span className="font-mono tabular-nums">
            {fmt(today.input)}↑ {fmt(today.output)}↓
            {today.cacheRead > 0 && (
              <span className="text-sky-400/70 ml-1">{fmt(today.cacheRead)}⚡</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-claude-muted">Total</span>
          <span className="font-mono tabular-nums">
            {fmt(total.input)}↑ {fmt(total.output)}↓
            {total.cacheRead > 0 && (
              <span className="text-sky-400/70 ml-1">{fmt(total.cacheRead)}⚡</span>
            )}
          </span>
        </div>
      </div>

      {/* Budget progress bar */}
      <BudgetBar used={budget > 0 ? totalUsed : todayUsed} budget={budget} />
    </div>
  )
}
