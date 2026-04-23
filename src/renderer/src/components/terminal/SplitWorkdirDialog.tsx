import React, { useEffect } from 'react'
import type { CreateSessionMode } from '../../types/paneLayout'
import type { SplitWorkdirItem } from '../../lib/recentWorkdirs'

interface Props {
  open: boolean
  candidates: SplitWorkdirItem[]
  mode: CreateSessionMode
  onPick: (workdir: string) => void
  onPickOther: () => void
  onClose: () => void
}

/** 分屏时选择工作目录：列表 +「其他文件夹」 */
export function SplitWorkdirDialog({
  open,
  candidates,
  mode,
  onPick,
  onPickOther,
  onClose
}: Props): React.ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const title = mode === 'split-right' ? '分屏：在右侧新建会话' : '分屏：在下方新建会话'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-wd-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[min(420px,70vh)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-claude-border bg-claude-bg shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-claude-border px-4 py-3">
          <h2 id="split-wd-title" className="text-sm font-medium text-claude-text">
            {title}
          </h2>
          <p className="mt-1 text-[11px] text-claude-muted">选择曾打开过的目录，或浏览其他文件夹</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {candidates.map(({ workdir: wd, subtitle }) => (
            <button
              key={wd}
              type="button"
              onClick={() => onPick(wd)}
              className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-claude-border/40"
            >
              <span className="w-full truncate text-xs text-claude-text">
                {subtitle ?? wd.split(/[/\\]/).filter(Boolean).pop() ?? wd}
              </span>
              <span className="w-full truncate font-mono text-[10px] text-claude-muted" title={wd}>
                {wd}
              </span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2 border-t border-claude-border px-4 py-3">
          <button
            type="button"
            onClick={onPickOther}
            className="flex-1 rounded border border-amber-600/50 bg-claude-surface py-2 text-xs font-medium text-claude-text hover:bg-claude-border/30"
          >
            选择其他文件夹…
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-claude-border px-4 py-2 text-xs text-claude-muted hover:text-claude-text"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
