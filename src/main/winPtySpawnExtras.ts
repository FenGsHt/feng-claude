/**
 * [2026-05-12] Windows：node-pty 默认在 build ≥18309 时用 ConPTY，会 fork conpty_console_list_agent 并对 shellPid
 * AttachConsole；Electron 主进程 / ELECTRON_RUN_AS_NODE 守护进程等无控制台宿主上常见 `AttachConsole failed`。
 * 默认改用 winpty（显式 useConpty: false）。若需 ConPTY（新版 Windows 终端特性），启动前设置环境变量 FENG_USE_CONPTY=1。
 */
export function getWindowsPtySpawnExtras(): { useConpty: boolean } | Record<string, never> {
  if (process.platform !== 'win32') return {}
  return { useConpty: process.env.FENG_USE_CONPTY === '1' }
}
