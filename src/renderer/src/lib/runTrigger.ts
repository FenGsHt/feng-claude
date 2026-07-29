/** [2026-06-05] 执行一个触发器的动作（发指令 / 跑清单）到当前活跃会话。
 *  供定时调度器与面板「立即运行」按钮共用；不改动触发器的排程状态。 */
import { useSessionStore } from '../store/sessionStore'
import { useTodoListStore } from '../store/todoListStore'
import { submitEmbedSessionInput } from '../components/terminal/terminalRuntime'
import { runTodoList } from './runTodos'
import type { Trigger } from '../store/triggerStore'

/** 返回 false 表示未执行（无活跃会话 / 清单已删） */
export function fireTriggerAction(trig: Trigger): boolean {
  const sessionId = useSessionStore.getState().activeSessionId
  const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
  if (!sessionId || !session) {
    try {
      window.electronAPI.showNotification('触发器未执行', `「${trig.name}」无活跃会话，已跳过`)
    } catch {
      /* ignore */
    }
    return false
  }

  if (trig.action.type === 'command') {
    const text = trig.action.text.trim()
    if (text) submitEmbedSessionInput(sessionId, text)
    return true
  }

  const exists = useTodoListStore.getState().lists.some((l) => l.id === trig.action.listId)
  if (!exists) {
    try {
      window.electronAPI.showNotification('触发器未执行', `「${trig.name}」对应的清单已不存在`)
    } catch {
      /* ignore */
    }
    return false
  }
  void runTodoList(sessionId, trig.action.listId)
  return true
}
