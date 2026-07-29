// [2026-06-17] 统一的「聚焦会话输入框」入口：外嵌模式聚焦 composer，否则聚焦 xterm。
// 两个底层 focus 函数都已是重试式，能扛住停泊布局还原时终端/composer 重挂载的时序问题。
import { useSessionStore } from '../store/sessionStore'
import { focusTerminal } from '../components/terminal/terminalRuntime'
import { focusEmbedInput } from './embedDraftBridge'

export function focusSessionInput(sessionId: string): void {
  const sess = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
  if (sess?.embedMode) focusEmbedInput(sessionId)
  else focusTerminal(sessionId)
}
