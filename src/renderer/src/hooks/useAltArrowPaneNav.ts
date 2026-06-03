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
      // Ctrl+Shift+E/R：在 sessions 列表中切换上一个/下一个会话（标签页 or 分屏均适用）
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'e' || k === 'r') {
          e.preventDefault()
          e.stopPropagation()
          if (!activeSessionId) return
          const sessions = useSessionStore.getState().sessions
          const idx = sessions.findIndex((s) => s.id === activeSessionId)
          if (idx < 0 || sessions.length < 2) return
          const next = k === 'e'
            ? sessions[(idx - 1 + sessions.length) % sessions.length]
            : sessions[(idx + 1) % sessions.length]
          setActiveSession(next.id)
          queueMicrotask(() => focusTerminal(next.id))
          return
        }
      }

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
