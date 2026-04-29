import { useEffect, useRef } from 'react'
import { useThemeStore } from '../store/themeStore'

/** ANSI 终端配色：暗色模式 */
const DARK_THEME = {
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

/** ANSI 终端配色：明亮模式 */
const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  cursor: '#d97706',
  cursorAccent: '#ffffff',
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
  white: '#9ca3af',
  brightWhite: '#e5e7eb'
}

/** 终端主题回调注册表 */
const terminalThemeCallbacks = new Set<(theme: typeof DARK_THEME) => void>()

/** [2026-05-01] 注册终端主题回调（供 XTerminal 调用） */
export function onTerminalThemeChange(callback: (theme: typeof DARK_THEME) => void): () => void {
  terminalThemeCallbacks.add(callback)
  return () => terminalThemeCallbacks.delete(callback)
}

/** 广播终端主题变更 */
function broadcastTerminalTheme(resolved: 'dark' | 'light'): void {
  const theme = resolved === 'dark' ? DARK_THEME : LIGHT_THEME
  for (const cb of terminalThemeCallbacks) {
    cb(theme)
  }
}

/**
 * 应用主题模式到 document.documentElement，并同步更新终端配色。
 * - 'dark' → data-theme="dark"
 * - 'light' → data-theme="light"
 * - 'auto' → 跟随系统 prefers-color-scheme，动态切换
 */
export function useTheme(): void {
  const theme = useThemeStore((s) => s.theme)
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (resolved: 'dark' | 'light') => {
      root.setAttribute('data-theme', resolved)
      broadcastTerminalTheme(resolved)
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
