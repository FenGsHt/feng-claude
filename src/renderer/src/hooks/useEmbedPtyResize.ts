import { useEffect, useRef } from 'react'

/** [2026-05-06] 外嵌模式不挂载 xterm，需显式通知主进程 PTY 尺寸，避免 Claude 以 0 列布局 */
const MIN_COLS = 40
const MIN_ROWS = 10
const MAX_ROWS = 80
const ROW_HEIGHT_PX = 22

/** 测量容器内单字符宽度（用于从像素宽度推算列数） */
function measureCharWidth(el: HTMLElement): number {
  const span = document.createElement('span')
  span.style.font = window.getComputedStyle(el).font
  span.style.position = 'absolute'
  span.style.visibility = 'hidden'
  span.textContent = 'X'.repeat(20)
  document.body.appendChild(span)
  const w = span.offsetWidth / 20
  document.body.removeChild(span)
  return w > 0 ? w : 7.2
}

export function useEmbedPtyResize(
  sessionId: string,
  enabled: boolean,
  containerRef?: React.RefObject<HTMLElement | null>
): void {
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const lastGeomRef = useRef<{ cols: number; rows: number } | null>(null)

  const apply = (): void => {
    const container = containerRef?.current
    if (!container) {
      /* 无容器 ref 时回退到窗口宽度估算 */
      const cols = Math.max(MIN_COLS, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) / 10))
      const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) / ROW_HEIGHT_PX)))
      if (lastGeomRef.current?.cols === cols && lastGeomRef.current?.rows === rows) return
      lastGeomRef.current = { cols, rows }
      window.electronAPI.resizePty(sessionId, cols, rows)
      return
    }

    const charW = measureCharWidth(container)
    const cols = Math.max(MIN_COLS, Math.floor(container.clientWidth / charW))
    const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.floor(container.clientHeight / ROW_HEIGHT_PX)))
    if (lastGeomRef.current?.cols === cols && lastGeomRef.current?.rows === rows) return
    lastGeomRef.current = { cols, rows }
    window.electronAPI.resizePty(sessionId, cols, rows)
  }

  useEffect(() => {
    if (!enabled) return

    apply()
    const t = window.setTimeout(apply, 200)

    /* [2026-05-13] 监听容器尺寸变化（分屏 / panel resize），debounce 220ms 与 XTerminal 保持一致 */
    if (containerRef?.current) {
      observerRef.current = new ResizeObserver(() => {
        if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = setTimeout(apply, 220)
      })
      observerRef.current.observe(containerRef.current)
    }

    window.addEventListener('resize', apply)
    return () => {
      clearTimeout(t)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      observerRef.current?.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [sessionId, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
