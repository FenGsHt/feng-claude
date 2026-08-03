import { create } from 'zustand'
import type { AgentEventPayload } from '../types/ipc'

interface State {
  activeBySession: Record<string, boolean>
  applyEvent: (event: AgentEventPayload) => void
}

/** [2026-08-02] 外嵌消息网关的运行状态；不要再用常驻 PTY 的 running 状态推断回复是否完成。 */
export const useAgentRunStore = create<State>((set) => ({
  activeBySession: {},
  applyEvent: (event) =>
    set((state) => {
      let active = false
      switch (event.type) {
        case 'queued':
        case 'running':
        case 'assistant_delta':
        case 'tool':
          active = true
          break
        case 'completed':
        case 'error':
          active = (event.queued ?? 0) > 0
          break
        case 'cancelled':
          active = false
          break
      }
      if (active) {
        return {
          activeBySession: { ...state.activeBySession, [event.sessionId]: true }
        }
      }
      const { [event.sessionId]: _removed, ...rest } = state.activeBySession
      return { activeBySession: rest }
    })
}))
