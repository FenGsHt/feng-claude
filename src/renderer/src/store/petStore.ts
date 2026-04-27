import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PetType = 'cat' | 'robot' | 'dragon' | 'ghost'
export type PetMood = 'idle' | 'thinking' | 'talking' | 'excited'

export interface PetConfig {
  name: string
  type: PetType
  /** 自定义人格描述，写给 Claude 的 system prompt 用 */
  personality: string
}

interface PetStore {
  config: PetConfig
  mood: PetMood
  speech: string
  lastAskedAt: number
  /** 对话历史（最近 6 条，用于多轮）*/
  history: Array<{ role: 'user' | 'assistant'; content: string }>

  setConfig: (c: Partial<PetConfig>) => void
  setMood: (m: PetMood) => void
  setSpeech: (s: string) => void
  setLastAskedAt: (t: number) => void
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
          '你是一只激进的技术宠物，名字叫 Bit。你熟知最新前沿技术，喜欢推荐最新最激进的方案，不废话，语气毒舌但有趣，偶尔用表情符号。回答控制在 3 句话以内，给出具体的、最激进的建议。'
      },
      mood: 'idle',
      speech: '喵~ 有什么想问我的？',
      lastAskedAt: 0,
      history: [],

      setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
      setMood: (m) => set({ mood: m }),
      setSpeech: (s) => set({ speech: s }),
      setLastAskedAt: (t) => set({ lastAskedAt: t }),
      pushHistory: (role, content) =>
        set((s) => ({
          history: [...s.history, { role, content }].slice(-12)
        })),
      clearHistory: () => set({ history: [] })
    }),
    {
      name: 'pet-store',
      partialize: (s) => ({ config: s.config, speech: s.speech, history: s.history })
    }
  )
)
