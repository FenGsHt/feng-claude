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
  totalInteractions: number
}

export type InteractionType = 'pet' | 'chat' | 'autoTrigger' | 'contentBank'

export interface PetConfig {
  name: string
  type: PetType
  personality: string
  /** 自动监听终端活动后多少秒触发（0 = 禁用自动触发）*/
  autoDelaySec: number
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

export function getTriggerProbability(tier: AffectionTier): number {
  switch (tier) {
    case 'soulmate': return 0.6
    case 'close': return 0.5
    case 'friendly': return 0.4
    case 'normal': return 0.3
    case 'cold': return 0.15
  }
}

function defaultGrowth(): PetGrowth {
  return {
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    affection: 25,
    skillPoints: 0,
    skills: SKILL_DEFINITIONS.map(s => ({ id: s.id, level: 0 })),
    lastInteractionAt: Date.now(),
    totalInteractions: 0,
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

  setConfig: (c: Partial<PetConfig>) => void
  setMood: (m: PetMood) => void
  setSpeech: (s: string) => void
  setLastAutoAt: (t: number) => void
  setLastPetAt: (t: number) => void
  pushHistory: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void

  addXp: (amount: number, type: InteractionType) => void
  addAffection: (amount: number) => void
  upgradeSkill: (skillId: string) => void
  resetGrowth: () => void
}

export const usePetStore = create<PetStore>()(
  persist(
    (set) => ({
      config: {
        name: 'Bit',
        type: 'cat',
        personality:
          '你是一只激进的技术宠物，名字叫 Bit。熟知最新前沿技术趋势，喜欢给出最激进最前沿的方案，语气毒舌但有趣，偶尔用 emoji。回答必须在 2-3 句以内，具体可执行，绝不废话。假装你刚搜索了最新技术动态。',
        autoDelaySec: 6
      },
      mood: 'idle',
      speech: '喵~ 我在偷看你的代码',
      lastAutoAt: 0,
      lastPetAt: 0,
      history: [],
      growth: defaultGrowth(),

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

        while (newXp >= xpToNext && level < 30) {
          newXp -= xpToNext
          level++
          xpToNext = xpForLevel(level)
          skillPoints++
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

      upgradeSkill: (skillId) => set((s) => {
        const skill = s.growth.skills.find(sk => sk.id === skillId)
        const def = SKILL_DEFINITIONS.find(d => d.id === skillId)
        if (!skill || !def || skill.level >= def.maxLevel || s.growth.skillPoints <= 0) {
          return {}
        }
        if (s.growth.level < def.unlockLevel) {
          return {}
        }
        return {
          growth: {
            ...s.growth,
            skills: s.growth.skills.map(sk =>
              sk.id === skillId ? { ...sk, level: sk.level + 1 } : sk
            ),
            skillPoints: s.growth.skillPoints - 1,
          },
        }
      }),

      resetGrowth: () => set({ growth: defaultGrowth() }),
    }),
    {
      name: 'pet-store',
      partialize: (s) => ({
        config: s.config,
        speech: s.speech,
        history: s.history,
        growth: s.growth,
      }),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>
        if (!state.growth) {
          state.growth = defaultGrowth()
        }
        return state as unknown
      },
    }
  )
)
