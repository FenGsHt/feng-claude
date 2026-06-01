import { useEffect } from 'react'

/**
 * 弹窗/对话框出现时：① 主窗口置前；② 临时隐藏原生 browser WebContentsView（z-index 对原生层无效）。
 * @param active 可选，默认 true。传入 `open` prop 可在弹窗打开时触发。
 */
export function useFocusWindow(active = true): void {
  useEffect(() => {
    if (!active) return
    window.electronAPI?.focusWindow?.()
    window.electronAPI?.browserView?.setOverlayOpen?.(true)
    return () => {
      window.electronAPI?.browserView?.setOverlayOpen?.(false)
    }
  }, [active])
}
