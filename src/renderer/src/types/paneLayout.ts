/** 终端区分屏布局（二叉树）；每个叶子绑定一个 PTY sessionId */

export type PaneNode =
  | { type: 'leaf'; sessionId: string }
  | {
      type: 'split'
      dir: 'horizontal' | 'vertical'
      first: PaneNode
      second: PaneNode
      /** [2026-06-16] 两侧拖动后的百分比 [左/上, 右/下]；缺省 50/50。用于切换窗口后还原比例 */
      sizes?: [number, number]
    }

export type CreateSessionMode = 'fullscreen' | 'split-right' | 'split-down' | 'split-worktree'
