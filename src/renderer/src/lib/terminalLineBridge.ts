/**
 * 打破 sessionStore ↔ XTerminal 循环依赖：终端模块只调用本桥，由 AppShell 挂载时注入处理函数。
 */

type LineHandler = (sessionId: string, line: string) => void

let lineHandler: LineHandler | null = null

export function setTerminalLineHandler(handler: LineHandler | null): void {
  lineHandler = handler
}

/** 用户在终端提交完整一行（以 \\r / \\n 结束）时调用 */
export function emitTerminalCommittedLine(sessionId: string, line: string): void {
  lineHandler?.(sessionId, line)
}
