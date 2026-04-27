/**
 * PetWidget — 始终固定在侧边栏底部（TokenUsageWidget 上方）
 *
 * 自动监听：
 *   1. 活跃 session 的 lastUserPrompt 变化（用户输入了终端命令）
 *   2. 最近 tool call 列表变化（Claude 正在调用工具）
 * 满足 cooldown 后自动打包上下文 → 调用 Anthropic API → 展示宠物建议
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePetStore, type PetType } from '../../store/petStore'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'

// ── 紧凑版 ASCII Art（每个形态 3 行，帧间隔更换） ──────────────
const IDLE: Record<PetType, string[][]> = {
  cat: [
    [' /\\_/\\', '(^ω^ )', ' >^<  '],
    [' /\\_/\\', '(^ω^ )', '  ^>  '],
    [' /\\_/\\', '(-ω- )', ' >^<  '],
  ],
  robot: [
    ['[◉ ◉]', '[ ▽  ]', '[═══]'],
    ['[◉ ◉]', '[ △  ]', '[═══]'],
    ['[◈ ◈]', '[ ▽  ]', '[═══]'],
  ],
  dragon: [
    ['∩___∩', '(◕▽◕)', ' ~~^  '],
    ['∩___∩', '(◕‿◕)', '  ^~  '],
    ['∩___∩', '(◕▲◕)', ' ~~^  '],
  ],
  ghost: [
    ['.----.',  '(O  O)', ' ∿∿∿ '],
    ['.----.',  '(◉  ◉)', ' ∿∿  '],
    ['.----.',  '(O  O)', '  ∿∿ '],
  ],
}

const THINKING: Record<PetType, string[][]> = {
  cat:    [[' /\\_/\\', '(>.< )', ' ...  '], [' /\\_/\\', '(>.< )', '  .. ']],
  robot:  [['[◉ ◉]', '[ ·· ]', '[═══]'], ['[◈ ◈]', '[  · ]', '[═══]']],
  dragon: [['∩___∩', '(-.-)', '  .  '],  ['∩___∩', '(-.–)', '  .. ']],
  ghost:  [['.----.', '(· ·)', ' ... '],  ['.----.', '(· ·)', '  .. ']],
}

const EXCITED: Record<PetType, string[][]> = {
  cat:    [[' /\\_/\\', '(★ω★)', ' !! '], [' /\\_/\\', '(★ω★)', '✨!!✨']],
  robot:  [['[★ ★]', '[ !! ]', '[═══]'], ['[◉ ◉]', '[!!!  ]', '[═══]']],
  dragon: [['∩___∩', '(★▽★)', '✨^✨ '], ['∩___∩', '(★‿★)', ' ✨^ ']],
  ghost:  [['.----.', '(★  ★)', '✨∿✨ '], ['.----.', '(◉  ◉)', ' ∿✨∿']],
}

function AsciiPet({ type, mood }: { type: PetType; mood: string }): React.ReactElement {
  const [fi, setFi] = useState(0)
  const frames =
    mood === 'thinking' ? THINKING[type] :
    mood === 'excited'  ? EXCITED[type]  : IDLE[type]

  useEffect(() => {
    const ms = mood === 'thinking' ? 350 : mood === 'excited' ? 280 : 900
    const id = setInterval(() => setFi((i) => (i + 1) % frames.length), ms)
    return () => clearInterval(id)
  }, [mood, frames.length])

  const lines = frames[fi % frames.length]!
  const color =
    mood === 'thinking' ? '#64748b' :
    mood === 'excited'  ? '#fbbf24' : '#cbd5e1'

  return (
    <pre
      className="font-mono text-[10px] leading-[1.3] select-none shrink-0"
      style={{ color, textShadow: mood === 'excited' ? '0 0 4px #fbbf2488' : undefined }}
    >
      {lines.join('\n')}
    </pre>
  )
}

// ── 打字机气泡 ────────────────────────────────────────────────────
function Bubble({ text, thinking }: { text: string; thinking: boolean }): React.ReactElement {
  const [shown, setShown] = useState('')
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    if (thinking) { setShown(''); return }
    let i = 0
    setShown('')
    const tick = (): void => {
      if (i < text.length) { setShown(text.slice(0, ++i)); t.current = setTimeout(tick, 16) }
    }
    t.current = setTimeout(tick, 80)
    return () => { if (t.current) clearTimeout(t.current) }
  }, [text, thinking])

  return (
    <div className="flex-1 min-w-0 rounded-lg bg-slate-700/70 border border-slate-600/40 px-2 py-1.5 text-[9.5px] text-slate-200 leading-snug relative">
      {/* tail pointing left */}
      <span
        className="absolute top-2.5 -left-[5px] w-0 h-0"
        style={{
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderRight: '5px solid rgba(51,65,85,0.7)',
        }}
      />
      {thinking ? (
        <span className="flex items-center gap-1 text-slate-500">
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              className="w-1 h-1 rounded-full bg-slate-500 animate-bounce inline-block"
              style={{ animationDelay: `${k * 0.14}s` }}
            />
          ))}
        </span>
      ) : (
        <>
          {shown}
          {shown.length < text.length && (
            <span className="inline-block w-[2px] h-[9px] bg-amber-400/80 animate-pulse align-middle ml-0.5" />
          )}
        </>
      )}
    </div>
  )
}

// ── Expand panel (settings + manual ask) ─────────────────────────
function ExpandPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const { config, setConfig, clearHistory, history } = usePetStore()
  const [name, setName] = useState(config.name)
  const [persona, setPersona] = useState(config.personality)
  const [delay, setDelay] = useState(String(config.autoDelaySec))

  function save(): void {
    const d = parseInt(delay, 10)
    setConfig({ name, personality: persona, autoDelaySec: isNaN(d) ? 6 : Math.max(0, d) })
    onClose()
  }

  const PET_TYPES: Array<{ id: PetType; label: string }> = [
    { id: 'cat', label: '🐱' },
    { id: 'robot', label: '🤖' },
    { id: 'dragon', label: '🐉' },
    { id: 'ghost', label: '👻' },
  ]

  return (
    <div className="border-t border-slate-700/60 px-2.5 py-2 space-y-2 bg-slate-800/50">
      <div className="flex gap-1.5 items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 text-[9.5px] px-1.5 py-0.5 rounded border border-slate-600/50 bg-slate-900/60 text-slate-200 outline-none focus:border-amber-500/50"
          placeholder="名字"
        />
        <div className="flex gap-0.5">
          {PET_TYPES.map((p) => (
            <button
              key={p.id}
              onClick={() => setConfig({ type: p.id })}
              className={`text-[11px] w-5 h-5 rounded transition-colors ${
                config.type === p.id ? 'bg-amber-600/40 ring-1 ring-amber-500/60' : 'hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-slate-500 shrink-0">自动触发（秒）</span>
        <input
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
          className="w-12 text-[9.5px] px-1.5 py-0.5 rounded border border-slate-600/50 bg-slate-900/60 text-slate-200 outline-none focus:border-amber-500/50 font-mono text-center"
          placeholder="6"
        />
        <span className="text-[9px] text-slate-500">0=关闭</span>
      </div>

      <textarea
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        rows={3}
        className="w-full text-[9px] px-1.5 py-1 rounded border border-slate-600/50 bg-slate-900/60 text-slate-200 outline-none focus:border-amber-500/50 resize-none font-mono leading-relaxed"
        placeholder="人格 / System Prompt"
      />

      <div className="flex gap-1">
        <button
          onClick={save}
          className="flex-1 text-[9px] py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/40 text-amber-300"
        >
          保存
        </button>
        <button
          onClick={clearHistory}
          className="text-[9px] px-2 py-0.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200"
          title="清除对话历史"
        >
          清空 ({history.length})
        </button>
        <button
          onClick={onClose}
          className="text-[9px] px-2 py-0.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────
const COOLDOWN_MS = 30_000   // 自动触发最短间隔

export function PetWidget(): React.ReactElement {
  const { config, mood, speech, history, lastAutoAt,
          setMood, setSpeech, pushHistory, setLastAutoAt } = usePetStore()
  const { sessions, activeSessionId, history: sessionHistory } = useSessionStore()
  const toolCalls = useToolCallStore((s) => s.calls)

  const [expanded, setExpanded] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  // Refs to track what's "new" since last auto-trigger
  const lastPromptRef = useRef<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastToolCountRef = useRef(0)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Build context snapshot from current state
  const buildContext = useCallback((): string => {
    const workdir = activeSession?.workdir ?? '(未知目录)'
    const sessionRecord = activeSession
      ? sessionHistory.find(
          (r) =>
            r.workdir.replace(/\\/g, '/').toLowerCase() ===
            activeSession.workdir.replace(/\\/g, '/').toLowerCase()
        )
      : null
    const lastPrompt = sessionRecord?.lastUserPrompt ?? ''

    const recentTools = toolCalls
      .filter((c) => c.sessionId === activeSessionId)
      .slice(0, 5)
      .map((c) => c.name)
      .filter((v, i, a) => a.indexOf(v) === i)  // dedupe

    const lines = [`工作目录: ${workdir}`]
    if (lastPrompt) lines.push(`最近输入: ${lastPrompt}`)
    if (recentTools.length > 0) lines.push(`最近调用工具: ${recentTools.join(', ')}`)
    return lines.join('\n')
  }, [activeSession, activeSessionId, sessionHistory, toolCalls])

  // Core: call API and update pet
  const triggerPet = useCallback(
    async (userMsg: string) => {
      if (isThinking) return
      setIsThinking(true)
      setMood('thinking')

      pushHistory('user', userMsg)

      try {
        const result = await window.electronAPI.pet.ask({
          message: userMsg,
          history: history.slice(-12),
          petConfig: { name: config.name, personality: config.personality },
        })
        const reply = result.text?.trim() || '喵？API 似乎没响应...'
        pushHistory('assistant', reply)
        setSpeech(reply)
        setMood('excited')
        setIsThinking(false)
        setTimeout(() => setMood('talking'), 300)
        setTimeout(() => setMood('idle'), 10_000)
      } catch {
        setSpeech('喵！API 炸了，检查 Key？')
        setMood('idle')
        setIsThinking(false)
      }
    },
    [config, history, isThinking, setMood, setSpeech, pushHistory]
  )

  // Auto-trigger: debounce after terminal activity
  const scheduleAutoTrigger = useCallback(
    (reason: string) => {
      const delaySec = config.autoDelaySec
      if (delaySec <= 0) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const now = Date.now()
        if (now - lastAutoAt < COOLDOWN_MS) return
        setLastAutoAt(now)
        const ctx = buildContext()
        const prompt = `[自动上下文]\n${ctx}\n\n[触发原因]\n${reason}\n\n根据以上上下文，给出一条最激进的技术建议或潜在风险提示。`
        void triggerPet(prompt)
      }, delaySec * 1000)
    },
    [config.autoDelaySec, lastAutoAt, buildContext, triggerPet, setLastAutoAt]
  )

  // Watch: lastUserPrompt of active session
  useEffect(() => {
    if (!activeSession) return
    const rec = sessionHistory.find(
      (r) =>
        r.workdir.replace(/\\/g, '/').toLowerCase() ===
        activeSession.workdir.replace(/\\/g, '/').toLowerCase()
    )
    const prompt = rec?.lastUserPrompt ?? ''
    if (prompt && prompt !== lastPromptRef.current) {
      lastPromptRef.current = prompt
      scheduleAutoTrigger(`用户刚输入: "${prompt}"`)
    }
  }, [sessionHistory, activeSession, scheduleAutoTrigger])

  // Watch: new tool calls for active session
  useEffect(() => {
    const activeCalls = toolCalls.filter((c) => c.sessionId === activeSessionId)
    if (activeCalls.length > lastToolCountRef.current) {
      const newCalls = activeCalls.slice(0, activeCalls.length - lastToolCountRef.current)
      lastToolCountRef.current = activeCalls.length
      if (newCalls.length > 0) {
        scheduleAutoTrigger(`Claude 正在调用工具: ${newCalls.map((c) => c.name).join(', ')}`)
      }
    }
    // If session changed, reset counter
  }, [toolCalls, activeSessionId, scheduleAutoTrigger])

  // Reset tool counter when session changes
  useEffect(() => {
    lastToolCountRef.current = toolCalls.filter((c) => c.sessionId === activeSessionId).length
    lastPromptRef.current = ''
  }, [activeSessionId])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shrink-0 border-t border-claude-border">
      {/* Main row */}
      <div className="flex items-start gap-2 px-2 py-1.5">
        {/* Pet art */}
        <div
          className="flex flex-col items-center gap-0 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
          title="点击展开设置"
        >
          <AsciiPet type={config.type} mood={mood} />
          <span
            className="text-[8.5px] font-semibold mt-0 leading-none"
            style={{
              color: mood === 'excited' ? '#fbbf24' :
                     mood === 'thinking' ? '#64748b' : '#94a3b8'
            }}
          >
            {config.name}
          </span>
        </div>

        {/* Bubble */}
        <Bubble text={speech} thinking={isThinking} />
      </div>

      {/* Expand panel */}
      {expanded && <ExpandPanel onClose={() => setExpanded(false)} />}
    </div>
  )
}
