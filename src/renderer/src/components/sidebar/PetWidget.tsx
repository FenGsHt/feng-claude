/**
 * PetWidget — 固定显示在 TokenUsageWidget 上方
 *
 * 触发机制：
 *   1. lastUserPrompt 变化（用户提交了终端命令）→ debounce N 秒 → 调用 API
 *   2. 新增 toolCall → debounce N 秒 → 调用 API
 *   3. 冷却 30s，防止频繁调用
 *
 * 空闲时：宠物在自己玩（look/sleep/play/curious 四种活动自动轮换）
 * 讲话时：右侧出现打字机气泡，讲完后气泡消失宠物继续玩
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePetStore, type PetType } from '../../store/petStore'
import { useSessionStore } from '../../store/sessionStore'
import { useToolCallStore } from '../../store/toolCallStore'

// ── ASCII 帧库 ────────────────────────────────────────────────────
type Activity = 'look' | 'sleep' | 'play' | 'curious' | 'thinking' | 'excited'

const FRAMES: Record<Activity, Record<PetType, string[][]>> = {
  look: {
    cat:    [[' /\\_/\\', '( ^ω^)', '  >-< '], [' /\\_/\\', '( ^ω^)', '  >-< '], [' /\\_/\\', '( ·ω·)', '  >-< ']],
    robot:  [['[◉  ◉]', '[ ▽  ]', '[═══]'], ['[◉  ◉]', '[ △  ]', '[═══]'], ['[◈  ◈]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', '  ~^~ '], ['∩___∩', '(◕ ‿ ◕)', '  ~^~ '], ['∩___∩', '(◕ ▽ ◕)', '  ~~~ ']],
    ghost:  [['.--.', '(O  O)', ' ∿∿∿ '], ['.--.', '(◉  ◉)', ' ∿∿∿ '], ['.--.', '(O  O)', '  ∿∿ ']],
  },
  sleep: {
    cat:    [[' /\\_/\\', '(-  -)', '  zzz'], [' /\\_/\\', '(-  -)', '   zz'], [' /\\_/\\', '(-  -)', '    z']],
    robot:  [['[─  ─]', '[  .  ]', '[═══]'], ['[─  ─]', '[     ]', '[═══]'], ['[─  ─]', '[  .  ]', '[═══]']],
    dragon: [['∩___∩', '(-  -)', '  zzz'], ['∩___∩', '(=  =)', '   zz'], ['∩___∩', '(-  -)', '    z']],
    ghost:  [['.--.', '(- -)', 'z∿∿∿ '], ['.--.', '(- -)', ' ∿∿∿z'], ['.--.', '(- -)', '  ∿∿z']],
  },
  play: {
    cat:    [[' /\\_/\\', '(>∇< )', ' ≈≈≈ '], [' /\\_/\\', '(>ω< )', '≈   ≈'], [' /\\_/\\', '(>∇< )', ' ≈≈≈ ']],
    robot:  [['[★  ★]', '[ ↑  ]', '[═══]'], ['[◉  ◉]', '[ ↓  ]', '[═══]'], ['[★  ★]', '[ ↑  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ‿ ◕)', ' ∿∿∿ '], ['∩___∩', '(◕ ▽ ◕)', '∿∿∿∿ '], ['∩___∩', '(◕ ‿ ◕)', ' ∿∿  ']],
    ghost:  [['.--.', '(O∇ O)', '∿∿∿∿ '], ['.--.', '(O  O)', ' ∿∿∿ '], ['.--.', '(O ∇O)', '∿∿∿∿ ']],
  },
  curious: {
    cat:    [[' /\\_/\\', '(°ω° )', '  ?  '], [' /\\_/\\', '(°ω° )', ' ?   '], [' /\\_/\\', '(°ω° )', '  ??  ']],
    robot:  [['[◉? ◉]', '[ ▽  ]', '[═══]'], ['[◉  ◉]', '[? ▽ ]', '[═══]'], ['[◉? ◉]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕? ◕)', '  ?  '], ['∩___∩', '(◕ ?◕)', '  ?? '], ['∩___∩', '(◕? ◕)', ' ??? ']],
    ghost:  [['.--.', '(O? O)', ' ?∿∿ '], ['.--.', '(O  O?)', '∿? ∿ '], ['.--.', '(O? O)', ' ??∿ ']],
  },
  thinking: {
    cat:    [[' /\\_/\\', '(>·< )', ' ···  '], [' /\\_/\\', '(>·< )', '  ··  ']],
    robot:  [['[◉  ◉]', '[ ··  ]', '[═══]'], ['[◈  ◈]', '[  ·  ]', '[═══]']],
    dragon: [['∩___∩', '(-  · -)', '  ·  '], ['∩___∩', '(- · -)', '  ··  ']],
    ghost:  [['.--.', '(·  ·)', ' ···  '], ['.--.', '(·  ·)', '  ··  ']],
  },
  excited: {
    cat:    [[' /\\_/\\', '(★ω★ )', '✨!! '], [' /\\_/\\', '(★ω★ )', '!!✨ ']],
    robot:  [['[★  ★]', '[ !! ]', '[═══]'], ['[◉  ◉]', '[ !! ]', '[═══]']],
    dragon: [['∩___∩', '(★ ▽ ★)', '✨^✨ '], ['∩___∩', '(★ ‿ ★)', ' ✨^ ']],
    ghost:  [['.--.', '(★  ★)', '✨∿✨ '], ['.--.', '(◉  ◉)', ' ∿✨∿']],
  },
}

// 空闲活动轮换顺序和停留时长范围 [min, max] 毫秒
const IDLE_CYCLE: Array<{ activity: Activity; msRange: [number, number] }> = [
  { activity: 'look',    msRange: [8000, 14000] },
  { activity: 'curious', msRange: [5000, 9000]  },
  { activity: 'look',    msRange: [6000, 10000] },
  { activity: 'sleep',   msRange: [7000, 13000] },
  { activity: 'play',    msRange: [4000, 8000]  },
]

const FRAME_INTERVAL: Record<Activity, number> = {
  look: 900, sleep: 1200, play: 400, curious: 700, thinking: 350, excited: 280,
}

const ACTIVITY_COLOR: Record<Activity, string> = {
  look: '#94a3b8', sleep: '#475569', play: '#fcd34d', curious: '#7dd3fc',
  thinking: '#64748b', excited: '#fbbf24',
}

// ── ASCII 宠物渲染 ─────────────────────────────────────────────────
function AsciiPet({
  type,
  activity,
  large,
}: {
  type: PetType
  activity: Activity
  large?: boolean
}): React.ReactElement {
  const [fi, setFi] = useState(0)
  const frames = FRAMES[activity][type]

  useEffect(() => {
    setFi(0)
    const id = setInterval(() => setFi((i) => (i + 1) % frames.length), FRAME_INTERVAL[activity])
    return () => clearInterval(id)
  }, [activity, frames.length])

  const lines = frames[fi % frames.length]!
  const color = ACTIVITY_COLOR[activity]

  return (
    <pre
      className={`font-mono leading-[1.35] select-none shrink-0 transition-all duration-300 ${large ? 'text-[12px]' : 'text-[10px]'}`}
      style={{
        color,
        textShadow:
          activity === 'excited' ? '0 0 6px #fbbf2466' :
          activity === 'play'    ? '0 0 4px #fcd34d44' : undefined,
      }}
    >
      {lines.join('\n')}
    </pre>
  )
}

// ── 打字机气泡（仅 thinking / excited / talking 时显示）────────────
function Bubble({ text, loading }: { text: string; loading: boolean }): React.ReactElement {
  const [shown, setShown] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (loading) { setShown(''); return }
    let i = 0
    setShown('')
    const tick = (): void => {
      if (i < text.length) { setShown(text.slice(0, ++i)); timerRef.current = setTimeout(tick, 15) }
    }
    timerRef.current = setTimeout(tick, 60)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, loading])

  return (
    <div className="flex-1 min-w-0 rounded-lg bg-slate-700/80 border border-slate-600/50 px-2 py-1.5 text-[9.5px] text-slate-200 leading-snug relative">
      {/* 三角指向左侧宠物 */}
      <span
        className="absolute top-3 -left-[5px] w-0 h-0"
        style={{
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderRight: '5px solid rgba(51,65,85,0.8)',
        }}
      />
      {loading ? (
        <span className="flex items-center gap-1 text-slate-500">
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              className="w-1 h-1 rounded-full bg-slate-500 animate-bounce inline-block"
              style={{ animationDelay: `${k * 0.13}s` }}
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

// ── 设置面板 ─────────────────────────────────────────────────────
function SettingsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const { config, setConfig, clearHistory, history } = usePetStore()
  const [name, setName] = useState(config.name)
  const [persona, setPersona] = useState(config.personality)
  const [delay, setDelay] = useState(String(config.autoDelaySec))

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
        <span className="text-[9px] text-slate-500 shrink-0">触发延迟（秒）</span>
        <input
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
          className="w-10 text-[9.5px] px-1 py-0.5 rounded border border-slate-600/50 bg-slate-900/60 text-slate-200 outline-none focus:border-amber-500/50 font-mono text-center"
          placeholder="6"
        />
        <span className="text-[9px] text-slate-500">0=关闭自动</span>
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
          onClick={() => {
            const d = parseInt(delay, 10)
            setConfig({ name, personality: persona, autoDelaySec: isNaN(d) ? 6 : Math.max(0, d) })
            onClose()
          }}
          className="flex-1 text-[9px] py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/40 text-amber-300"
        >
          保存
        </button>
        <button
          onClick={clearHistory}
          className="text-[9px] px-2 py-0.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200"
        >
          清空记录({history.length})
        </button>
        <button onClick={onClose} className="text-[9px] px-1.5 py-0.5 rounded border border-slate-600/40 text-slate-400 hover:text-slate-200">✕</button>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
const COOLDOWN_MS = 30_000

const IDLE_ACTIVITIES = IDLE_CYCLE.map((c) => c.activity)

function randRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function PetWidget(): React.ReactElement {
  const { config, speech, history, lastAutoAt,
          setSpeech, pushHistory, setLastAutoAt } = usePetStore()
  const { sessions, activeSessionId, history: sessionHistory } = useSessionStore()
  const toolCalls = useToolCallStore((s) => s.calls)

  // 当前展示状态（含空闲子活动）
  const [activity, setActivity] = useState<Activity>('look')
  const [isLoading, setIsLoading] = useState(false)   // API 调用中
  const [showBubble, setShowBubble] = useState(false)  // 气泡可见性
  const [expanded, setExpanded] = useState(false)

  // 空闲轮换 timer
  const idleCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleIndexRef = useRef(0)
  // 讲话后回到空闲的 timer
  const talkEndRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 自动触发 debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 上次看到的 prompt / tool count
  const lastPromptRef = useRef<string>('')
  const lastToolCountRef = useRef(0)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // ── 空闲轮换 ──────────────────────────────────────────────────
  const startIdleCycle = useCallback((fromIndex = 0) => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const step = (): void => {
      const entry = IDLE_CYCLE[idleIndexRef.current % IDLE_CYCLE.length]!
      setActivity(entry.activity)
      const ms = randRange(entry.msRange[0], entry.msRange[1])
      idleIndexRef.current = (idleIndexRef.current + 1) % IDLE_CYCLE.length
      idleCycleRef.current = setTimeout(step, ms)
    }
    idleIndexRef.current = fromIndex % IDLE_CYCLE.length
    step()
  }, [])

  // 启动时开始轮换
  useEffect(() => {
    startIdleCycle()
    return () => { if (idleCycleRef.current) clearTimeout(idleCycleRef.current) }
  }, [startIdleCycle])

  // ── 触发宠物讲话 ──────────────────────────────────────────────
  const triggerPet = useCallback(
    async (userMsg: string) => {
      if (isLoading) return

      // 暂停空闲轮换，切换到 thinking
      if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
      if (talkEndRef.current) clearTimeout(talkEndRef.current)

      setActivity('thinking')
      setIsLoading(true)
      setShowBubble(true)
      pushHistory('user', userMsg)

      try {
        const result = await window.electronAPI.pet.ask({
          message: userMsg,
          history: history.slice(-12),
          petConfig: { name: config.name, personality: config.personality },
        })
        const reply = result.text?.trim() || '喵？没有响应...'
        pushHistory('assistant', reply)
        setSpeech(reply)
        setActivity('excited')
        setIsLoading(false)

        // 讲完后 12 秒隐藏气泡，宠物回到空闲
        talkEndRef.current = setTimeout(() => {
          setShowBubble(false)
          startIdleCycle()
        }, 12_000)
      } catch {
        setSpeech('喵！API 失联了')
        setIsLoading(false)
        setShowBubble(false)
        startIdleCycle()
      }
    },
    [config, history, isLoading, setSpeech, pushHistory, startIdleCycle]
  )

  // ── 自动触发 (debounce) ───────────────────────────────────────
  const buildContext = useCallback((): string => {
    const workdir = activeSession?.workdir ?? '(未知目录)'
    const rec = activeSession
      ? sessionHistory.find(
          (r) => r.workdir.replace(/\\/g, '/').toLowerCase() ===
                 activeSession.workdir.replace(/\\/g, '/').toLowerCase()
        )
      : null
    const lastPrompt = rec?.lastUserPrompt ?? ''
    const recentTools = toolCalls
      .filter((c) => c.sessionId === activeSessionId)
      .slice(0, 5)
      .map((c) => c.name)
      .filter((v, i, a) => a.indexOf(v) === i)
    const lines = [`工作目录: ${workdir}`]
    if (lastPrompt) lines.push(`最近输入: ${lastPrompt}`)
    if (recentTools.length) lines.push(`最近工具: ${recentTools.join(', ')}`)
    return lines.join('\n')
  }, [activeSession, activeSessionId, sessionHistory, toolCalls])

  const scheduleAutoTrigger = useCallback((reason: string) => {
    const delaySec = config.autoDelaySec
    if (delaySec <= 0) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const now = Date.now()
      if (now - lastAutoAt < COOLDOWN_MS) return
      setLastAutoAt(now)
      const ctx = buildContext()
      void triggerPet(`[上下文]\n${ctx}\n\n[触发]\n${reason}\n\n根据以上，给出一条最前沿最激进的技术建议。`)
    }, delaySec * 1000)
  }, [config.autoDelaySec, lastAutoAt, buildContext, triggerPet, setLastAutoAt])

  // 监听 lastUserPrompt
  useEffect(() => {
    if (!activeSession) return
    const rec = sessionHistory.find(
      (r) => r.workdir.replace(/\\/g, '/').toLowerCase() ===
             activeSession.workdir.replace(/\\/g, '/').toLowerCase()
    )
    const prompt = rec?.lastUserPrompt ?? ''
    if (prompt && prompt !== lastPromptRef.current) {
      lastPromptRef.current = prompt
      scheduleAutoTrigger(`用户输入: "${prompt}"`)
    }
  }, [sessionHistory, activeSession, scheduleAutoTrigger])

  // 监听新 toolCall
  useEffect(() => {
    const active = toolCalls.filter((c) => c.sessionId === activeSessionId)
    if (active.length > lastToolCountRef.current) {
      const newOnes = active.slice(0, active.length - lastToolCountRef.current)
      lastToolCountRef.current = active.length
      if (newOnes.length > 0) {
        scheduleAutoTrigger(`工具调用: ${newOnes.map((c) => c.name).join(', ')}`)
      }
    }
  }, [toolCalls, activeSessionId, scheduleAutoTrigger])

  // session 切换时重置
  useEffect(() => {
    lastToolCountRef.current = toolCalls.filter((c) => c.sessionId === activeSessionId).length
    lastPromptRef.current = ''
  }, [activeSessionId])  // eslint-disable-line react-hooks/exhaustive-deps

  // 气泡是否可见：loading 时 or talking 时
  const bubbleVisible = showBubble

  // 空闲时宠物居中放大，讲话时靠左紧凑
  const idleMode = !bubbleVisible && !isLoading

  // 当前活动在空闲列表中
  const isIdleActivity = IDLE_ACTIVITIES.includes(activity)

  return (
    <div className="shrink-0 border-t border-claude-border bg-claude-surface/50">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 transition-all duration-300 ${idleMode ? 'justify-center' : ''}`}
      >
        {/* 宠物 + 名字 */}
        <div
          className="flex flex-col items-center gap-0 cursor-pointer shrink-0"
          onClick={() => setExpanded((v) => !v)}
          title="点击展开设置"
        >
          <AsciiPet type={config.type} activity={activity} large={idleMode} />
          <span
            className="text-[8.5px] font-semibold leading-none mt-0.5 transition-colors duration-300"
            style={{ color: ACTIVITY_COLOR[activity] }}
          >
            {config.name}
            {isIdleActivity && activity !== 'look' && (
              <span className="ml-1 opacity-60">
                {activity === 'sleep' ? 'zzz' : activity === 'play' ? '~' : activity === 'curious' ? '?' : ''}
              </span>
            )}
          </span>
        </div>

        {/* 气泡（仅讲话时显示）*/}
        {bubbleVisible && (
          <Bubble text={speech} loading={isLoading} />
        )}
      </div>

      {/* 设置面板 */}
      {expanded && <SettingsPanel onClose={() => setExpanded(false)} />}
    </div>
  )
}
