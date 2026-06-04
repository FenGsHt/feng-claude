import { SettingsStore } from './settingsStore'

/**
 * [2026-05-12] Windows：node-pty 默认在 build ≥18309 时用 ConPTY，会 fork conpty_console_list_agent 并对 shellPid
 * AttachConsole；Electron 主进程 / ELECTRON_RUN_AS_NODE 守护进程等无控制台宿主上常见 `AttachConsole failed`。
 * 默认改用 winpty（显式 useConpty: false）。
 * [2026-06-04] 可通过设置 terminal.useConpty=true 启用 ConPTY，对 lazygit/vim 等 TUI 应用显示更好。
 */
export function getWindowsPtySpawnExtras(): { useConpty: boolean } | Record<string, never> {
  if (process.platform !== 'win32') return {}
  const settingsUseConpty = new SettingsStore().get().terminal?.useConpty
  const useConpty = settingsUseConpty ?? (process.env.FENG_USE_CONPTY === '1')
  return { useConpty }
}
