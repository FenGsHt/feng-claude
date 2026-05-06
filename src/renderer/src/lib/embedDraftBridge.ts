/** [2026-05-06] 外嵌 Beta：TerminalDropZone 需把拖入内容写入 EmbedSessionComposer，而非仅 sendInput 到 PTY */

type InjectFn = (text: string) => void

const injectors = new Map<string, InjectFn>()

/** 由 EmbedSessionComposer 挂载时注册；卸载时清理 */
export function registerEmbedDraftInjector(sessionId: string, inject: InjectFn): () => void {
  injectors.set(sessionId, inject)
  return () => {
    if (injectors.get(sessionId) === inject) injectors.delete(sessionId)
  }
}

/** 若当前会话有外嵌输入框，则插入文本并返回 true（不再向 PTY 直接 sendInput） */
export function injectEmbedDraft(sessionId: string, text: string): boolean {
  const fn = injectors.get(sessionId)
  if (!fn) return false
  fn(text)
  return true
}
