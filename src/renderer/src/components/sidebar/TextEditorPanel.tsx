import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTextEditorStore, type SplitDirection } from '../../store/textEditorStore'

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'jsonc',
  'md', 'mdx', 'txt',
  'yaml', 'yml', 'toml', 'ini', 'cfg',
  'css', 'scss', 'less',
  'html', 'htm', 'xml', 'svg',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'lua', 'kt', 'swift',
  'env', 'gitignore', 'gitattributes', 'editorconfig',
  'lock',
])

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (['makefile', 'dockerfile', 'containerfile', 'readme', 'license', 'changelog',
    '.env', '.gitignore', '.gitattributes', '.editorconfig'].includes(lower)) return true
  const ext = lower.split('.').pop() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

function IconSplitH(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function IconSplitV(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function IconFolder(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5l1 1.5h4.5c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1h-8c-.55 0-1-.45-1-1V3.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
}

/** Content-only panel — layout and split handle are managed by AppShell */
export function TextEditorPanel(): React.ReactElement | null {
  const { visible, filePath, content, isDirty, splitDirection, open, close, setContent, setSplitDirection, markSaved } = useTextEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [showSplitMenu, setShowSplitMenu] = useState(false)
  const splitMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [visible, filePath])

  useEffect(() => { setConfirmingClose(false) }, [filePath, visible])

  // Close split menu when clicking outside
  useEffect(() => {
    if (!showSplitMenu) return
    const handler = (e: MouseEvent): void => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setShowSplitMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSplitMenu])

  const save = useCallback(async () => {
    if (!filePath || !isDirty) return
    const result = await window.electronAPI.writeTextFile(filePath, content)
    if (result.success) markSaved()
  }, [filePath, content, isDirty, markSaved])

  const tryClose = useCallback(() => {
    if (isDirty) { setConfirmingClose(true) } else { close() }
  }, [isDirty, close])

  const forceClose = useCallback(() => { setConfirmingClose(false); close() }, [close])
  const cancelClose = useCallback(() => { setConfirmingClose(false); textareaRef.current?.focus() }, [])

  const openFileDialog = useCallback(async () => {
    setShowSplitMenu(false)
    const path = await window.electronAPI.openTextFileDialog()
    if (!path) return
    // If current file has unsaved changes, ask user first
    if (isDirty) {
      setConfirmingClose(true)
      // Store pending path so confirm-close action opens it instead of just closing
      pendingOpenRef.current = path
      return
    }
    const result = await window.electronAPI.readTextFile(path)
    open(path, result.success && result.content !== undefined ? result.content : '')
  }, [isDirty, open])

  // Holds a file path to open after user confirms discarding unsaved changes
  const pendingOpenRef = useRef<string | null>(null)

  const forceCloseOrOpen = useCallback(async () => {
    setConfirmingClose(false)
    const pending = pendingOpenRef.current
    pendingOpenRef.current = null
    if (pending) {
      const result = await window.electronAPI.readTextFile(pending)
      open(pending, result.success && result.content !== undefined ? result.content : '')
    } else {
      close()
    }
  }, [close, open])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!visible) return
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save(); return }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showSplitMenu) { setShowSplitMenu(false); return }
        if (confirmingClose) { cancelClose() } else { tryClose() }
      }
      if (confirmingClose && e.key === 'Enter') { e.preventDefault(); void forceCloseOrOpen() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, save, tryClose, forceCloseOrOpen, cancelClose, confirmingClose, showSplitMenu])

  if (!visible) return null

  const fileName = filePath?.split(/[/\\]/).pop() ?? ''
  const nextDir: SplitDirection = splitDirection === 'horizontal' ? 'vertical' : 'horizontal'
  const nextDirLabel = nextDir === 'vertical' ? '切换为上下分屏' : '切换为左右分屏'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-claude-bg">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-claude-border bg-claude-surface shrink-0 min-h-[32px]">
        {confirmingClose ? (
          <>
            <span className="text-[11px] text-amber-400 flex-1 truncate">
              {pendingOpenRef.current ? '有未保存的修改，确定放弃并打开新文件？' : '有未保存的修改，确定放弃？'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => void forceCloseOrOpen()}
                className="px-2 py-0.5 rounded text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                title="确认 (Enter)"
              >
                放弃
              </button>
              <button
                onClick={() => { pendingOpenRef.current = null; cancelClose() }}
                className="px-2 py-0.5 rounded text-[11px] bg-claude-border/60 text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                title="取消 (Esc)"
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {isDirty && <span className="text-amber-400 text-[13px] leading-none shrink-0" title="未保存">●</span>}
              <span className="text-[12px] text-claude-text font-mono truncate" title={filePath ?? ''}>
                {fileName}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Split menu button */}
              <div className="relative" ref={splitMenuRef}>
                <button
                  onClick={() => setShowSplitMenu((v) => !v)}
                  className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                  title="分屏选项"
                >
                  {splitDirection === 'horizontal' ? <IconSplitV /> : <IconSplitH />}
                </button>
                {showSplitMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-claude-border bg-claude-surface shadow-xl py-1">
                    <button
                      onClick={() => { setSplitDirection(nextDir); setShowSplitMenu(false) }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-claude-border/50 transition-colors"
                    >
                      <span className="text-claude-muted">{nextDir === 'horizontal' ? <IconSplitH /> : <IconSplitV />}</span>
                      {nextDirLabel}
                    </button>
                    <div className="my-1 border-t border-claude-border/50" />
                    <button
                      onClick={() => void openFileDialog()}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-claude-border/50 transition-colors"
                    >
                      <span className="text-claude-muted"><IconFolder /></span>
                      打开文件…
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={save}
                disabled={!isDirty}
                className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="保存 (Ctrl+S)"
              >
                保存
              </button>
              <button
                onClick={tryClose}
                className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                title="关闭 (Esc)"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none outline-none bg-claude-bg text-claude-text text-[12px] font-mono p-3 overflow-auto"
        style={{ lineHeight: '1.6', tabSize: 2 }}
      />
    </div>
  )
}
