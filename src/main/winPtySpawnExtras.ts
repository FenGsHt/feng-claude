/**
 * [2026-05-13] Windows：ConPTY 是 Windows 10 1809+ 原生终端 API，进程生命周期管理
 * 比 winpty 准确，不存在 winpty 的 STILL_ACTIVE(259) 假阳性退出码问题。
 * Electron 主进程下 AttachConsole 偶有失败但不影响正常终端会话。
 * 若遇到 ConPTY 兼容问题，启动前设置环境变量 FENG_USE_WINPTY=1 回退到 winpty。
 */
export function getWindowsPtySpawnExtras(): { useConpty: boolean } | Record<string, never> {
  if (process.platform !== 'win32') return {}
  return { useConpty: process.env.FENG_USE_WINPTY !== '1' }
}
