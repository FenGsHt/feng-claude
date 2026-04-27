import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PetType = 'cat' | 'robot' | 'dragon' | 'ghost'
export type PetMood = 'idle' | 'thinking' | 'talking' | 'excited'

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

  setConfig: (c: Partial<PetConfig>) => void
  setMood: (m: PetMood) => void
  setSpeech: (s: string) => void
  setLastAutoAt: (t: number) => void
  setLastPetAt: (t: number) => void
  pushHistory: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void
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
        triggerProbability: 40, // 默认 40% 概率
      },
      mood: 'idle',
      speech: '喵~ 我在偷看你的代码',
      lastAutoAt: 0,
      lastPetAt: 0,
      history: [],

      setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
      setMood: (m) => set({ mood: m }),
      setSpeech: (s) => set({ speech: s }),
      setLastAutoAt: (t) => set({ lastAutoAt: t }),
      setLastPetAt: (t) => set({ lastPetAt: t }),
      pushHistory: (role, content) =>
        set((s) => ({
          history: [...s.history, { role, content }].slice(-24)
        })),
      clearHistory: () => set({ history: [] })
    }),
    {
      name: 'pet-store',
      partialize: (s) => ({ config: s.config, speech: s.speech, history: s.history })
    }
  )
)
