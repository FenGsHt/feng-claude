import React, { useMemo } from 'react'
import { useI18n } from '../../i18n'
import { navigateToSettingsTab } from '../sidebar/Sidebar'
import { buildTelegramMultiBotPairPrompt } from '../../lib/telegramPairPrompt'

/** [2026-05-08] 仅展示 Bun / 插件 / 配对说明；Bot Token 须在设置页配置 */
interface Props {
  open: boolean
  onClose: () => void
  /** [2026-05-09] 当前标签会话解析出的 stateDirId；有值时 buildTelegramMultiBotPairPrompt 预填路径（无 <STATE_DIR>） */
  resolvedStateDirId?: string | null
}

export function TelegramSetupGuideDialog({
  open,
  onClose,
  resolvedStateDirId
}: Props): React.ReactElement | null {
  const { t, lang } = useI18n()

  const pairBody = useMemo(() => {
    const id = resolvedStateDirId?.trim()
    if (id) return buildTelegramMultiBotPairPrompt(lang, id)
    return lang === 'zh' ? t.settings.telegramMultiBotPairPromptZh : t.settings.telegramMultiBotPairPromptEn
  }, [resolvedStateDirId, lang, t.settings])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-claude-border bg-claude-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-claude-text">Telegram Channel</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-claude-muted">
              {lang === 'zh'
                ? '请在「设置 → Telegram Channel」填写 Bot Token；此处仅为 Bun / 插件 / 配对步骤说明。'
                : 'Enter your bot token under Settings → Telegram Channel. This dialog only covers Bun, plugin install, and pairing.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-claude-muted hover:text-claude-text">
            ✕
          </button>
        </div>

        <div className="rounded-lg border border-amber-600/45 bg-gradient-to-b from-amber-950/35 to-claude-bg/80 px-3 py-3 text-[10px] leading-relaxed shadow-inner">
          <div className="mb-3 border-b border-amber-600/25 pb-2 text-[11px] font-semibold tracking-wide text-amber-100">
            {t.settings.telegramDialogSetupTitle}
          </div>

          <section className="mb-3 space-y-2">
            <h3 className="text-[11px] font-semibold text-claude-text">{t.settings.telegramStepBunTitle}</h3>
            <p className="text-[9px] text-claude-muted">{t.settings.telegramStepBunDoc}</p>
            <p className="text-[9px] font-medium text-claude-text/90">{t.settings.telegramStepBunWinLabel}</p>
            <pre className="mt-0 mb-0 overflow-x-auto rounded-md border border-claude-border/80 bg-black/40 px-2.5 py-2 font-mono text-[10px] leading-snug text-amber-100/95 select-all">
              {t.settings.telegramStepBunWinCmd}
            </pre>
            <p className="text-[9px] leading-snug text-claude-muted">{t.settings.telegramStepBunFengNote}</p>
          </section>

          <section className="mb-3 space-y-2 border-t border-claude-border/50 pt-3">
            <h3 className="text-[11px] font-semibold text-claude-text">{t.settings.telegramStepPluginTitle}</h3>
            <pre className="mt-0 mb-0 overflow-x-auto rounded-md border border-claude-border/80 bg-black/40 px-2.5 py-2 font-mono text-[10px] leading-snug text-amber-100/95 select-all">
              {t.settings.telegramStepPluginCmd}
            </pre>
          </section>

          {/* [2026-05-10] 原 ③ /telegram:access + ④ 合并：首绑与多 Bot 均用同一段复制给 Claude */}
          {/* [2026-05-08] 配对：不再单独展示灰字 intro，说明合并进下方可复制块 */}
          <section className="space-y-2 border-t border-claude-border/50 pt-3">
            <h3 className="text-[11px] font-semibold leading-snug text-claude-text">{t.settings.telegramStepPairUnifiedTitle}</h3>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-claude-border/80 bg-black/40 px-2.5 py-2 font-mono text-[9px] leading-snug text-amber-100/95 select-all">
              {pairBody}
            </pre>
          </section>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              navigateToSettingsTab()
              onClose()
            }}
            className="rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-900/50"
          >
            {lang === 'zh' ? '打开设置（配置 Token）' : 'Open Settings (tokens)'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-claude-border px-3 py-1.5 text-[11px] text-claude-muted hover:text-claude-text"
          >
            {lang === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
