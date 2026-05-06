import { useEffect } from 'react'

/** [2026-05-06] 外嵌模式不挂载 xterm，需显式通知主进程 PTY 尺寸，避免 Claude 以 0 列布局 */
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40

export function useEmbedPtyResize(sessionId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    const apply = (): void => {
      const rows = Math.min(
        80,
        Math.max(DEFAULT_ROWS, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) / 22))
      )
      window.electronAPI.resizePty(sessionId, DEFAULT_COLS, rows)
    }

    apply()
    const t = window.setTimeout(apply, 200)
    window.addEventListener('resize', apply)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', apply)
    }
  }, [sessionId, enabled])
}
