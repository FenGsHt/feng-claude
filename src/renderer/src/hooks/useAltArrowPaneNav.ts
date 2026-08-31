import { useEffect } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { findNeighborSessionId, type PaneDirection } from '../lib/terminalPaneNeighbors'
import { focusSessionInput } from '../lib/sessionFocus'
import { collectLeafSessionIds } from '../lib/paneLayout'

// [2026-06-16] 计算分屏组：每组首个 leaf 为主 tab；返回隐藏副窗格集合 + 副→主映射
function computeGroups(): { hidden: Set<string>; primaryOf: Record<string, string> } {
  const { layoutRoot, parkedLayouts } = useSessionStore.getState()
  const hidden = new Set<string>()
  const primaryOf: Record<string, string> = {}
  for (const g of [layoutRoot, ...parkedLayouts]) {
    if (!g) continue
    const leaves = collectLeafSessionIds(g)
    if (leaves.length <= 1) continue
    const head = leaves[0]
    for (const id of leaves) { primaryOf[id] = head; if (id !== head) hidden.add(id) }
  }
  return { hidden, primaryOf }
}

/**
 * Alt + 方向键在多个终端窗格间切换焦点（捕获阶段，优先于 xterm 处理）。
 */
export function useAltArrowPaneNav(enabled: boolean): void {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  useEffect(() => {
    if (!enabled) return

    // [2026-06-16] Alt+E/R：在「窗口」（tab 组）间切换 —— 只在各组主 tab 间循环，
    // 不再钻进分屏副窗格。落到主 tab 后由 setActiveSession 还原该组分屏布局。
    const switchTab = (dir: 'prev' | 'next'): void => {
      const { sessions, activeSessionId: aId } = useSessionStore.getState()
      if (!aId) return
      const { hidden, primaryOf } = computeGroups()
      const tabs = sessions.filter((s) => !hidden.has(s.id))
      if (tabs.length < 2) return
      const curPrimary = primaryOf[aId] ?? aId
      const idx = tabs.findIndex((s) => s.id === curPrimary)
      if (idx < 0) return
      const next = dir === 'prev'
        ? tabs[(idx - 1 + tabs.length) % tabs.length]
        : tabs[(idx + 1) % tabs.length]
      setActiveSession(next.id)
      queueMicrotask(() => focusSessionInput(next.id))
    }

    // [2026-06-16] Alt+F：在「当前窗口内的多个终端」（当前分屏组的窗格）间循环；
    // 非分屏（单格）时返回 false，不拦截（让 Alt+F 等终端 readline 行为照常）
    const cyclePane = (): boolean => {
      const { layoutRoot, activeSessionId: aId } = useSessionStore.getState()
      if (!layoutRoot || !aId) return false
      const leaves = collectLeafSessionIds(layoutRoot)
      if (leaves.length < 2) return false
      const idx = leaves.indexOf(aId)
      const nextId = leaves[((idx < 0 ? 0 : idx) + 1) % leaves.length]
      if (nextId === aId) return false
      setActiveSession(nextId)
      queueMicrotask(() => focusSessionInput(nextId))
      return true
    }

    // [2026-08-29] macOS 的 Option+E/R/F 会产生重音/特殊字符，必须按物理按键 code
    // 识别并阻止默认输入；不能依赖 KeyboardEvent.key。
    // 调试浏览器/DevTools 聚焦时，Alt+E/R 的 keydown 进的是那个 webContents，
    // 渲染窗口收不到；由主进程拦截后通过该 IPC 转发到这里执行切换。
    const offSwitch = window.electronAPI.onBrowserSwitchSession((dir) => switchTab(dir))

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const k = e.code
        // Alt+E/R：窗口（tab 组）间切换
        if (k === 'KeyE' || k === 'KeyR') {
          e.preventDefault()
          e.stopPropagation()
          switchTab(k === 'KeyE' ? 'prev' : 'next')
          return
        }
        // Alt+F：当前窗口内多终端（分屏窗格）间切换
        if (k === 'KeyF') {
          if (cyclePane()) { e.preventDefault(); e.stopPropagation() }
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
      queueMicrotask(() => focusSessionInput(next))
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      offSwitch()
    }
  }, [enabled, activeSessionId, setActiveSession])
}
