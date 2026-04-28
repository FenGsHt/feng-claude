/**
 * PetWidget — 固定显示在 TokenUsageWidget 上方
 *
 * 触发机制：
 *   1. output tokens 增加（Claude 开始回答）→ 提交用户问题 → 延迟 N ms → 调用 API
 *   2. 冷却 45s，防止频繁调用
 *
 * 空闲时：宠物在自己玩（look/sleep/play/curious 等活动自动轮换）
 * 讲话时：右侧出现打字机气泡，讲完后气泡消失宠物继续玩
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePetStore, type PetType } from '../../store/petStore'
import { useSessionStore } from '../../store/sessionStore'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useContentBankStore } from '../../store/contentBankStore'
import { useUserPromptStore } from '../../store/userPromptStore'

// ── ASCII 帧库 ────────────────────────────────────────────────────
type Activity =
  // 原有空闲
  | 'look' | 'sleep' | 'play' | 'curious'
  // 触发状态
  | 'thinking' | 'excited'
  // 新增空闲
  | 'blink' | 'stretch' | 'yawn' | 'hungry'
  | 'sneeze' | 'groom' | 'wiggle' | 'tilt' | 'doze'
  // 抚摸互动
  | 'happy'
  // 走动
  | 'walk'

// 空闲活动列表（不含触发状态）
const IDLE_ACTIVITIES: Activity[] = [
  'look', 'sleep', 'play', 'curious',
  'blink', 'stretch', 'yawn', 'hungry', 'sneeze', 'groom', 'wiggle', 'tilt', 'doze', 'walk'
]

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
  // 新增空闲活动
  blink: {
    cat:    [[' /\\_/\\', '( ^ω^)', '  >-< '], [' /\\_/\\', '( -ω-)', '  >-< ']],
    robot:  [['[◉  ◉]', '[ ▽  ]', '[═══]'], ['[─  ─]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', '  ~^~ '], ['∩___∩', '(- ▽ -)', '  ~^~ ']],
    ghost:  [['.--.', '(O  O)', ' ∿∿∿ '], ['.--.', '(-  -)', ' ∿∿∿ ']],
  },
  stretch: {
    cat:    [[' /\\_/\\', '( >ω< )', ' ≈≈≈ '], [' /\\_/\\', '( -ω-)', '≈   ≈'], [' /\\_/\\', '( ^ω^)', '  >-< ']],
    robot:  [['[◉  ◉]', '[ ▽  ]', '[═══]'], ['[◉  ◉]', '[    ]', '[────]'], ['[◉  ◉]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', '  ~^~ '], ['∩___∩', '(◕    ◕)', ' ~^^~ '], ['∩___∩', '(◕ ▽ ◕)', '  ~^~ ']],
    ghost:  [['.--.', '(O  O)', ' ∿∿∿ '], ['.--.', '(O    O)', '∿   ∿ '], ['.--.', '(O  O)', ' ∿∿∿ ']],
  },
  yawn: {
    cat:    [[' /\\_/\\', '(- ω -)', '  o  '], [' /\\_/\\', '( ○ω○)', '   ..']],
    robot:  [['[─  ─]', '[  o  ]', '[═══]'], ['[─  ○]', '[     ]', '[═══]']],
    dragon: [['∩___∩', '(- ω -)', '  o  '], ['∩___∩', '(○ ω ○)', '   ..']],
    ghost:  [['.--.', '(- ω -)', ' o∿ '], ['.--.', '(○ ω ○)', ' ∿..']],
  },
  hungry: {
    cat:    [[' /\\_/\\', '( >ω<)', '  !! '], [' /\\_/\\', '( >ω<)', '  ?? ']],
    robot:  [['[◉  ◉]', '[ !! ]', '[═══]'], ['[◉  ◉]', '[ ?? ]', '[═══]']],
    dragon: [['∩___∩', '(◕ >◕)', '  !! '], ['∩___∩', '(◕ >◕)', '  ?? ']],
    ghost:  [['.--.', '(O >O)', ' !!∿ '], ['.--.', '(O >O)', ' ??∿ ']],
  },
  sneeze: {
    cat:    [[' /\\_/\\', '( >ω<)', '  .. '], [' /\\_/\\', '( >○<)', '  !! '], [' /\\_/\\', '( ^ω^)', '  ~  ']],
    robot:  [['[◉  ◉]', '[ .. ]', '[═══]'], ['[◉  ◉]', '[ !! ]', '[═══]'], ['[◉  ◉]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ >◕)', '  .. '], ['∩___∩', '(◕ ○◕)', '  !! '], ['∩___∩', '(◕ ▽ ◕)', '  ~  ']],
    ghost:  [['.--.', '(O >O)', ' ..∿ '], ['.--.', '(O ○O)', ' !!∿ '], ['.--.', '(O  O)', ' ∿∿∿ ']],
  },
  groom: {
    cat:    [[' /\\_/\\', '( ^ω^)', ' ≈≈≈ '], [' /\\_/\\', '( ·ω·)', '≈≈≈≈'], [' /\\_/\\', '( ^ω^)', ' ≈≈≈ ']],
    robot:  [['[◉  ◉]', '[ ◐  ]', '[═══]'], ['[◉  ◉]', '[ ◑  ]', '[═══]'], ['[◉  ◉]', '[ ◐  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', ' ∿∿∿ '], ['∩___∩', '(◕ ·◕)', '∿∿∿ '], ['∩___∩', '(◕ ▽ ◕)', ' ∿∿∿ ']],
    ghost:  [['.--.', '(O  O)', ' ∿∿∿ '], ['.--.', '(·  ·)', ' ∿∿ '], ['.--.', '(O  O)', ' ∿∿∿ ']],
  },
  wiggle: {
    cat:    [[' /\\_/\\', '(^ω^ )', ' ≈♪≈ '], [' /\\_/\\', '(^ω^)', ' ♪≈≈ '], [' /\\_/\\', '(^ω^ )', ' ≈♪≈ ']],
    robot:  [['[◉  ◉]', '[ ∼  ]', '[═══]'], ['[◉  ◉]', '[ ∼∼ ]', '[═══]'], ['[◉  ◉]', '[ ∼  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', ' ∿^~ '], ['∩___∩', '(◕ ▽ ◕)', '^~^ '], ['∩___∩', '(◕ ▽ ◕)', ' ∿^~ ']],
    ghost:  [['.--.', '(O  O)', ' ∿^∿ '], ['.--.', '(O  O)', ' ^∿^ '], ['.--.', '(O  O)', ' ∿^∿ ']],
  },
  tilt: {
    cat:    [[' /\\_/\\', '(°ω°)', '  >-<'], [' /\\_/\\', '(°ω° )', '  >-<']],
    robot:  [['[◉  ◉]', '[ ▽  ]', '[═══]'], ['[◉? ◉]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', '  ~^~'], ['∩___∩', '(◕?▽◕)', '  ~^~']],
    ghost:  [['.--.', '(O  O)', ' ∿∿∿'], ['.--.', '(O? O)', ' ∿∿∿']],
  },
  doze: {
    cat:    [[' /\\_/\\', '(- ω -)', '  zZ '], [' /\\_/\\', '(- ω-)', '   Zz']],
    robot:  [['[─  ○]', '[  .  ]', '[═══]'], ['[○  ─]', '[     ]', '[═══]']],
    dragon: [['∩___∩', '(- ω -)', '  zZ '], ['∩___∩', '(- ω-)', '   Zz']],
    ghost:  [['.--.', '(- ω -)', ' zZ∿'], ['.--.', '(- ω-)', '  Zz']],
  },
  // 抚摸互动
  happy: {
    cat:    [[' /\\_/\\', '(^ω^)', ' ≈♪≈ '], [' /\\_/\\', '(^ω^)', ' ♪≈≈ ']],
    robot:  [['[♥  ♥]', '[ ▽  ]', '[═══]'], ['[♡  ♡]', '[ ▽  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)♡', '  ~^~ '], ['∩___∩', '(◕ ‿ ◕)♡', ' ♡~^~']],
    ghost:  [['.--.', '(★  ★)', '✨∿✨ '], ['.--.', '(★  ★)', ' ∿✨✨']],
  },
  // 走动（左右移动动画）
  walk: {
    cat:    [[' /\\_/\\', '( >ω>)', ' >=> '], [' /\\_/\\', '( <ω<)', ' <=< ']],
    robot:  [['[◉  ◉]', '[ → ]', '[═══]'], ['[◉  ◉]', '[ ← ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▷◕)', ' ~^> '], ['∩___∩', '(◕◁ ◕)', ' <^~ ']],
    ghost:  [['.--.', '(O  O)', ' ∿→ '], ['.--.', '(O  O)', ' ←∿ ']],
  },
}

// 加权随机空闲池
interface IdlePoolEntry {
  activity: Activity
  weight: number
  msRange: [number, number]
  cooldown: number
  forbiddenAfter: Activity[]
}

const IDLE_POOL: IdlePoolEntry[] = [
  { activity: 'look',    weight: 10, msRange: [8000, 14000], cooldown: 2, forbiddenAfter: [] },
  { activity: 'blink',   weight: 8,  msRange: [1000, 2000],  cooldown: 3, forbiddenAfter: [] },
  { activity: 'curious', weight: 7,  msRange: [5000, 9000],  cooldown: 2, forbiddenAfter: [] },
  { activity: 'tilt',    weight: 5,  msRange: [2500, 4000],  cooldown: 2, forbiddenAfter: [] },
  { activity: 'doze',    weight: 5,  msRange: [4000, 7000],  cooldown: 2, forbiddenAfter: ['play', 'wiggle', 'walk'] },
  { activity: 'groom',   weight: 4,  msRange: [4000, 7000],  cooldown: 3, forbiddenAfter: [] },
  { activity: 'wiggle',  weight: 4,  msRange: [2000, 3500],  cooldown: 3, forbiddenAfter: [] },
  { activity: 'walk',    weight: 4,  msRange: [3000, 6000],  cooldown: 3, forbiddenAfter: ['sleep', 'doze'] },
  { activity: 'yawn',    weight: 3,  msRange: [2000, 3500],  cooldown: 4, forbiddenAfter: ['sleep', 'play', 'walk'] },
  { activity: 'sleep',   weight: 3,  msRange: [8000, 15000], cooldown: 5, forbiddenAfter: ['sleep', 'play', 'wiggle', 'walk'] },
  { activity: 'stretch', weight: 3,  msRange: [2500, 4500],  cooldown: 4, forbiddenAfter: ['play', 'wiggle', 'walk'] },
  { activity: 'play',    weight: 2,  msRange: [4000, 8000],  cooldown: 4, forbiddenAfter: ['sleep', 'doze'] },
  { activity: 'hungry',  weight: 2,  msRange: [3000, 5000],  cooldown: 5, forbiddenAfter: ['sleep', 'doze'] },
  { activity: 'sneeze',  weight: 1,  msRange: [800, 1500],   cooldown: 6, forbiddenAfter: ['sleep', 'doze'] },
]

// 空闲状态跟踪
interface IdleState {
  lastActivity: Activity
  cooldowns: Map<Activity, number>
}

// 加权随机选择下一个空闲活动
function selectNextIdleActivity(state: IdleState): { activity: Activity; msRange: [number, number] } {
  // 1. 更新 cooldown 计数器
  for (const [act, cd] of state.cooldowns) {
    if (cd <= 1) state.cooldowns.delete(act)
    else state.cooldowns.set(act, cd - 1)
  }

  // 2. 构建候选池
  const candidates = IDLE_POOL.filter((entry) => {
    // 不在 cooldown 中
    if (state.cooldowns.has(entry.activity)) return false
    // 不是 forbiddenAfter 当前活动
    if (entry.forbiddenAfter.includes(state.lastActivity)) return false
    return true
  })

  // 3. 如果没有候选（边界情况），清除 cooldown 重试
  if (candidates.length === 0) {
    state.cooldowns.clear()
    // 重新过滤，只检查 forbiddenAfter
    const fallback = IDLE_POOL.filter((e) => !e.forbiddenAfter.includes(state.lastActivity))
    if (fallback.length === 0) return { activity: 'look' as Activity, msRange: [8000, 14000] }
    const chosen = fallback[Math.floor(Math.random() * fallback.length)]!
    return { activity: chosen.activity, msRange: chosen.msRange }
  }

  // 4. 加权随机选择
  const totalWeight = candidates.reduce((sum, e) => sum + e.weight, 0)
  let random = Math.random() * totalWeight

  for (const entry of candidates) {
    random -= entry.weight
    if (random <= 0) {
      // 设置 cooldown
      state.cooldowns.set(entry.activity, entry.cooldown)
      state.lastActivity = entry.activity
      return { activity: entry.activity, msRange: entry.msRange }
    }
  }

  // Fallback
  const chosen = candidates[0]!
  state.cooldowns.set(chosen.activity, chosen.cooldown)
  state.lastActivity = chosen.activity
  return { activity: chosen.activity, msRange: chosen.msRange }
}

function randRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const FRAME_INTERVAL: Record<Activity, number> = {
  look: 900, sleep: 1200, play: 400, curious: 700,
  thinking: 350, excited: 280,
  // 新增空闲
  blink: 300, stretch: 500, yawn: 700, hungry: 600,
  sneeze: 200, groom: 450, wiggle: 350, tilt: 650, doze: 900,
  // 抚摸
  happy: 400,
  // 走动
  walk: 500,
}

const ACTIVITY_COLOR: Record<Activity, string> = {
  look: '#94a3b8', sleep: '#475569', play: '#fcd34d', curious: '#7dd3fc',
  thinking: '#64748b', excited: '#fbbf24',
  // 新增空闲
  blink: '#cbd5e1', stretch: '#a3e635', yawn: '#94a3b8', hungry: '#fb923c',
  sneeze: '#f87171', groom: '#a78bfa', wiggle: '#34d399', tilt: '#7dd3fc', doze: '#64748b',
  // 抚摸
  happy: '#f9a8d4',
  // 走动
  walk: '#60a5fa',
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
  // 是否已打字完成
  const [typingDone, setTypingDone] = useState(false)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (loading) { setShown(''); setTypingDone(false); return }
    let i = 0
    setShown('')
    setTypingDone(false)
    const tick = (): void => {
      if (i < text.length) {
        setShown(text.slice(0, ++i))
        timerRef.current = setTimeout(tick, 15)
      } else {
        setTypingDone(true)
      }
    }
    timerRef.current = setTimeout(tick, 60)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, loading])

  return (
    <div className="flex-1 min-w-0 max-w-[200px] rounded-lg bg-slate-700/80 border border-slate-600/50 px-2 py-1.5 text-[9.5px] text-slate-200 leading-snug relative overflow-hidden">
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
        <div className="overflow-y-auto max-h-[60px] pr-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          <span className="break-words whitespace-pre-wrap">{shown}</span>
          {!typingDone && (
            <span className="inline-block w-[2px] h-[9px] bg-amber-400/80 animate-pulse align-middle ml-0.5" />
          )}
        </div>
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
  const [probability, setProbability] = useState(String(config.triggerProbability))

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
        <span className="text-[9px] text-slate-500 shrink-0">触发概率</span>
        <input
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          className="w-10 text-[9.5px] px-1 py-0.5 rounded border border-slate-600/50 bg-slate-900/60 text-slate-200 outline-none focus:border-amber-500/50 font-mono text-center"
          placeholder="40"
        />
        <span className="text-[9px] text-slate-500">% (0-100，100=百分百)</span>
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
            const p = parseInt(probability, 10)
            setConfig({
              name,
              personality: persona,
              autoDelaySec: isNaN(d) ? 6 : Math.max(0, d),
              triggerProbability: isNaN(p) ? 40 : Math.max(0, Math.min(100, p)),
            })
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
const COOLDOWN_MS = 45_000       // 两次自动触发最小间隔
const PET_COOLDOWN_MS = 3_000    // 抚摸冷却 3 秒

// 抚摸预设回复
const PET_RESPONSES: string[] = [
  '喵~好舒服', '再摸摸~', '嘿嘿~', '舒服~', '(蹭蹭)', '喜欢~', '好开心!',
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function PetWidget(): React.ReactElement {
  const { config, speech, history, lastAutoAt, lastPetAt,
          setSpeech, pushHistory, setLastAutoAt, setLastPetAt } = usePetStore()
  const { sessions, activeSessionId } = useSessionStore()
  // [2026-04-28] 监听所有 session 的 output tokens，而不是只监听 activeSessionId
  const allOutputTokens = useTokenUsageStore((s) => s.bySession)
  // [2026-04-27] 实时用户问题（不走 sessionHistory 的延迟链路）
  const allUserPrompts = useUserPromptStore((s) => s.prompts)
  // 内容库
  const { items, getRandomUnused, markUsed, initPresets, cleanup, performDailyUpdate, lastDailyUpdate } = useContentBankStore()

  const [activity, setActivity] = useState<Activity>('look')
  const [isLoading, setIsLoading] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // 走动位置（0-100 百分比）
  const [petX, setPetX] = useState(50)
  const [walkDirection, setWalkDirection] = useState<'left' | 'right'>('right')

  const idleCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleStateRef = useRef<IdleState>({ lastActivity: 'look', cooldowns: new Map() })
  const talkEndRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const walkAnimRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // [2026-04-28] 追踪每个 session 的上次 output token 数（用 Map 而不是单个值）
  const lastOutputBySessionRef = useRef<Map<string, number>>(new Map())

  // ── 走动动画 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (activity === 'walk' && !showBubble && !isLoading) {
      // 开始走动动画
      if (walkAnimRef.current) clearInterval(walkAnimRef.current)
      walkAnimRef.current = setInterval(() => {
        setPetX((prev) => {
          const step = walkDirection === 'right' ? 2 : -2
          const next = prev + step
          // 边界检查，碰到边缘就反向
          if (next >= 85) {
            setWalkDirection('left')
            return 85
          }
          if (next <= 15) {
            setWalkDirection('right')
            return 15
          }
          return next
        })
      }, 100) // 每 100ms 移动 2%
      return () => {
        if (walkAnimRef.current) clearInterval(walkAnimRef.current)
      }
    } else {
      // 停止走动动画，回到中心
      if (walkAnimRef.current) clearInterval(walkAnimRef.current)
      // 非 walk 状态时缓慢回到中心
      if (activity !== 'walk' && petX !== 50) {
        const resetInterval = setInterval(() => {
          setPetX((prev) => {
            const diff = 50 - prev
            const step = Math.sign(diff) * Math.min(Math.abs(diff), 1)
            const next = prev + step
            if (Math.abs(50 - next) < 1) {
              clearInterval(resetInterval)
              return 50
            }
            return next
          })
        }, 50)
        return () => clearInterval(resetInterval)
      }
    }
  }, [activity, showBubble, isLoading, walkDirection, petX])

  // ── 空闲轮换（加权随机）──────────────────────────────────────────
  const startIdleCycle = useCallback(() => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const step = (): void => {
      const { activity: nextActivity, msRange } = selectNextIdleActivity(idleStateRef.current)
      setActivity(nextActivity)
      const ms = randRange(msRange[0], msRange[1])
      idleCycleRef.current = setTimeout(step, ms)
    }
    step()
  }, [])

  // ── 内容库初始化和每日更新 ───────────────────────────────────────
  useEffect(() => {
    // 初始化预设内容
    if (items.length === 0) {
      initPresets()
    }
    // 清理过期内容
    cleanup()
    // 检查是否需要每日更新（每 5 分钟检查一次）
    const checkDaily = () => {
      const now = Date.now()
      const oneDayMs = 24 * 60 * 60 * 1000
      if (now - lastDailyUpdate > oneDayMs) {
        performDailyUpdate()
      }
    }
    checkDaily()
    const interval = setInterval(checkDaily, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [items.length, initPresets, cleanup, performDailyUpdate, lastDailyUpdate])

  // ── 内容库空闲触发 ──────────────────────────────────────────────────
  const IDLE_BANK_TRIGGER_PROBABILITY = 0.08 // 8% 概率触发
  const bankTriggerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerContentBank = useCallback(() => {
    // 冷却检查
    const now = Date.now()
    if (now - lastAutoAt < COOLDOWN_MS) return

    const item = getRandomUnused()
    if (!item) return

    setLastAutoAt(now)
    markUsed(item.id)

    // 停止空闲轮换
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)

    setActivity('excited')
    setSpeech(item.content)
    setShowBubble(true)

    // 8秒后恢复空闲
    bankTriggerRef.current = setTimeout(() => {
      setShowBubble(false)
      startIdleCycle()
    }, 8000)
  }, [lastAutoAt, setLastAutoAt, getRandomUnused, markUsed, setSpeech, startIdleCycle])

  // 空闲轮换 + 内容库触发概率
  useEffect(() => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const step = (): void => {
      // 概率触发内容库
      if (Math.random() < IDLE_BANK_TRIGGER_PROBABILITY && !showBubble && !isLoading) {
        triggerContentBank()
        return
      }
      const { activity: nextActivity, msRange } = selectNextIdleActivity(idleStateRef.current)
      setActivity(nextActivity)
      const ms = randRange(msRange[0], msRange[1])
      idleCycleRef.current = setTimeout(step, ms)
    }
    step()
    return () => { if (idleCycleRef.current) clearTimeout(idleCycleRef.current) }
  }, [triggerContentBank, showBubble, isLoading])

  // ── 抚摸互动 ──────────────────────────────────────────────────
  const petEndRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePet = useCallback(() => {
    // 冷却检查
    const now = Date.now()
    if (now - lastPetAt < PET_COOLDOWN_MS) return

    setLastPetAt(now)

    // 停止空闲轮换
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    if (petEndRef.current) clearTimeout(petEndRef.current)

    // 设置 happy 状态
    setActivity('happy')

    // 随机回复
    const reply = randomPick(PET_RESPONSES)
    setSpeech(reply)
    setShowBubble(true)

    // 2秒后恢复空闲
    petEndRef.current = setTimeout(() => {
      setShowBubble(false)
      startIdleCycle()
    }, 2000)
  }, [lastPetAt, setLastPetAt, setSpeech, startIdleCycle])

  // ── 触发宠物讲话 ──────────────────────────────────────────────
  const triggerPet = useCallback(
    async (userMsg: string) => {
      if (isLoading) return
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
          petConfig: { name: config.name, personality: config.personality, type: config.type },
          triggerType: 'auto',
        })
        console.log('[pet:ask result]', JSON.stringify(result))
        const reply = result.text?.trim() || result.error || '喵？没有响应...'
        pushHistory('assistant', reply)
        setSpeech(reply)
        setActivity('excited')
        setIsLoading(false)

        // 统计 token 消耗到全局 store
        if (result.usage) {
          useGlobalTokenStore.getState().ingest({
            input: result.usage.input,
            output: result.usage.output,
            cacheCreate: result.usage.cacheCreate,
            cacheRead: result.usage.cacheRead,
          })
        }

        talkEndRef.current = setTimeout(() => {
          setShowBubble(false)
          startIdleCycle()
        }, 12_000)
      } catch (err) {
        setSpeech('喵！API 失联了')
        setIsLoading(false)
        setShowBubble(false)
        startIdleCycle()
      }
    },
    [config, history, isLoading, setSpeech, pushHistory, startIdleCycle]
  )

  // ── 核心触发：监听所有 session 的 output tokens 增加 ────────────────────────
  // [2026-04-28] 改为监听所有 session，而不是只监听 activeSessionId
  useEffect(() => {
    const prob = config.triggerProbability / 100

    // 遍历所有 session，找出有新增 output tokens 的
    for (const [sessionId, totals] of Object.entries(allOutputTokens)) {
      const output = totals.output ?? 0
      const prevOutput = lastOutputBySessionRef.current.get(sessionId) ?? 0

      // 更新追踪值
      lastOutputBySessionRef.current.set(sessionId, output)

      // 检查是否有新增
      if (output <= prevOutput) continue

      const delta = output - prevOutput

      // 跳过太小的增量（可能是噪音）
      if (delta < 10) continue

      // 概率门控
      if (Math.random() > prob) continue

      // 冷却检查
      const now = Date.now()
      if (now - lastAutoAt < COOLDOWN_MS) continue

      // 获取该 session 的用户问题和工作目录
      const userPrompt = allUserPrompts.get(sessionId) ?? ''
      const session = sessions.find(s => s.id === sessionId)
      const workdir = session?.workdir ?? '(未知目录)'
      const ctx = `工作目录: ${workdir}\n${userPrompt ? `用户的问题: ${userPrompt}` : ''}`

      // 延迟 500ms 触发，确保 userPromptStore 已更新
      setTimeout(() => {
        // 冷却检查（再次确认，因为 timer 延迟了）
        const nowInner = Date.now()
        if (nowInner - lastAutoAt < COOLDOWN_MS) return
        setLastAutoAt(nowInner)
        void triggerPet(
          `[上下文]\n${ctx}\n\n用户刚刚在 Claude Code 中提交了一个问题并得到了回答（${delta} output tokens）。用你的人格，给出一条激进的技术点评或建议。`
        )
      }, 500)

      // 只触发一次，找到后立即跳出循环
      break
    }
  }, [allOutputTokens, allUserPrompts, sessions, lastAutoAt, triggerPet, setLastAutoAt, config.triggerProbability])

  // 气泡是否可见：loading 时 or talking 时
  const bubbleVisible = showBubble

  // 空闲时宠物居中放大，讲话时靠左紧凑
  const idleMode = !bubbleVisible && !isLoading

  // 当前活动在空闲列表中
  const isIdleActivity = IDLE_ACTIVITIES.includes(activity)

  // 走动时的样式
  const walkStyle = activity === 'walk' ? {
    transform: `translateX(${(petX - 50) * 2}px)`, // 基于中心位置的偏移
    transition: 'none',
  } : {
    transform: `translateX(${(petX - 50) * 2}px)`,
    transition: 'transform 0.5s ease-out',
  }

  // 走动时显示方向指示
  const walkIndicator = activity === 'walk' ? (walkDirection === 'right' ? '→' : '←') : ''

  return (
    <div className="shrink-0 border-t border-claude-border bg-claude-surface/50 overflow-hidden">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 transition-all duration-300 ${idleMode ? 'justify-center' : ''}`}
      >
        {/* 宠物 + 名字（点击抚摸，带位置动画）*/}
        <div
          className="flex flex-col items-center gap-0 cursor-pointer shrink-0"
          onClick={handlePet}
          title="点击抚摸"
          style={walkStyle}
        >
          <AsciiPet type={config.type} activity={activity} large={idleMode} />
          <span
            className="text-[8.5px] font-semibold leading-none mt-0.5 transition-colors duration-300"
            style={{ color: ACTIVITY_COLOR[activity] }}
          >
            {config.name}
            {isIdleActivity && activity !== 'look' && activity !== 'blink' && (
              <span className="ml-1 opacity-60">
                {activity === 'sleep' || activity === 'doze' ? 'zzz' :
                 activity === 'play' || activity === 'wiggle' ? '~' :
                 activity === 'curious' || activity === 'tilt' ? '?' :
                 activity === 'groom' ? '✨' :
                 activity === 'yawn' ? 'o' :
                 activity === 'hungry' ? '!' :
                 activity === 'sneeze' ? '~' :
                 activity === 'stretch' ? '↔' :
                 activity === 'walk' ? walkIndicator : ''}
              </span>
            )}
          </span>
        </div>

        {/* 气泡（仅讲话时显示）*/}
        {bubbleVisible && (
          <Bubble text={speech} loading={isLoading} />
        )}

        {/* 设置按钮（齿轮图标）*/}
        <button
          className="ml-auto p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded shrink-0"
          onClick={() => setExpanded((v) => !v)}
          title="设置"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>

      {/* 设置面板 */}
      {expanded && <SettingsPanel onClose={() => setExpanded(false)} />}
    </div>
  )
}
