import React, { useCallback, useEffect, useRef } from 'react'
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

// Split direction toggle icons
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

/** Content-only panel — layout and split handle are managed by AppShell */
export function TextEditorPanel(): React.ReactElement | null {
  const { visible, filePath, content, isDirty, splitDirection, close, setContent, setSplitDirection, markSaved } = useTextEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (visible) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [visible, filePath])

  const save = useCallback(async () => {
    if (!filePath || !isDirty) return
    const result = await window.electronAPI.writeTextFile(filePath, content)
    if (result.success) markSaved()
  }, [filePath, content, isDirty, markSaved])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!visible) return
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save() }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, save, close])

  if (!visible) return null

  const fileName = filePath?.split(/[/\\]/).pop() ?? ''
  const nextDir: SplitDirection = splitDirection === 'horizontal' ? 'vertical' : 'horizontal'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-claude-bg">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-claude-border bg-claude-surface shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {isDirty && <span className="text-amber-400 text-[13px] leading-none shrink-0" title="未保存">●</span>}
          <span className="text-[12px] text-claude-text font-mono truncate" title={filePath ?? ''}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Split direction toggle */}
          <button
            onClick={() => setSplitDirection(nextDir)}
            className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
            title={nextDir === 'vertical' ? '切换为上下分屏' : '切换为左右分屏'}
          >
            {splitDirection === 'horizontal' ? <IconSplitV /> : <IconSplitH />}
          </button>
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
