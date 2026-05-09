/** [2026-05-08] 灰框：一句操作说明 + 路径；配对码由用户贴在全文末尾 */
export function buildTelegramMultiBotPairPrompt(lang: 'zh' | 'en', stateDirId: string): string {
  const id = (stateDirId ?? '').trim() || 'telegram'
  if (lang === 'zh') {
    return `在 Telegram 向 Bot 发消息取得六位码。复制本框全部内容，在末尾紧接六位码（勿加引号），一并发给 Claude 完成配对；勿在终端执行 /telegram:access。

本 Bot 状态目录：
Windows：%USERPROFILE%\\.claude\\channels\\${id}
macOS/Linux：$HOME/.claude/channels/${id}`
  }
  return `Get the 6-character code from your bot in Telegram. Copy everything in this box, append the code right at the end (no quotes), and send it all to Claude to finish pairing. Do not run /telegram:access in the terminal.

State dir for this bot:
Windows: %USERPROFILE%\\.claude\\channels\\${id}
macOS/Linux: $HOME/.claude/channels/${id}`
}
