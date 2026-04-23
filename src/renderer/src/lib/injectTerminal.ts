import { focusTerminal } from '../components/terminal/XTerminal'

/** 向 PTY 注入原始文本（不自动回车），并聚焦 xterm */
export function injectTerminalText(sessionId: string, text: string): void {
  window.electronAPI.sendInput(sessionId, text)
  queueMicrotask(() => focusTerminal(sessionId))
}
