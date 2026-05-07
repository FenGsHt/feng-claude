import { useEffect, useRef, useMemo } from 'react'
import { useThemeStore } from '../store/themeStore'
import {
  DARK_TERMINAL_THEME,
  FALLOUT_TERMINAL_THEME,
  LIGHT_TERMINAL_THEME,
  getThemeDefinition,
  resolveThemeMode,
  type ResolvedThemeId
} from '../theme/themeRegistry'

/** ANSI 终端配色：暗色模式 */
/* [2026-05-07] 原 ANSI palette 定义在 hook 内，新增主题需同时改多处；迁入 themeRegistry 统一维护。 */
// export const DARK_THEME = { ... }
export const DARK_THEME = DARK_TERMINAL_THEME

/** [2026-05-06] ANSI 终端：indeed Fallout 磷光绿（与 fallout-port.css 一致） */
/* [2026-05-07] 原 Fallout ANSI palette 定义在 hook 内；迁入 registry 后保留导出兼容旧引用。 */
// export const FALLOUT_THEME = { ... }
export const FALLOUT_THEME = FALLOUT_TERMINAL_THEME

/** ANSI 终端配色：明亮模式 */
/* [2026-05-07] 原 light ANSI palette 定义在 hook 内；迁入 registry 后保留导出兼容旧引用。 */
// export const LIGHT_THEME = { ... }
export const LIGHT_THEME = LIGHT_TERMINAL_THEME

/**
 * Resolve the effective theme mode considering 'auto' preference.
 * Returns 'dark' or 'light' — never 'auto'.
 * Also hydrates the theme store on first mount.
 */
export function useResolvedTheme(): ResolvedThemeId {
  const theme = useThemeStore((s) => s.theme)
  const hydrate = useThemeStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useMemo(() => {
    /* [2026-05-07] 原手写 dark/light/fallout/auto 判断；改为 registry resolver，新增主题只扩注册表。 */
    // if (theme === 'fallout') return 'fallout'
    // if (theme === 'dark') return 'dark'
    // if (theme === 'light') return 'light'
    // return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return resolveThemeMode(theme, window.matchMedia('(prefers-color-scheme: dark)').matches)
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

    const applyTheme = (resolved: ResolvedThemeId) => {
      root.setAttribute('data-theme', getThemeDefinition(resolved).dataTheme)
    }

    if (theme !== 'auto') {
      /* [2026-05-07] 原每个主题写一个 if；registry resolver 支持后续扩展主题。 */
      // if (theme === 'fallout') applyTheme('fallout')
      // if (theme === 'dark') applyTheme('dark')
      // if (theme === 'light') applyTheme('light')
      applyTheme(resolveThemeMode(theme, false))
    } else {
      // auto: 跟随系统
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent | MediaQueryList) => {
        applyTheme(resolveThemeMode('auto', e.matches))
      }
      handler(mq)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])
}
