import type { ITerminalOptions, ITheme } from 'xterm'
import type { ThemeMode } from '../types/settings'

export type ResolvedThemeId = Exclude<ThemeMode, 'auto'>

export interface ThemeDefinition {
  id: ResolvedThemeId
  label: {
    zh: string
    en: string
  }
  dataTheme: ResolvedThemeId
  terminal: ITheme
  /** 覆盖 xterm 默认字体/行高等选项；未指定时继承全局默认值 */
  terminalOptions?: Pick<
    ITerminalOptions,
    'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'cursorBlink' | 'cursorStyle' | 'cursorWidth'
  >
}

export const DARK_TERMINAL_THEME: ITheme = {
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

export const LIGHT_TERMINAL_THEME: ITheme = {
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

export const FALLOUT_TERMINAL_THEME: ITheme = {
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

export const CLAUDE_CODE_TERMINAL_THEME: ITheme = {
  background: '#fafaf8',
  foreground: '#333330',
  cursor: '#d97757',
  cursorAccent: '#fafaf8',
  selectionBackground: 'rgba(217, 119, 87, 0.18)',
  black: '#333330',
  brightBlack: '#7c7a76',
  red: '#c0443a',
  brightRed: '#d8665d',
  green: '#3d8048',
  brightGreen: '#5a9d65',
  yellow: '#b87820',
  brightYellow: '#d49630',
  blue: '#3d6da8',
  brightBlue: '#5a8cc2',
  magenta: '#7c4890',
  brightMagenta: '#9d68b0',
  cyan: '#2d8080',
  brightCyan: '#4a9e9e',
  white: '#555550',
  brightWhite: '#42413d'
}

export const themeDefinitions: Record<ResolvedThemeId, ThemeDefinition> = {
  dark: {
    id: 'dark',
    label: { zh: '暗色', en: 'Dark' },
    dataTheme: 'dark',
    terminal: DARK_TERMINAL_THEME
  },
  light: {
    id: 'light',
    label: { zh: '亮色', en: 'Light' },
    dataTheme: 'light',
    terminal: LIGHT_TERMINAL_THEME
  },
  fallout: {
    id: 'fallout',
    label: { zh: 'Fallout', en: 'Fallout' },
    dataTheme: 'fallout',
    terminal: FALLOUT_TERMINAL_THEME,
    // [2026-05-06] Fallout 专属：复古点阵字体 VT323，稍大字号强化磷光屏感
    // [2026-05-08] 原 block 填满单元格；改为粗竖条 bar + cursorWidth，更接近老式终端 “|” 光标
    // [2026-05-09] Fallout：加粗竖条光标（与 fallout-port .fo-ai-stream-caret 对齐）
    terminalOptions: {
      fontFamily: '”VT323”, “Courier New”, Courier, monospace',
      fontSize: 16,
      lineHeight: 1.25,
      letterSpacing: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 16
    }
  },
  'claude-code': {
    id: 'claude-code',
    label: { zh: 'Claude Code', en: 'Claude Code' },
    dataTheme: 'claude-code',
    terminal: CLAUDE_CODE_TERMINAL_THEME
  }
}

export const selectableThemes: Array<{
  id: ThemeMode
  label: ThemeDefinition['label']
}> = [
  { id: 'dark', label: themeDefinitions.dark.label },
  { id: 'light', label: themeDefinitions.light.label },
  { id: 'auto', label: { zh: '自动', en: 'Auto' } },
  { id: 'fallout', label: themeDefinitions.fallout.label },
  { id: 'claude-code', label: themeDefinitions['claude-code'].label }
]

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'auto' || value === 'fallout' || value === 'claude-code'
}

export function resolveThemeMode(
  theme: ThemeMode,
  prefersDark: boolean
): ResolvedThemeId {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light'
  return theme
}

export function getThemeDefinition(theme: ResolvedThemeId): ThemeDefinition {
  return themeDefinitions[theme]
}
