import React, { useEffect, useState } from 'react'
import {
  useTriggerStore,
  computeNextFire,
  type Trigger,
  type TriggerTiming,
  type TriggerAction
} from '../../store/triggerStore'
import { useTodoListStore } from '../../store/todoListStore'
import { fireTriggerAction } from '../../lib/runTrigger'
import { useI18n } from '../../i18n'

type TimingMode = TriggerTiming['mode']
type ActionType = TriggerAction['type']

export function TriggerPanel(): React.ReactElement {
  const { t } = useI18n()
  const triggers = useTriggerStore((s) => s.triggers)
  const addTrigger = useTriggerStore((s) => s.addTrigger)
  const lists = useTodoListStore((s) => s.lists)

  // form state
  const [name, setName] = useState('')
  const [mode, setMode] = useState<TimingMode>('countdown')
  const [minutes, setMinutes] = useState('10')
  const [time, setTime] = useState('22:00')
  const [actionType, setActionType] = useState<ActionType>('command')
  const [command, setCommand] = useState('')
  const [listId, setListId] = useState('')

  // live "now" for countdown rendering
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const buildTiming = (): TriggerTiming | null => {
    if (mode === 'countdown' || mode === 'interval') {
      const m = parseFloat(minutes)
      if (!Number.isFinite(m) || m <= 0) return null
      return { mode, seconds: Math.round(m * 60) }
    }
    const [h, mm] = time.split(':').map((x) => parseInt(x, 10))
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
    return { mode: 'at', hour: h, minute: mm }
  }

  const buildAction = (): TriggerAction | null => {
    if (actionType === 'command') {
      const text = command.trim()
      if (!text) return null
      return { type: 'command', text }
    }
    if (!listId) return null
    return { type: 'todolist', listId }
  }

  const canCreate = (): boolean => buildTiming() !== null && buildAction() !== null

  const submit = (): void => {
    const timing = buildTiming()
    const action = buildAction()
    if (!timing || !action) return
    const finalName =
      name.trim() ||
      (action.type === 'command'
        ? action.text.slice(0, 20)
        : lists.find((l) => l.id === action.listId)?.name || t.trigger.title)
    addTrigger({ name: finalName, timing, action })
    setName('')
    setCommand('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Create form */}
      <div className="px-2 pt-2 pb-2 border-b border-claude-border flex flex-col gap-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.trigger.namePlaceholder}
          className="bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60"
        />

        {/* timing mode */}
        <div className="flex gap-1">
          {(['countdown', 'at', 'interval'] as TimingMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1 rounded text-[10px] transition-colors ${
                mode === m
                  ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                  : 'text-claude-muted hover:bg-claude-border/60'
              }`}
            >
              {t.trigger.mode[m]}
            </button>
          ))}
        </div>

        {/* timing value */}
        {mode === 'at' ? (
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text outline-none focus:border-amber-500/60"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-16 bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text outline-none focus:border-amber-500/60"
            />
            <span className="text-[10px] text-claude-muted">
              {mode === 'countdown' ? t.trigger.minutesLater : t.trigger.everyMinutes}
            </span>
          </div>
        )}

        {/* action type */}
        <div className="flex gap-1">
          {(['command', 'todolist'] as ActionType[]).map((a) => (
            <button
              key={a}
              onClick={() => setActionType(a)}
              className={`flex-1 py-1 rounded text-[10px] transition-colors ${
                actionType === a
                  ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                  : 'text-claude-muted hover:bg-claude-border/60'
              }`}
            >
              {t.trigger.action[a]}
            </button>
          ))}
        </div>

        {/* action value */}
        {actionType === 'command' ? (
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t.trigger.commandPlaceholder}
            className="bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60"
          />
        ) : lists.length === 0 ? (
          <p className="text-[10px] text-claude-muted px-1">{t.trigger.noLists}</p>
        ) : (
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text outline-none focus:border-amber-500/60"
          >
            <option value="">{t.trigger.pickList}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={submit}
          disabled={!canCreate()}
          className="mt-0.5 py-1 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t.trigger.create}
        </button>
      </div>

      {/* Trigger list */}
      <div className="flex-1 overflow-y-auto py-1">
        {triggers.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs px-3 text-center">
            {t.trigger.empty}
          </div>
        ) : (
          triggers.map((trig) => <TriggerCard key={trig.id} trig={trig} now={now} />)
        )}
      </div>
    </div>
  )
}

function TriggerCard({ trig, now }: { trig: Trigger; now: number }): React.ReactElement {
  const { t } = useI18n()
  const setEnabled = useTriggerStore((s) => s.setEnabled)
  const deleteTrigger = useTriggerStore((s) => s.deleteTrigger)
  const lists = useTodoListStore((s) => s.lists)

  const timingSummary = ((): string => {
    const tm = trig.timing
    if (tm.mode === 'countdown') return `${t.trigger.mode.countdown} ${tm.seconds / 60}m`
    if (tm.mode === 'interval') return `${t.trigger.mode.interval} ${tm.seconds / 60}m`
    return `${t.trigger.mode.at} ${String(tm.hour).padStart(2, '0')}:${String(tm.minute).padStart(2, '0')}`
  })()

  const actionSummary =
    trig.action.type === 'command'
      ? `▶ ${trig.action.text}`
      : `☰ ${lists.find((l) => l.id === trig.action.listId)?.name ?? t.trigger.listGone}`

  const remaining = ((): string | null => {
    if (!trig.enabled) return null
    const at = trig.nextFireAt ?? computeNextFire(trig.timing, now)
    const ms = at - now
    if (ms <= 0) return t.trigger.firing
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return h > 0 ? `${h}:${mmss}` : mmss
  })()

  return (
    <div className="mx-1.5 mb-1.5 rounded-lg border border-claude-border bg-claude-bg/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {/* enable toggle */}
        <input
          type="checkbox"
          checked={trig.enabled}
          onChange={(e) => setEnabled(trig.id, e.target.checked)}
          className="shrink-0 accent-amber-500 cursor-pointer"
          title={trig.enabled ? t.trigger.disable : t.trigger.enable}
        />
        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-claude-text" title={trig.name}>
          {trig.name}
        </span>
        {remaining && (
          <span className="shrink-0 text-[10px] font-mono tabular-nums text-amber-400" title={t.trigger.nextFire}>
            {remaining}
          </span>
        )}
        {/* 立即运行（不影响排程） */}
        <button
          onClick={() => fireTriggerAction(trig)}
          title={t.trigger.runNow}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
            <path d="M2.5 1.5l6 4-6 4v-8z" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => deleteTrigger(trig.id)}
          title={t.trigger.delete}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-claude-muted hover:bg-red-600/20 hover:text-red-400 transition-colors text-xs"
        >
          ✕
        </button>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-claude-muted">
        <span className="shrink-0 text-claude-muted/80">{timingSummary}</span>
        <span className="flex-1 min-w-0 truncate" title={actionSummary}>
          {actionSummary}
        </span>
      </div>
    </div>
  )
}
