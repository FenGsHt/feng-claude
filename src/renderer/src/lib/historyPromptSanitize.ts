/**
 * 清理可能被 xterm 当作用户输入回传的终端能力响应。
 *
 * 与普通 ANSI 输出清理不同，这里还要处理丢失 ESC 字节后的 CSI：
 *   [<35;54;12M  鼠标报告
 *   [?1;2c       设备属性响应
 *   [?2048;0$y   DEC 模式查询响应
 */
export function sanitizeHistoryPrompt(raw: string | undefined): string | undefined {
  if (!raw) return undefined

  let s = raw

  // OSC / DCS / SOS / PM / APC 字符串（必须先于单字节 ESC 清理）。
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  s = s.replace(/\x1b[P^_X][\s\S]*?(?:\x1b\\|\x9c)/g, '')

  // 完整 CSI，以及终端把 ESC 可视化成 " ^[ " 后形成的 CSI。
  s = s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  s = s.replace(/\^\[\[[0-?]*[ -/]*[@-~]/g, '')

  // ESC 已被上游吃掉的 CSI。参数至少出现一个，避免误删普通的 "[text]"。
  s = s.replace(/\[[0-?]+[ -/]*[@-~](?!\])/g, '')

  // 方向键等不带参数的孤立 CSI，以及其它常见短 ESC 序列。
  s = s.replace(/\[(?:A|B|C|D|H|J|K|S|T|f|m|n|s|u)(?!\])/g, '')
  s = s.replace(/\x1b[()][AB012]/g, '')
  s = s.replace(/\x1b[\[\](){}#%;><=~^_\\]/g, '')

  // 不保留 C0/C1 控制字符；换行由调用方按单条历史标题处理。
  s = s
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
    .replace(/\r/g, '')
    .trim()

  if (!s) return undefined

  // 不完整 CSI 可能只剩一个 "[" 或其它分隔符；它们同样没有标题信息。
  if (/^[\[\](){}<>^;?=~$\\%]+$/.test(s)) return undefined

  // 内嵌 shell 就绪握手不是用户命令，不应成为历史标题。
  if (/^printf\s+['"][^'"]*feng-shell-ready/i.test(s)) return undefined

  return s
}
