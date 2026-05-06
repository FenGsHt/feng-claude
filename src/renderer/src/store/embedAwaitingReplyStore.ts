import { create } from 'zustand'

/** [2026-05-06] 外嵌发送后至 JSONL 首条非 user 前，UI 显示「处理中」；主进程 running 往往晚于首屏等待 */

interface State {
  /** sessionId → 当前一轮是否在等 Claude 首段输出 */
  pendingBySession: Record<string, boolean>
  markPending: (sessionId: string) => void
  clearPending: (sessionId: string) => void
}

export const useEmbedAwaitingReplyStore = create<State>((set) => ({
  pendingBySession: {},
  markPending: (sessionId) =>
    set((s) => ({
      pendingBySession: { ...s.pendingBySession, [sessionId]: true }
    })),
  clearPending: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.pendingBySession
      return { pendingBySession: rest }
    })
}))
