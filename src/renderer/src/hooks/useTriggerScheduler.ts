/** [2026-06-05] 全局触发器调度：每秒检查到期触发器，向当前活跃会话发指令或跑待办清单。
 *  在 App 根挂载一次（与 usePty 同级），保证面板未打开也能触发。 */
import { useEffect } from 'react'
import { useTriggerStore } from '../store/triggerStore'
import { fireTriggerAction } from '../lib/runTrigger'

export function useTriggerScheduler(): void {
  useEffect(() => {
    // 启动时按当前时间重新排程（重启后计时重置，不补触发过去的定时）
    useTriggerStore.getState().rearmAll(Date.now())

    const tick = (): void => {
      const now = Date.now()
      const { triggers, markFired } = useTriggerStore.getState()
      for (const trig of triggers) {
        if (!trig.enabled || !trig.nextFireAt || now < trig.nextFireAt) continue
        fireTriggerAction(trig) // 无活跃会话/清单已删时内部提示并返回 false
        markFired(trig.id, now) // 一次性停用 / 重复重排
      }
    }

    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
}
