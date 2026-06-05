/** [2026-06-05] 全局触发器调度：每秒检查到期触发器，向当前活跃会话发指令或跑待办清单。
 *  在 App 根挂载一次（与 usePty 同级），保证面板未打开也能触发。 */
import { useEffect } from 'react'
import { useTriggerStore } from '../store/triggerStore'
import { useSessionStore } from '../store/sessionStore'
import { submitEmbedSessionInput } from '../components/terminal/XTerminal'
import { runTodoList } from '../lib/runTodos'
import { useTodoListStore } from '../store/todoListStore'

export function useTriggerScheduler(): void {
  useEffect(() => {
    // 启动时按当前时间重新排程（重启后计时重置，不补触发过去的定时）
    useTriggerStore.getState().rearmAll(Date.now())

    const tick = (): void => {
      const now = Date.now()
      const { triggers, markFired } = useTriggerStore.getState()
      for (const trig of triggers) {
        if (!trig.enabled || !trig.nextFireAt || now < trig.nextFireAt) continue

        const sessionId = useSessionStore.getState().activeSessionId
        const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
        if (!sessionId || !session) {
          // 无活跃会话：提示并照常推进排程（一次性停用 / 重复重排）
          try {
            window.electronAPI.showNotification('触发器未执行', `「${trig.name}」无活跃会话，已跳过`)
          } catch {
            /* ignore */
          }
          markFired(trig.id, now)
          continue
        }

        if (trig.action.type === 'command') {
          const text = trig.action.text.trim()
          if (text) submitEmbedSessionInput(sessionId, text)
        } else {
          const exists = useTodoListStore.getState().lists.some((l) => l.id === trig.action.listId)
          if (exists) {
            void runTodoList(sessionId, trig.action.listId)
          } else {
            try {
              window.electronAPI.showNotification('触发器未执行', `「${trig.name}」对应的清单已不存在`)
            } catch {
              /* ignore */
            }
          }
        }
        markFired(trig.id, now)
      }
    }

    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
}
