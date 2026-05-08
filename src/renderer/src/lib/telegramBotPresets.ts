import type { TelegramBotPreset, TelegramChannelSessionConfig } from '../types/settings'

/** [2026-05-08] 根据会话 Telegram 配置匹配预设 id，供下拉框与标签药丸展示名称 */
export function matchSessionToPresetId(
  sess: TelegramChannelSessionConfig | undefined,
  presets: TelegramBotPreset[]
): string {
  if (!sess?.enabled || presets.length === 0) return ''
  const sid = (sess.stateDirId ?? '').trim()
  const tok = (sess.botToken ?? '').trim()
  for (const p of presets) {
    if ((p.stateDirId ?? '').trim() !== sid) continue
    if ((p.botToken ?? '').trim() === tok) return p.id
  }
  /* [2026-05-08] State Dir 与设置里不完全一致时仍可能指向同一 Bot：Token 全局唯一则回落到该预设，标签显示名称而非截断 Token */
  if (tok) {
    const sameTok = presets.filter((p) => (p.botToken ?? '').trim() === tok)
    if (sameTok.length === 1) return sameTok[0].id
  }
  return ''
}

/** [2026-05-08] 预设应用到会话（启用 Telegram + Token / State Dir） */
export function presetToSessionConfig(p: TelegramBotPreset): TelegramChannelSessionConfig {
  return {
    enabled: true,
    botToken: (p.botToken ?? '').trim() || undefined,
    stateDirId: (p.stateDirId ?? '').trim() || undefined
  }
}
