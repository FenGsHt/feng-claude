/** [2026-05-06] 外嵌 Beta：TerminalDropZone 需把拖入内容写入 EmbedSessionComposer，而非仅 sendInput 到 PTY */

type InjectFn = (text: string) => void
type FocusFn = () => void

const injectors = new Map<string, InjectFn>()
const focusers = new Map<string, FocusFn>()

/** 由 EmbedSessionComposer 挂载时注册；卸载时清理 */
export function registerEmbedDraftInjector(sessionId: string, inject: InjectFn): () => void {
  injectors.set(sessionId, inject)
  return () => {
    if (injectors.get(sessionId) === inject) injectors.delete(sessionId)
  }
}

/** [2026-06-02] 由 EmbedSessionComposer 注册输入框 focus 回调 */
export function registerEmbedFocus(sessionId: string, focus: FocusFn): () => void {
  focusers.set(sessionId, focus)
  return () => {
    if (focusers.get(sessionId) === focus) focusers.delete(sessionId)
  }
}

/** 若当前会话有外嵌输入框，则插入文本并返回 true（不再向 PTY 直接 sendInput） */
export function injectEmbedDraft(sessionId: string, text: string): boolean {
  const fn = injectors.get(sessionId)
  if (!fn) return false
  fn(text)
  return true
}

/**
 * [2026-06-02] 聚焦外嵌输入框
 * [2026-06-17] 改为重试式：Alt+E/R 还原停泊布局会重挂载 composer，focuser 回调要等
 * useEffect 重新注册后才存在；单次调用常在注册前跑了而失效。跨 rAF 重试直到 focuser 就绪。
 */
export function focusEmbedInput(sessionId: string): void {
  let attempts = 0
  const run = (): void => {
    attempts++
    // [2026-06-17] 主窗口没焦点（焦点在调试浏览器/别处）时不抢，终止重试，避免抢走焦点
    if (!document.hasFocus()) return
    const fn = focusers.get(sessionId)
    if (fn) {
      fn()
      return
    }
    if (attempts >= 10) return
    requestAnimationFrame(run)
  }
  run()
}
