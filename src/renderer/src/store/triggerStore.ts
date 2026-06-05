/** [2026-06-05] 触发器：定时/倒计时/重复间隔后，向当前活跃会话发指令或跑某个待办清单。
 *  定义持久化；计时仅应用运行期有效（重启后重新计时，过去的定时不补触发）。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TriggerTiming =
  | { mode: 'countdown'; seconds: number } // 一次性：启动后 N 秒
  | { mode: 'interval'; seconds: number } // 重复：每 N 秒
  | { mode: 'at'; hour: number; minute: number } // 一次性：下一个 hh:mm

export type TriggerAction =
  | { type: 'command'; text: string } // 发送指令/提示词
  | { type: 'todolist'; listId: string } // 运行某清单的未完成项

export interface Trigger {
  id: string
  name: string
  timing: TriggerTiming
  action: TriggerAction
  enabled: boolean
  /** 运行期：下次触发的 epoch ms（未启用时为 undefined） */
  nextFireAt?: number
  lastFiredAt?: number
  createdAt: number
}

interface TriggerStore {
  triggers: Trigger[]
  addTrigger: (t: Omit<Trigger, 'id' | 'createdAt' | 'enabled' | 'nextFireAt' | 'lastFiredAt'>) => void
  deleteTrigger: (id: string) => void
  /** 启用并立即按当前时间计算 nextFireAt；停用则清空 nextFireAt */
  setEnabled: (id: string, enabled: boolean) => void
  /** 触发器已触发：一次性 → 停用；重复 → 重排下次 */
  markFired: (id: string, now: number) => void
  /** 应用启动时重新按当前时间为已启用触发器排程 */
  rearmAll: (now: number) => void
}

function genId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `trig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

/** 根据计时方式与起点，算出下次触发的 epoch ms */
export function computeNextFire(timing: TriggerTiming, fromMs: number): number {
  if (timing.mode === 'countdown' || timing.mode === 'interval') {
    return fromMs + timing.seconds * 1000
  }
  // at: 下一个 hh:mm
  const d = new Date(fromMs)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), timing.hour, timing.minute, 0, 0)
  if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1)
  return next.getTime()
}

export const useTriggerStore = create<TriggerStore>()(
  persist(
    (set) => ({
      triggers: [],

      addTrigger: (t) =>
        set((s) => {
          const now = Date.now()
          return {
            triggers: [
              ...s.triggers,
              { ...t, id: genId(), enabled: true, nextFireAt: computeNextFire(t.timing, now), createdAt: now }
            ]
          }
        }),

      deleteTrigger: (id) => set((s) => ({ triggers: s.triggers.filter((x) => x.id !== id) })),

      setEnabled: (id, enabled) =>
        set((s) => ({
          triggers: s.triggers.map((x) =>
            x.id === id
              ? {
                  ...x,
                  enabled,
                  nextFireAt: enabled ? computeNextFire(x.timing, Date.now()) : undefined
                }
              : x
          )
        })),

      markFired: (id, now) =>
        set((s) => ({
          triggers: s.triggers.map((x) => {
            if (x.id !== id) return x
            if (x.timing.mode === 'interval') {
              return { ...x, lastFiredAt: now, nextFireAt: now + x.timing.seconds * 1000 }
            }
            // 一次性：触发后停用
            return { ...x, lastFiredAt: now, enabled: false, nextFireAt: undefined }
          })
        })),

      rearmAll: (now) =>
        set((s) => ({
          triggers: s.triggers.map((x) =>
            x.enabled ? { ...x, nextFireAt: computeNextFire(x.timing, now) } : x
          )
        }))
    }),
    {
      name: 'trigger-store',
      version: 1,
      // 持久化定义与启用状态；nextFireAt 运行期重算
      partialize: (s) => ({
        triggers: s.triggers.map((t) => ({
          id: t.id,
          name: t.name,
          timing: t.timing,
          action: t.action,
          enabled: t.enabled,
          createdAt: t.createdAt
        }))
      })
    }
  )
)
