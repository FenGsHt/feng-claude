import type { TelegramBotPreset } from '../types/settings'

/** [2026-05-08] 与主进程 sanitizeTelegramStateId 规则一致，用于 ~/.claude/channels/<id>
 *  [2026-05-09] 统一小写输出，避免 Windows NTFS 因大小写不敏感将不同 ID 映射到同目录 */
export function slugifyPresetNameForStateDir(name: string): string {
  const safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return safe || 'bot'
}

/** [2026-05-08] 由预设名称生成唯一目录 id（同名或同名 slugify 后冲突时加 -2、-3） */
export function uniqueStateDirIdForPreset(
  name: string,
  existing: TelegramBotPreset[],
  excludePresetId?: string
): string {
  const base = slugifyPresetNameForStateDir(name)
  const used = new Set(
    existing
      .filter((p) => (excludePresetId ? p.id !== excludePresetId : true))
      .map((p) => (p.stateDirId ?? '').trim())
      .filter(Boolean)
  )
  /* base 可能因全中文名称 slugify 为空而回退到 "bot"，需同样参与碰撞检测 */
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
