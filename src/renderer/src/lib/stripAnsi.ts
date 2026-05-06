/** [2026-05-06] 将 PTY 原始输出变为可读纯文本（外嵌转录用）；不含 HTML */
export function stripAnsi(input: string): string {
  if (!input) return ''
  let s = input
  // CSI：ESC [ … final byte @–~
  s = s.replace(/\u001b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
  // OSC：ESC ] … BEL 或 ST
  s = s.replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
  // 其它常见 ESC 序列（节选）
  s = s.replace(/\u001b[\][()#%][\x20-\x7e]/g, '')
  s = s.replace(/\u001b[\][()#%]/g, '')
  s = s.replace(/\u001b[@-_]/g, '')
  // 裸 ESC（少数 TUI 残留）
  s = s.replace(/\u001b(?=[^\u005b\u005d])/g, '')
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
