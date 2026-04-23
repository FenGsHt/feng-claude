import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { findNeighborSessionId, type PaneDirection } from '../lib/terminalPaneNeighbors'
import { focusTerminal } from '../components/terminal/XTerminal'

/**
 * Alt + 方向键在多个终端窗格间切换焦点（捕获阶段，优先于 xterm 处理）。
 */
export function useAltArrowPaneNav(enabled: boolean): void {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return

      let dir: PaneDirection | null = null
      switch (e.key) {
        case 'ArrowLeft':
          dir = 'left'
          break
        case 'ArrowRight':
          dir = 'right'
          break
        case 'ArrowUp':
          dir = 'up'
          break
        case 'ArrowDown':
          dir = 'down'
          break
        default:
          return
      }

      // Shift+Alt+Arrow 常留给系统；此处仅处理纯 Alt
      if (e.shiftKey) return

      if (!activeSessionId) return

      const next = findNeighborSessionId(activeSessionId, dir)
      if (!next || next === activeSessionId) return

      e.preventDefault()
      e.stopPropagation()

      setActiveSession(next)
      queueMicrotask(() => focusTerminal(next))
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, activeSessionId, setActiveSession])
}
