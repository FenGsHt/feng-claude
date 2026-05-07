import { create } from 'zustand'

interface NativeTerminalRequest {
  open: boolean
  needed: boolean
  reason?: string
  updatedAt: number
  dismissedAt?: number
}

interface NativeTerminalRequestState {
  bySession: Record<string, NativeTerminalRequest>
  requestNativeTerminal: (sessionId: string, reason?: string) => void
  openNativeTerminal: (sessionId: string, reason?: string) => void
  dismissNativeTerminal: (sessionId: string) => void
  clearNativeTerminal: (sessionId: string) => void
}

export const useNativeTerminalRequestStore = create<NativeTerminalRequestState>((set) => ({
  bySession: {},
  requestNativeTerminal: (sessionId, reason) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: {
          /* [2026-05-07] 原只标记 needed 导致状态提示和真实浮窗不同步；检测到需要终端时应自动打开。 */
          // open: s.bySession[sessionId]?.open === true,
          open: true,
          needed: true,
          reason: reason ?? s.bySession[sessionId]?.reason,
          updatedAt: Date.now(),
          dismissedAt: s.bySession[sessionId]?.dismissedAt
        }
      }
    })),
  openNativeTerminal: (sessionId, reason) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: {
          open: true,
          needed: true,
          reason,
          updatedAt: Date.now(),
          dismissedAt: s.bySession[sessionId]?.dismissedAt
        }
      }
    })),
  dismissNativeTerminal: (sessionId) =>
    set((s) => {
      const prev = s.bySession[sessionId]
      if (!prev) return s
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...prev,
                    /* [2026-05-07] 原 × 关闭同时清 needed，导致仍在 TUI 时状态丢失；关闭浮窗只隐藏 UI。 */
            open: false,
                    // needed: false,
                    needed: true,
            updatedAt: Date.now(),
            dismissedAt: Date.now()
          }
        }
      }
    }),
  clearNativeTerminal: (sessionId) =>
    set((s) => {
      const { [sessionId]: _removed, ...rest } = s.bySession
      return { bySession: rest }
    })
}))
