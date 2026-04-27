import { create } from 'zustand'

/**
 * UserPromptStore - 存储实时用户问题
 *
 * 与 sessionHistory 不同，这里是实时存储：
 * - 用户输入后立即更新（无 debounce）
 * - 宠物触发时直接使用，无 IPC 延迟
 */

interface UserPromptStore {
  /** sessionId -> 最近用户提交给 Claude 的问题 */
  prompts: Map<string, string>
  /** sessionId -> 最近用户提交的时间戳 */
  timestamps: Map<string, number>

  /** 更新用户问题（实时，无延迟） */
  setPrompt: (sessionId: string, prompt: string) => void
  /** 获取用户问题 */
  getPrompt: (sessionId: string) => string | undefined
  /** 清除指定 session */
  clearSession: (sessionId: string) => void
}

export const useUserPromptStore = create<UserPromptStore>((set, get) => ({
  prompts: new Map(),
  timestamps: new Map(),

  setPrompt: (sessionId, prompt) => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    set((state) => {
      const newPrompts = new Map(state.prompts)
      const newTimestamps = new Map(state.timestamps)
      newPrompts.set(sessionId, trimmed)
      newTimestamps.set(sessionId, Date.now())
      return { prompts: newPrompts, timestamps: newTimestamps }
    })
  },

  getPrompt: (sessionId) => get().prompts.get(sessionId),

  clearSession: (sessionId) => {
    set((state) => {
      const newPrompts = new Map(state.prompts)
      const newTimestamps = new Map(state.timestamps)
      newPrompts.delete(sessionId)
      newTimestamps.delete(sessionId)
      return { prompts: newPrompts, timestamps: newTimestamps }
    })
  },
}))