import React from 'react'
import { useI18n } from '../../i18n'
import type { WhatsNewCopy } from '../../lib/whatsNewCatalog'
import { useFocusWindow } from '../../hooks/useFocusWindow'

interface Props {
  open: boolean
  version: string
  copy: WhatsNewCopy
  onDismiss: () => void
}

/** [2026-05-08] 新版本安装后首次启动展示；内容由 whatsNewCatalog 提供 */
export function WhatsNewDialog({ open, version, copy, onDismiss }: Props): React.ReactElement | null {
  const { lang } = useI18n()
  useFocusWindow(open)
  if (!open) return null

  const title = lang === 'zh' ? copy.titleZh : copy.titleEn
  const bullets = lang === 'zh' ? copy.bulletsZh : copy.bulletsEn

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-claude-border bg-claude-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-claude-text">{title}</h2>
            <p className="mt-1 text-[10px] text-claude-muted">v{version}</p>
          </div>
          <button type="button" onClick={onDismiss} className="text-claude-muted hover:text-claude-text" aria-label="Close">
            ✕
          </button>
        </div>
        <ul className="mb-4 list-disc space-y-2 pl-4 text-[11px] leading-relaxed text-claude-text/90">
          {bullets.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-900/50"
          >
            {lang === 'zh' ? '知道了' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  )
}
