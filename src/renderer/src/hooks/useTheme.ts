import { useEffect, useRef, useMemo } from 'react'
import { useThemeStore } from '../store/themeStore'

/** ANSI 终端配色：暗色模式 */
export const DARK_THEME = {
  background: '#141414',
  foreground: '#e8e8e8',
  cursor: '#f59e0b',
  cursorAccent: '#141414',
  selectionBackground: '#f59e0b30',
  black: '#141414',
  brightBlack: '#525252',
  red: '#f87171',
  brightRed: '#fca5a5',
  green: '#4ade80',
  brightGreen: '#86efac',
  yellow: '#fbbf24',
  brightYellow: '#fcd34d',
  blue: '#60a5fa',
  brightBlue: '#93c5fd',
  magenta: '#c084fc',
  brightMagenta: '#d8b4fe',
  cyan: '#22d3ee',
  brightCyan: '#67e8f9',
  white: '#d4d4d4',
  brightWhite: '#ffffff'
}

/** [2026-05-06] ANSI 终端：indeed Fallout 磷光绿（与 fallout-port.css 一致） */
export const FALLOUT_THEME = {
  background: '#020502',
  foreground: '#2aff4d',
  cursor: '#aaff44',
  cursorAccent: '#020502',
  selectionBackground: 'rgba(42, 255, 77, 0.28)',
  black: '#041004',
  brightBlack: '#1baa30',
  red: '#f87171',
  brightRed: '#fca5a5',
  green: '#2aff4d',
  brightGreen: '#aaff44',
  yellow: '#88ee22',
  brightYellow: '#c8ff66',
  blue: '#38f099',
  brightBlue: '#7dffcf',
  magenta: '#2aff4d',
  brightMagenta: '#c8ff9a',
  cyan: '#39ffc7',
  brightCyan: '#9dffec',
  white: '#c8ffc8',
  brightWhite: '#e8ffe8'
}

/** ANSI 终端配色：明亮模式 */
export const LIGHT_THEME = {
  background: '#f0f0f0',
  foreground: '#1a1a1a',
  cursor: '#d97706',
  cursorAccent: '#f0f0f0',
  selectionBackground: '#d9770630',
  black: '#374151',
  brightBlack: '#6b7280',
  red: '#dc2626',
  brightRed: '#f87171',
  green: '#16a34a',
  brightGreen: '#4ade80',
  yellow: '#ca8a04',
  brightYellow: '#eab308',
  blue: '#2563eb',
  brightBlue: '#60a5fa',
  magenta: '#9333ea',
  brightMagenta: '#c084fc',
  cyan: '#0891b2',
  brightCyan: '#22d3ee',
  white: '#555555',
  brightWhite: '#888888'
}

/**
 * Resolve the effective theme mode considering 'auto' preference.
 * Returns 'dark' or 'light' — never 'auto'.
 * Also hydrates the theme store on first mount.
 */
export function useResolvedTheme(): 'dark' | 'light' | 'fallout' {
  const theme = useThemeStore((s) => s.theme)
  const hydrate = useThemeStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useMemo(() => {
    if (theme === 'fallout') return 'fallout'
    if (theme === 'dark') return 'dark'
    if (theme === 'light') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }, [theme])
}

/**
 * 应用主题模式到 document.documentElement。
 * - 'dark' → data-theme="dark"
 * - 'light' → data-theme="light"
 * - 'auto' → 跟随系统 prefers-color-scheme，动态切换
 */
export function useTheme(): void {
  const theme = useThemeStore((s) => s.theme)
  const hydrate = useThemeStore((s) => s.hydrate)
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    void hydrate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (resolved: 'dark' | 'light' | 'fallout') => {
      root.setAttribute('data-theme', resolved)
    }

    if (theme === 'fallout') {
      applyTheme('fallout')
      return
    }
    if (theme === 'dark') {
      applyTheme('dark')
    } else if (theme === 'light') {
      applyTheme('light')
    } else {
      // auto: 跟随系统
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent | MediaQueryList) => {
        applyTheme(e.matches ? 'dark' : 'light')
      }
      handler(mq)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])
}
