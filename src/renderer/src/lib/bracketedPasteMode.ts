/**
 * [2026-05-12] 追踪各会话 Claude Code 是否已开启 Bracketed Paste 模式。
 * 独立文件避免 usePty ↔ XTerminal 循环引用。
 */
const bySession = new Map<string, boolean>()

export function setBracketedPasteMode(sessionId: string, active: boolean): void {
  bySession.set(sessionId, active)
}

export function isBracketedPasteModeActive(sessionId: string): boolean {
  return bySession.get(sessionId) === true
}
