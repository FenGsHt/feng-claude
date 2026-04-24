/** 持久化到磁盘的 workspace 快照（与会话 UUID 无关，用 slot 指向 sessionWorkdirs 下标） */

export const WORKSPACE_VERSION = 1 as const

/** 主进程未注册 workspace IPC 或仅浏览器预览时，快照写入 localStorage 的键 */
export const WORKSPACE_BROWSER_LS_KEY = 'claude-gui-workspace-v1'

/** 与 PaneNode 同构，叶子为 slot 索引 */
export type PersistedPaneNode =
  | { type: 'leaf'; slot: number }
  | {
      type: 'split'
      dir: 'horizontal' | 'vertical'
      first: PersistedPaneNode
      second: PersistedPaneNode
    }

export interface PersistedWorkspace {
  version: typeof WORKSPACE_VERSION
  /** 与顶部 Tab 顺序一致；每个 slot 对应一个工作目录 */
  sessionWorkdirs: string[]
  layoutRoot: PersistedPaneNode | null
  /** 上次激活的会话在 sessionWorkdirs 中的下标 */
  activeSlotIndex: number
}
