import React, { useCallback, useEffect, useRef } from 'react'
import { useTextEditorStore } from '../../store/textEditorStore'

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
  'Makefile', 'Dockerfile', 'Containerfile',
  'lock',
])

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  // No extension but known filenames
  if (['makefile', 'dockerfile', 'containerfile', 'readme', 'license', 'changelog',
    '.env', '.gitignore', '.gitattributes', '.editorconfig'].includes(lower)) return true
  const ext = lower.split('.').pop() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

export function TextEditorPanel(): React.ReactElement | null {
  const { visible, filePath, content, isDirty, width, close, setContent, setWidth, markSaved } = useTextEditorStore()
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when opened
  useEffect(() => {
    if (visible) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [visible, filePath])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = width
    const onMove = (ev: MouseEvent): void => {
      if (!isResizing.current) return
      const next = Math.max(300, Math.min(1200, resizeStartWidth.current + resizeStartX.current - ev.clientX))
      setWidth(next)
    }
    const onUp = (): void => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, setWidth])

  const save = useCallback(async () => {
    if (!filePath || !isDirty) return
    const result = await window.electronAPI.writeTextFile(filePath, content)
    if (result.success) markSaved()
  }, [filePath, content, isDirty, markSaved])

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!visible) return
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, save, close])

  if (!visible) return null

  const fileName = filePath?.split(/[/\\]/).pop() ?? ''

  return (
    <>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 transition-colors"
        style={{
          position: 'fixed',
          top: 32,
          bottom: 0,
          right: width,
          width: 6,
          zIndex: 50,
        }}
      />
      {/* Panel */}
      <div
        className="flex flex-col border-l border-claude-border bg-claude-surface overflow-hidden"
        style={{
          position: 'fixed',
          top: 32,
          bottom: 0,
          right: 0,
          width,
          zIndex: 40,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-claude-border bg-claude-bg shrink-0">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isDirty && (
              <span className="text-amber-400 text-[14px] leading-none shrink-0" title="未保存">●</span>
            )}
            <span className="text-[12px] text-claude-text font-mono truncate" title={filePath ?? ''}>
              {fileName}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={save}
              disabled={!isDirty}
              className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="保存 (Ctrl+S)"
            >
              保存
            </button>
            <button
              onClick={close}
              className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
              title="关闭 (Esc)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Editor body */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none outline-none bg-claude-bg text-claude-text text-[12px] font-mono p-3 overflow-auto"
          style={{ lineHeight: '1.6', tabSize: 2 }}
        />
      </div>
    </>
  )
}
