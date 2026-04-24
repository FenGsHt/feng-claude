import type { PersistedWorkspace } from '../types/workspace'
import { WORKSPACE_BROWSER_LS_KEY } from '../types/workspace'

function isNoHandlerError(e: unknown): boolean {
  return /no handler registered/i.test(String((e as Error)?.message ?? e))
}

function readBrowserFallback(): unknown {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(WORKSPACE_BROWSER_LS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function writeBrowserFallback(workspace: PersistedWorkspace | null): void {
  if (typeof localStorage === 'undefined') return
  if (workspace) localStorage.setItem(WORKSPACE_BROWSER_LS_KEY, JSON.stringify(workspace))
  else localStorage.removeItem(WORKSPACE_BROWSER_LS_KEY)
}

/** 与 App 启动恢复一致：优先 IPC，主进程缺 handler 时读 localStorage */
export async function loadPersistedWorkspace(): Promise<unknown> {
  try {
    return await window.electronAPI.workspace.load()
  } catch (e) {
    if (isNoHandlerError(e)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[claude-gui] workspace:load 无 IPC 处理（请用 npm run dev 跑全量 Electron，或重启主进程）；已尝试 localStorage'
        )
      }
      return readBrowserFallback()
    }
    throw e
  }
}

/**
 * 防抖 / 卸载时写入；主进程缺 handler 时写 localStorage，避免 Uncaught (in promise)。
 * [2026-04-23] 原先直接 invoke，Electron 仅热更 Renderer、主进程未注册 workspace:save 时会抛错。
 */
export async function savePersistedWorkspace(workspace: PersistedWorkspace | null): Promise<void> {
  try {
    await window.electronAPI.workspace.save(workspace)
  } catch (e) {
    if (isNoHandlerError(e)) {
      writeBrowserFallback(workspace)
      if (import.meta.env.DEV) {
        console.warn(
          '[claude-gui] workspace:save 无 IPC 处理（请 npm run dev 全量启动或重启 Electron）；已写入 localStorage'
        )
      }
      return
    }
    console.error('[claude-gui] workspace save failed', e)
  }
}
