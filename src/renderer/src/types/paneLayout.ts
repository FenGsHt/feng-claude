/** 终端区分屏布局（二叉树）；每个叶子绑定一个 PTY sessionId */

export type PaneNode =
  | { type: 'leaf'; sessionId: string }
  | {
      type: 'split'
      dir: 'horizontal' | 'vertical'
      first: PaneNode
      second: PaneNode
    }

export type CreateSessionMode = 'fullscreen' | 'split-right' | 'split-down'
