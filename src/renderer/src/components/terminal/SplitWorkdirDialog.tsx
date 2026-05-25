import React, { useEffect, useRef, useState } from 'react'
import type { CreateSessionMode } from '../../types/paneLayout'
import type { SplitWorkdirItem } from '../../lib/recentWorkdirs'

interface Props {
  open: boolean
  candidates: SplitWorkdirItem[]
  mode: CreateSessionMode
  currentWorkdir?: string
  onPick: (workdir: string) => void
  /** "空控制台"按钮：在指定目录打开纯 Shell，不启动 Claude Code */
  onPickShell: (workdir: string) => void
  onPickOther: () => void
  /** [2026-05-25] 打开文本文件到编辑器 */
  onOpenTextFile: () => void
  onClose: () => void
}

/** 分屏时选择工作目录：列表 +「其他文件夹」 */
export function SplitWorkdirDialog({
  open,
  candidates,
  mode,
  currentWorkdir,
  onPick,
  onPickShell,
  onPickOther,
  onOpenTextFile,
  onClose
}: Props): React.ReactElement | null {
  const [showBrowseMenu, setShowBrowseMenu] = useState(false)
  const browseMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setShowBrowseMenu(false); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showBrowseMenu) return
    const handler = (e: MouseEvent): void => {
      if (browseMenuRef.current && !browseMenuRef.current.contains(e.target as Node)) {
        setShowBrowseMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBrowseMenu])

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
          {/* 空控制台：直接在当前目录新开终端 */}
          {currentWorkdir && (
            <button
              type="button"
              onClick={() => onPickShell(currentWorkdir)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-claude-border/40 border-b border-claude-border/30"
            >
              <span className="text-amber-400/80 text-sm leading-none">▸</span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs text-claude-text font-medium">空控制台（当前目录）</span>
                <span className="truncate font-mono text-[10px] text-claude-muted" title={currentWorkdir}>
                  {currentWorkdir}
                </span>
              </div>
            </button>
          )}
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
          {/* Split button: main = 选择文件夹, arrow = dropdown with both options */}
          <div className="relative flex flex-1" ref={browseMenuRef}>
            <button
              type="button"
              onClick={onPickOther}
              className="flex-1 rounded-l border border-amber-600/50 bg-claude-surface py-2 text-xs font-medium text-claude-text hover:bg-claude-border/30"
            >
              选择其他文件夹…
            </button>
            <button
              type="button"
              onClick={() => setShowBrowseMenu((v) => !v)}
              className="rounded-r border border-l-0 border-amber-600/50 bg-claude-surface px-2 py-2 text-claude-muted hover:bg-claude-border/30 hover:text-claude-text"
              title="更多选项"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showBrowseMenu && (
              <div className="absolute bottom-full left-0 mb-1 w-full rounded-lg border border-claude-border bg-claude-surface shadow-xl py-1 z-10">
                <button
                  type="button"
                  onClick={() => { setShowBrowseMenu(false); onPickOther() }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs text-claude-text hover:bg-claude-border/50 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-amber-400 shrink-0">
                    <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 2h5c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-7C1.67 12 1 11.33 1 10.5V3.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                  </svg>
                  选择文件夹…
                </button>
                <div className="my-1 border-t border-claude-border/50" />
                <button
                  type="button"
                  onClick={() => { setShowBrowseMenu(false); onOpenTextFile() }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs text-claude-text hover:bg-claude-border/50 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-blue-400 shrink-0">
                    <path d="M3 1v11h7V4L7 1H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                    <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                    <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeWidth="1"/>
                    <line x1="4.5" y1="8.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  打开文本文件…
                </button>
              </div>
            )}
          </div>
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
