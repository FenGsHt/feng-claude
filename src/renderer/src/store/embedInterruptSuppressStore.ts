import { create } from 'zustand'

/** [2026-05-08] 用户 Ctrl+C 后 PTY status 可能仍为 running，外嵌「处理中」依赖多项启发式；此处强制收起直至 idle 或新一轮发送 */
interface State {
  suppressWorkingBarBySession: Record<string, boolean>
  setInterrupted: (sessionId: string) => void
  clear: (sessionId: string) => void
}

export const useEmbedInterruptSuppressStore = create<State>((set) => ({
  suppressWorkingBarBySession: {},
  setInterrupted: (sessionId) =>
    set((s) => ({
      suppressWorkingBarBySession: { ...s.suppressWorkingBarBySession, [sessionId]: true }
    })),
  clear: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.suppressWorkingBarBySession
      return { suppressWorkingBarBySession: rest }
    })
}))
