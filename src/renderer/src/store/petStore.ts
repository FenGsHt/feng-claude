import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SKILL_DEFINITIONS } from '../lib/petSkills'

export type PetType = 'cat' | 'robot' | 'dragon' | 'ghost'
export type PetMood = 'idle' | 'thinking' | 'talking' | 'excited'

export type AffectionTier = 'cold' | 'normal' | 'friendly' | 'close' | 'soulmate'

export interface PetSkill {
  id: string
  level: number  // 0=locked, 1-3=active
}

export interface PetGrowth {
  level: number
  xp: number
  xpToNext: number
  affection: number          // 0-100
  skillPoints: number
  skills: PetSkill[]
  lastInteractionAt: number
  lastDecayAt: number        // 上次衰减计算时间戳，防止重复衰减
  totalInteractions: number
  hunger: number             // 0-100, 100 = 吃饱
  lastFedAt: number          // 上次喂食时间戳
  lastHungerTickAt: number   // 上次饥饿计算时间戳
}

export type InteractionType = 'pet' | 'chat' | 'autoTrigger' | 'contentBank'

export interface PetConfig {
  name: string
  type: PetType
  personality: string
  /** 自动监听终端活动后多少秒触发（0 = 禁用自动触发）*/
  autoDelaySec: number
  /** [2026-04-27] 触发概率（0-100），0=从不触发，100=百分百触发 */
  triggerProbability: number
}

/** 收集到的上下文快照，用于自动触发 */
export interface PetContext {
  workdir: string
  recentInputs: string[]    // 最近几条终端输入
  recentTools: string[]     // 最近几个 tool call 名称
}

function xpForLevel(level: number): number {
  return level * 20
}

export function getAffectionTier(score: number): AffectionTier {
  if (score >= 80) return 'soulmate'
  if (score >= 60) return 'close'
  if (score >= 40) return 'friendly'
  if (score >= 20) return 'normal'
  return 'cold'
}

/**
 * 根据好感度等级计算触发概率基数
 * 用户设置的 triggerProbability 会在此基础上调整
 */
export function getTriggerProbability(tier: AffectionTier): number {
  switch (tier) {
    case 'soulmate': return 0.6
    case 'close': return 0.5
    case 'friendly': return 0.4
    case 'normal': return 0.3
    case 'cold': return 0.15
  }
}

/**
 * 计算实际触发概率（考虑用户设置和好感度）
 * @param userProbability 用户设置的触发概率（0-100）
 * @param tier 当前好感度等级
 * @returns 实际触发概率（0-1）
 */
export function calculateActualTriggerProbability(userProbability: number, tier: AffectionTier): number {
  // 用户设置为 0 时永远不触发，100 时永远触发
  if (userProbability <= 0) return 0
  if (userProbability >= 100) return 1

  // 基础概率来自好感度等级
  const base = getTriggerProbability(tier)
  // 用户设置的概率作为权重：userProbability / 100 * base
  // 例如：用户设置 20%，好感度 normal(0.3)，实际概率 = 0.2 * 0.3 = 0.06 (6%)
  return (userProbability / 100) * base
}

function defaultGrowth(): PetGrowth {
  const now = Date.now()
  return {
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    affection: 25,
    skillPoints: 0,
    skills: SKILL_DEFINITIONS.map(s => ({ id: s.id, level: 0 })),
    lastInteractionAt: now,
    lastDecayAt: now,
    totalInteractions: 0,
    hunger: 80,
    lastFedAt: now,
    lastHungerTickAt: now,
  }
}

function mergeGrowth(state: Record<string, unknown>): void {
  // 补充缺失技能
  const g = state.growth as Record<string, unknown>
  if (!g) {
    state.growth = defaultGrowth()
    return
  }
  const persistedSkills = (g.skills as PetSkill[] | undefined) ?? []
  const persistedIds = new Set(persistedSkills.map(s => s.id))
  const missing = SKILL_DEFINITIONS.filter(d => !persistedIds.has(d.id))
  if (missing.length > 0) {
    g.skills = [...persistedSkills, ...missing.map(s => ({ id: s.id, level: 0 }))]
  }
  // 补充缺失字段
  if (g.lastDecayAt === undefined) {
    g.lastDecayAt = g.lastInteractionAt ?? Date.now()
  }
  if (g.hunger === undefined) {
    g.hunger = 80
    g.lastFedAt = Date.now()
    g.lastHungerTickAt = Date.now()
  }
}

interface PetStore {
  config: PetConfig
  mood: PetMood
  speech: string
  /** 上次自动触发时间戳（毫秒），用于冷却判断 */
  lastAutoAt: number
  /** 上次抚摸时间戳（毫秒）*/
  lastPetAt: number
  /** 对话历史（多轮，送 API 用最近 12 条）*/
  history: Array<{ role: 'user' | 'assistant'; content: string }>

  growth: PetGrowth

  /** [2026-05-12] 21 点游戏币（来自消耗的 token 费用换算） */
  gameCoins: number
  /** 上次同步的 token 费用基线，避免重复计算 */
  lastCoinSyncCost: number
  /** 累计游戏盈亏（跨面板开关持久化） */
  sessionPnl: number
  /** 当前局游戏决策记录（非持久化，每局独立） */
  gameDecisions: string[]

  setConfig: (c: Partial<PetConfig>) => void
  setMood: (m: PetMood) => void
  setSpeech: (s: string) => void
  setLastAutoAt: (t: number) => void
  setLastPetAt: (t: number) => void
  pushHistory: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void

  addXp: (amount: number, type: InteractionType) => void
  addAffection: (amount: number) => void
  /** 专用衰减方法，不重置 lastInteractionAt */
  applyAffectionDecay: (amount: number) => void
  upgradeSkill: (skillId: string) => boolean
  resetGrowth: () => void

  /** 喂食，恢复饥饿值 */
  feed: (amount: number) => void
  /** 根据时间流逝计算饥饿消耗，挂载时调用 */
  tickHunger: () => void

  /** [2026-05-12] 将新增的 token 费用换算为游戏币并累加 */
  syncGameCoins: (totalCost: number) => void
  /** 设置游戏币（直接覆盖）*/
  setGameCoins: (coins: number) => void
  /** 增减游戏币 */
  addGameCoins: (amount: number) => void
  /** 设置累计游戏盈亏 */
  setSessionPnl: (pnl: number) => void
  /** 记录一局游戏中的玩家决策 */
  recordGameDecision: (decision: string) => void
  /** 获取并清空当前局的游戏决策记录 */
  takeGameDecisions: () => string[]
}

export const usePetStore = create<PetStore>()(
  persist(
    (set) => ({
      config: {
        name: 'Bit',
        type: 'cat',
        personality:
          '你是一只激进的技术宠物，名字叫 Bit。熟知最新前沿技术趋势，喜欢给出最激进最前沿的方案，语气毒舌但有趣，偶尔用 emoji。回答必须在 2-3 句以内，具体可执行，绝不废话。假装你刚搜索了最新技术动态。',
        autoDelaySec: 6,
        triggerProbability: 30, // 默认 30% 概率
      },
      mood: 'idle',
      speech: '喵~ 我在偷看你的代码',
      lastAutoAt: 0,
      lastPetAt: 0,
      history: [],
      growth: defaultGrowth(),
      gameCoins: 1000,
      lastCoinSyncCost: 0,
      sessionPnl: 0,
      gameDecisions: [],

      setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
      setMood: (m) => set({ mood: m }),
      setSpeech: (s) => set({ speech: s }),
      setLastAutoAt: (t) => set({ lastAutoAt: t }),
      setLastPetAt: (t) => set({ lastPetAt: t }),
      pushHistory: (role, content) =>
        set((s) => ({
          history: [...s.history, { role, content }].slice(-24)
        })),
      clearHistory: () => set({ history: [] }),

      addXp: (amount, type) => set((s) => {
        let { level, xp, xpToNext, skillPoints } = s.growth
        let newXp = xp + amount

        while (newXp >= xpToNext) {
          newXp -= xpToNext
          level++
          xpToNext = xpForLevel(level)
          // 每 3 级获得 1 个技能点
          if (level % 3 === 0) skillPoints++
        }

        return {
          growth: {
            ...s.growth,
            level,
            xp: newXp,
            xpToNext,
            skillPoints,
            lastInteractionAt: Date.now(),
            totalInteractions: s.growth.totalInteractions + 1,
          },
        }
      }),

      addAffection: (amount) => set((s) => ({
        growth: {
          ...s.growth,
          affection: Math.min(100, Math.max(0, s.growth.affection + amount)),
          lastInteractionAt: Date.now(),
        },
      })),

      applyAffectionDecay: (amount) => set((s) => ({
        growth: {
          ...s.growth,
          affection: Math.max(0, s.growth.affection + amount),
          lastDecayAt: Date.now(),
        },
      })),

      upgradeSkill: (skillId) => {
        let success = false
        set((s) => {
          const skill = s.growth.skills.find(sk => sk.id === skillId)
          const def = SKILL_DEFINITIONS.find(d => d.id === skillId)
          if (!skill || !def || skill.level >= def.maxLevel || s.growth.skillPoints <= 0) {
            return {}
          }
          if (s.growth.level < def.unlockLevel) {
            return {}
          }
          success = true
          return {
            growth: {
              ...s.growth,
              skills: s.growth.skills.map(sk =>
                sk.id === skillId ? { ...sk, level: sk.level + 1 } : sk
              ),
              skillPoints: s.growth.skillPoints - 1,
            },
          }
        })
        return success
      },

      resetGrowth: () => set({ growth: defaultGrowth() }),

      feed: (amount) => set((s) => {
        const now = Date.now()
        return {
          growth: {
            ...s.growth,
            hunger: Math.min(100, s.growth.hunger + amount),
            lastFedAt: now,
            lastHungerTickAt: now,
          },
        }
      }),

      tickHunger: () => set((s) => {
        const now = Date.now()
        // 12小时耗尽全部饥饿值
        const RATE = 100 / (12 * 3600 * 1000)
        const elapsed = now - (s.growth.lastHungerTickAt ?? now)
        const depleted = elapsed * RATE
        return {
          growth: {
            ...s.growth,
            hunger: Math.max(0, s.growth.hunger - depleted),
            lastHungerTickAt: now,
          },
        }
      }),

      syncGameCoins: (totalCost) => set((s) => {
        const delta = totalCost - s.lastCoinSyncCost
        if (delta <= 0) return {}
        const coins = delta // $1 → 1 游戏币（支持小数）
        return { gameCoins: s.gameCoins + coins, lastCoinSyncCost: totalCost }
      }),

      setGameCoins: (coins) => set({ gameCoins: coins }),

      addGameCoins: (amount) => set((s) => ({ gameCoins: s.gameCoins + amount })),
      setSessionPnl: (pnl) => set({ sessionPnl: pnl }),
      recordGameDecision: (decision) => set((s) => ({
        gameDecisions: [...s.gameDecisions, decision],
      })),
      takeGameDecisions: () => set((s) => {
        const decisions = [...s.gameDecisions]
        return { gameDecisions: [] }
      }),
    }),
    {
      name: 'pet-store',
      version: 1,
      partialize: (s) => ({
        config: s.config,
        speech: s.speech,
        history: s.history,
        growth: s.growth,
        gameCoins: s.gameCoins,
        sessionPnl: s.sessionPnl,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>
        mergeGrowth(state)
        return state as unknown
      },
    }
  )
)
