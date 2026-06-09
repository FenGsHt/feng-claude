import { SettingsStore } from './settingsStore'

/**
 * [2026-05-12] Windows：node-pty 默认在 build ≥18309 时用 ConPTY，会 fork conpty_console_list_agent 并对 shellPid
 * AttachConsole；Electron 主进程 / ELECTRON_RUN_AS_NODE 守护进程等无控制台宿主上常见 `AttachConsole failed`。
 * [2026-06-04] 可通过设置 terminal.useConpty 控制；对 lazygit/vim 等 TUI 应用显示更好。
 * [2026-06-09] 默认改为开启 ConPTY（用户未显式设置时），TUI 显示体验更佳；如遇 AttachConsole 异常可在设置中关闭。
 */
export function getWindowsPtySpawnExtras(): { useConpty: boolean } | Record<string, never> {
  if (process.platform !== 'win32') return {}
  const settingsUseConpty = new SettingsStore().get().terminal?.useConpty
  // 未显式设置时默认开启；FENG_USE_CONPTY=0 可强制关闭
  const useConpty = settingsUseConpty ?? (process.env.FENG_USE_CONPTY !== '0')
  return { useConpty }
}
