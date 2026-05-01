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
import { usePetStore, type PetType, getAffectionTier, calculateActualTriggerProbability } from '../../store/petStore'
import { useSessionStore } from '../../store/sessionStore'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import { useGlobalTokenStore } from '../../store/globalTokenStore'
import { useContentBankStore } from '../../store/contentBankStore'
import { useUserPromptStore } from '../../store/userPromptStore'
import { navigateToPetTab } from './Sidebar'

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
  // 等级解锁
  | 'dance' | 'meditate' | 'fly' | 'crown' | 'legend'

// 空闲活动列表（不含触发状态）
const IDLE_ACTIVITIES: Activity[] = [
  'look', 'sleep', 'play', 'curious',
  'blink', 'stretch', 'yawn', 'hungry', 'sneeze', 'groom', 'wiggle', 'tilt', 'doze', 'walk',
  'dance', 'meditate', 'fly', 'crown', 'legend',
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
  // 等级解锁活动
  dance: {
    cat:    [[' /\\_/\\', '(^ω^ )', ' ≈♪≈ '], [' /\\_/\\', '( >ω<)', '♪   ♪'], [' /\\_/\\', '(^ω^ )', ' ≈♪≈ ']],
    robot:  [['[★  ★]', '[ ↑  ]', '[═══]'], ['[◉  ◉]', '[ ♪  ]', '[═══]'], ['[★  ★]', '[ ↓  ]', '[═══]']],
    dragon: [['∩___∩', '(◕ ‿ ◕)', ' ♪^♪ '], ['∩___∩', '(◕ ▽ ◕)', '^♪^ '], ['∩___∩', '(◕ ‿ ◕)', ' ♪^♪ ']],
    ghost:  [['.--.', '(★  ★)', '♪∿♪ '], ['.--.', '(◉  ◉)', '∿♪∿'], ['.--.', '(★  ★)', '♪∿♪ ']],
  },
  meditate: {
    cat:    [[' /\\_/\\', '( ·ω·)', '  ~  '], [' /\\_/\\', '( ·ω·)', '     ']],
    robot:  [['[·  ·]', '[ ◦  ]', '[═══]'], ['[·  ·]', '[    ]', '[═══]']],
    dragon: [['∩___∩', '(·  ·)', '  ~  '], ['∩___∩', '(·  ·)', '     ']],
    ghost:  [['.--.', '(·  ·)', ' ∿~∿'], ['.--.', '(·  ·)', ' ∿  ']],
  },
  fly: {
    cat:    [[' /\\_/\\', '(^ω^)', ' ≈≈≈ '], ['   ~ ', '  ^  ', ' ≈≈≈ '], [' /\\_/\\', '(^ω^)', ' ≈≈≈ ']],
    robot:  [['  ~  ', '[◉  ◉]', '[═══]'], [' ~~~ ', '[★  ★]', '[═══]']],
    dragon: [['∩___∩', '(◕ ▽ ◕)', ' ∿∿∿∿'], [' ~~~ ', '  ^  ', '∿∿∿∿ ']],
    ghost:  [['.--.', '(★  ★)', '∿✨∿✨'], [' ~~~ ', '  ★  ', '∿∿∿∿ ']],
  },
  crown: {
    cat:    [[' /\\_/\\', ' (★ω★)', '  >-< '], [' /★_★\\', '( ★ω★)', '  >-< ']],
    robot:  [[' ★★  ', '[◉  ◉]', '[ ▽  ]', '[═══]'], ['★  ★ ', '[◉  ◉]', '[ ▽  ]', '[═══]']],
    dragon: [[' ∩_∩ ', '(◕ ★◕)', '  ~^~ '], [' ★ ★ ', '(◕ ▽ ◕)', '  ~^~ ']],
    ghost:  [[' ★  ', '.--.', '(★  ★)', ' ∿∿∿ '], ['  ★ ', '.--.', '(★  ★)', ' ∿∿∿ ']],
  },
  legend: {
    cat:    [[' /★_/\\', '(★ω★)', '!!! !!'], [' /\\_/\\', '(★★★)', ' ✨✨ '], [' /★_/\\', '(★ω★)', '!! !!!']],
    robot:  [['★★★★', '[★  ★]', '[ !!!]', '[═══]'], ['[★★★★]', '[★  ★]', '[ !!!]', '[═══]']],
    dragon: [['★∩_∩★', '(★ ★★)', '✨✨✨'], [' ∩_∩ ', '(★★★★)', ' ✨✨ ']],
    ghost:  [['.★--.', '(★  ★)', '✨∿✨ '], ['.--. ', '(★★★★)', '∿✨✨']],
  },
}

// 加权随机空闲池
interface IdlePoolEntry {
  activity: Activity
  weight: number
  msRange: [number, number]
  cooldown: number
  forbiddenAfter: Activity[]
  unlockLevel?: number  // 需要宠物等级才能解锁
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
  // 等级解锁活动
  { activity: 'dance',    weight: 3, msRange: [3000, 6000],  cooldown: 4, forbiddenAfter: ['sleep', 'doze'], unlockLevel: 5 },
  { activity: 'meditate', weight: 2, msRange: [6000, 10000], cooldown: 4, forbiddenAfter: [], unlockLevel: 10 },
  { activity: 'fly',      weight: 2, msRange: [4000, 8000],  cooldown: 4, forbiddenAfter: ['sleep', 'doze'], unlockLevel: 15 },
  { activity: 'crown',    weight: 1, msRange: [5000, 9000],  cooldown: 5, forbiddenAfter: [], unlockLevel: 20 },
  { activity: 'legend',   weight: 1, msRange: [6000, 12000], cooldown: 6, forbiddenAfter: [], unlockLevel: 25 },
]

// 空闲状态跟踪
interface IdleState {
  lastActivity: Activity
  cooldowns: Map<Activity, number>
}

// 加权随机选择下一个空闲活动
function selectNextIdleActivity(state: IdleState, level = 1): { activity: Activity; msRange: [number, number] } {
  // 1. 更新 cooldown 计数器
  for (const [act, cd] of state.cooldowns) {
    if (cd <= 1) state.cooldowns.delete(act)
    else state.cooldowns.set(act, cd - 1)
  }

  // 2. 构建候选池（含等级过滤）
  const candidates = IDLE_POOL.filter((entry) => {
    // 不在 cooldown 中
    if (state.cooldowns.has(entry.activity)) return false
    // 不是 forbiddenAfter 当前活动
    if (entry.forbiddenAfter.includes(state.lastActivity)) return false
    // 等级解锁
    if (entry.unlockLevel && level < entry.unlockLevel) return false
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
  // 等级解锁
  dance: 350, meditate: 1500, fly: 600, crown: 800, legend: 400,
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
  // 等级解锁
  dance: '#f9a8d4', meditate: '#a78bfa', fly: '#7dd3fc', crown: '#fbbf24', legend: '#f472b6',
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
    <div className="flex-1 min-w-0 rounded-lg bg-slate-700/80 border border-slate-600/50 px-2.5 py-2 text-[10px] text-slate-200 leading-snug relative max-h-[150px] overflow-y-auto">
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

const BUBBLE_DISPLAY_MS = 30_000  // 回复气泡显示时长（30秒）

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
  const { config, speech, history, lastAutoAt, lastPetAt, growth,
          setSpeech, pushHistory, setLastAutoAt, setLastPetAt,
          addXp, addAffection } = usePetStore()
  const { sessions, activeSessionId, history: sessionHistory } = useSessionStore()
  // output token 计数是最准确的"Claude Code 完成了一轮回答"的信号
  const outputTokens = useTokenUsageStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.output ?? 0) : 0
  )
  // 内容库
  const { items, getRandomUnused, markUsed, initPresets, cleanup, performDailyUpdate, lastDailyUpdate } = useContentBankStore()

  const [activity, setActivity] = useState<Activity>('look')
  const [isLoading, setIsLoading] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  // 走动位置（0-100 百分比）
  const [petX, setPetX] = useState(50)
  const [walkDirection, setWalkDirection] = useState<'left' | 'right'>('right')
  // 升级庆祝
  const [celebrating, setCelebrating] = useState(false)
  // XP 条可见性
  const [showXpBar, setShowXpBar] = useState(false)

  const idleCycleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleStateRef = useRef<IdleState>({ lastActivity: 'look', cooldowns: new Map() })
  const talkEndRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const walkAnimRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 上次看到的 output token 数，用于检测新增
  const lastOutputRef = useRef(0)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

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

  // ── 好感度衰减（挂载时计算，防止重复衰减）─────────────────────────
  useEffect(() => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    // 检查是否已过一天以上
    const daysSinceInteraction = (now - growth.lastInteractionAt) / oneDayMs
    if (daysSinceInteraction < 1) return
    // 检查是否已经衰减过（lastDecayAt 在一天内）
    const daysSinceDecay = (now - growth.lastDecayAt) / oneDayMs
    if (daysSinceDecay < 1) return

    const decayAmount = daysSinceInteraction >= 3
      ? 5 * Math.floor(daysSinceInteraction)
      : 1 * Math.floor(daysSinceInteraction)
    if (decayAmount > 0) {
      usePetStore.getState().applyAffectionDecay(-decayAmount)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 空闲轮换（加权随机）──────────────────────────────────────────
  const startIdleCycle = useCallback(() => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const step = (): void => {
      const currentLevel = usePetStore.getState().growth.level
      const { activity: nextActivity, msRange } = selectNextIdleActivity(idleStateRef.current, currentLevel)
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
  const lastAutoRef = useRef(usePetStore.getState().lastAutoAt)

  // 调度下一个空闲活动（供 triggerContentBank 内部 fallback 使用）
  const scheduleNextIdle = useCallback(() => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const currentLevel = usePetStore.getState().growth.level
    const { activity: nextActivity, msRange } = selectNextIdleActivity(idleStateRef.current, currentLevel)
    setActivity(nextActivity)
    idleCycleRef.current = setTimeout(() => {
      // 单次调度后重新交还给空闲循环 useEffect 接管
    }, randRange(msRange[0], msRange[1]))
  }, [])

  const triggerContentBank = useCallback(() => {
    // 冷却检查（使用 ref 避免 deps 频繁变化）
    const now = Date.now()
    if (now - lastAutoRef.current < COOLDOWN_MS) {
      // 冷却中，fallback 到空闲选择，不杀死循环
      scheduleNextIdle()
      return
    }

    const item = getRandomUnused()
    if (!item) {
      // 没有可用内容，fallback 到空闲选择
      scheduleNextIdle()
      return
    }

    lastAutoRef.current = now
    usePetStore.getState().setLastAutoAt(now)
    markUsed(item.id)
    addXp(2, 'contentBank')
    addAffection(1)

    // 停止空闲轮换
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)

    setActivity('excited')
    setSpeech(item.content)
    setShowBubble(true)

    // 恢复空闲轮换
    bankTriggerRef.current = setTimeout(() => {
      setShowBubble(false)
      scheduleNextIdle()
    }, 8000)
  }, [getRandomUnused, markUsed, setSpeech, scheduleNextIdle])

  // 空闲轮换 + 内容库触发概率
  useEffect(() => {
    if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
    const step = (): void => {
      // 概率触发内容库
      if (Math.random() < IDLE_BANK_TRIGGER_PROBABILITY && !showBubble && !isLoading) {
        triggerContentBank()
        return
      }
      const currentLevel = usePetStore.getState().growth.level
      const { activity: nextActivity, msRange } = selectNextIdleActivity(idleStateRef.current, currentLevel)
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
    addXp(5, 'pet')
    addAffection(3)

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
          petConfig: { name: config.name, personality: config.personality },
          growth: {
            level: growth.level,
            affection: growth.affection,
            skills: growth.skills.filter(sk => sk.level > 0),
          },
        })
        const reply = result.text?.trim() || '喵？没有响应...'
        pushHistory('assistant', reply)
        addXp(10, 'chat')
        addAffection(1)
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
        }, BUBBLE_DISPLAY_MS)
      } catch {
        setSpeech('喵！API 失联了')
        setIsLoading(false)
        setShowBubble(false)
        startIdleCycle()
      }
    },
    [config, history, isLoading, setSpeech, pushHistory, startIdleCycle]
  )

  // ── 构建上下文 ────────────────────────────────────────────────
  const buildContext = useCallback((): string => {
    const workdir = activeSession?.workdir ?? '(未知目录)'
    const lastPrompt = activeSessionId ? (useUserPromptStore.getState().getPrompt(activeSessionId) ?? '') : ''
    const lines = [`工作目录: ${workdir}`]
    if (lastPrompt) lines.push(`用户的问题: ${lastPrompt}`)
    return lines.join('\n')
  }, [activeSession, activeSessionId])

  // ── 核心触发：监听 output tokens 增加 ────────────────────────
  // output tokens 增加 = Claude Code 完成了一轮回答 = 用户之前发送了一个问题
  useEffect(() => {
    if (outputTokens <= lastOutputRef.current) {
      lastOutputRef.current = outputTokens
      return
    }
    // 有新的 output tokens
    const delta = outputTokens - lastOutputRef.current
    lastOutputRef.current = outputTokens

    // [2026-04-28] 窗口不在前台时不触发
    if (!document.hasFocus()) return

    // [2026-04-28] 跳过太小的增量（agent 调用产生的噪音），只响应较大增量（用户提问的回答）
    if (delta < 100) return

    // 概率门控：考虑用户设置和好感度
    const tier = getAffectionTier(growth.affection)
    const triggerProb = calculateActualTriggerProbability(config.triggerProbability, tier)
    if (Math.random() > triggerProb) return

    // 冷却检查
    const now = Date.now()
    if (now - lastAutoAt < COOLDOWN_MS) return

    setLastAutoAt(now)
    addXp(3, 'autoTrigger')
    addAffection(2)
    const ctx = buildContext()
    void triggerPet(
      `[上下文]\n${ctx}\n\n用户刚完成一轮 Claude Code 对话。用你的人格点评或建议。`
    )
  }, [outputTokens, lastAutoAt, buildContext, triggerPet, setLastAutoAt, growth.affection, addXp, addAffection])

  // session 切换时重置 token 计数基线
  useEffect(() => {
    lastOutputRef.current = outputTokens
  }, [activeSessionId])  // eslint-disable-line react-hooks/exhaustive-deps

  // 升级庆祝
  const prevLevelRef = useRef(growth.level)
  useEffect(() => {
    if (growth.level > prevLevelRef.current) {
      setCelebrating(true)
      setActivity('excited')
      if (idleCycleRef.current) clearTimeout(idleCycleRef.current)
      setTimeout(() => setCelebrating(false), 3000)
      // 显示系统通知
      try {
        window.electronAPI.showNotification?.(`${config.name} 升级！`, `恭喜！${config.name} 达到了 Lv.${growth.level}！获得 1 个技能点。`)
      } catch {}
    }
    prevLevelRef.current = growth.level
  }, [growth.level, config.name])

  // 气泡是否可见：loading 时 or talking 时
  const bubbleVisible = showBubble

  // 空闲时宠物居中放大，讲话时靠左紧凑
  const idleMode = !bubbleVisible && !isLoading

  // 当前活动在空闲列表中
  const isIdleActivity = IDLE_ACTIVITIES.includes(activity)

  // 升级时覆盖活动显示
  const effectiveActivity = celebrating ? 'excited' : activity

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
          className="flex flex-col items-center gap-0 cursor-pointer shrink-0 relative"
          onClick={handlePet}
          title="点击抚摸"
          onMouseEnter={() => setShowXpBar(true)}
          onMouseLeave={() => setShowXpBar(false)}
          style={walkStyle}
        >
          <AsciiPet type={config.type} activity={effectiveActivity} large={idleMode} />
          <span
            className="text-[8.5px] font-semibold leading-none mt-0.5 transition-colors duration-300"
            style={{ color: ACTIVITY_COLOR[activity] }}
          >
            {config.name} <span className="opacity-60">Lv.{growth.level}</span>
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
                 activity === 'walk' ? walkIndicator :
                 activity === 'dance' ? '♪' :
                 activity === 'meditate' ? '～' :
                 activity === 'fly' ? '↑' :
                 activity === 'crown' ? '★' :
                 activity === 'legend' ? '✦' : ''}
              </span>
            )}
          </span>
          {/* XP 进度条（悬停显示）*/}
          {showXpBar && (
            <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden mt-0.5">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${(growth.xp / growth.xpToNext) * 100}%` }}
              />
            </div>
          )}
        </div>
        {bubbleVisible && (
          <Bubble text={speech} loading={isLoading} />
        )}

        {/* 设置按钮（齿轮图标）*/}
        <button
          className="ml-auto p-1 text-claude-muted hover:text-claude-text hover:bg-claude-surface rounded shrink-0"
          onClick={() => navigateToPetTab()}
          title="设置"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
