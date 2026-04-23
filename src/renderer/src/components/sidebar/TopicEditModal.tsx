import React, { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  initialValue: string
  onSave: (value: string) => void
  onClear: () => void
  onClose: () => void
}

/** 历史条目右键 — 编辑自定义主题（留空清除） */
export function TopicEditModal({
  open,
  initialValue,
  onSave,
  onClear,
  onClose
}: Props): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-claude-border bg-claude-bg p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-claude-text">编辑主题</h2>
        <p className="mt-1 text-[11px] text-claude-muted">
          留空并保存可清除自定义主题（仍显示自动记录的最后一问）。
        </p>
        <input
          ref={inputRef}
          key={initialValue}
          type="text"
          defaultValue={initialValue}
          placeholder="自定义标题…"
          className="mt-3 w-full rounded border border-claude-border bg-claude-surface px-3 py-2 text-sm text-claude-text placeholder:text-claude-muted focus:border-amber-600/50 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSave((e.target as HTMLInputElement).value)
            }
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const v = inputRef.current?.value ?? ''
              onSave(v)
            }}
            className="flex-1 rounded bg-amber-600 py-2 text-xs font-medium text-white hover:bg-amber-500"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-claude-border px-3 py-2 text-xs text-claude-muted hover:text-claude-text"
          >
            清除主题
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-claude-border px-3 py-2 text-xs text-claude-muted hover:text-claude-text"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
