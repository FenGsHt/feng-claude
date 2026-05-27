import { useEffect } from 'react'

/**
 * 弹窗/对话框出现时将主窗口移至最前，避免被 detach DevTools 等浮窗遮挡。
 * @param active 可选，默认 true。传入 `open` prop 可在弹窗打开时触发。
 */
export function useFocusWindow(active = true): void {
  useEffect(() => {
    if (active) window.electronAPI?.focusWindow?.()
  }, [active])
}
