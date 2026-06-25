import type { TelegramChannelSessionConfig } from './settings'

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
  /** [2026-04-28] 每个 sessionWorkdir 对应的 profileId（可选，缺失则用全局 active） */
  profileIds?: string[]
  /** [2026-05-06] 每个 slot 是否为纯 Shell 会话（不启动 Claude Code） */
  shellOnlySlots?: boolean[]
  /** [2026-05-08] 每个 slot 的官方 Telegram Channel 配置 */
  telegramChannelSlots?: Array<TelegramChannelSessionConfig | undefined>
  /** [2026-05-11] 每个 slot 的外嵌模式（终端 vs 外嵌 UI） */
  embedModeSlots?: boolean[]
  layoutRoot: PersistedPaneNode | null
  /** [2026-06-25] 停泊的分屏组（切到别的 tab 时当前分屏组会被停泊）。不持久化会导致重启后分屏组
   *  的会话变回扁平独立 tab。仅含 split 树（单格 leaf 无需停泊）。 */
  parkedLayouts?: PersistedPaneNode[]
  /** 上次激活的会话在 sessionWorkdirs 中的下标 */
  activeSlotIndex: number
}
