import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// ── Icons ──────────────────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────
type PendingAction =
  | { type: 'close' }
  | { type: 'open'; path: string }
  | { type: 'reload' }
  | null

// ── Component ──────────────────────────────────────────────────────────────
/** Content-only panel — layout and split handle are managed by AppShell */
export function TextEditorPanel(): React.ReactElement | null {
  const { visible, filePath, content, isDirty, splitDirection, open, close, setContent, setSplitDirection, markSaved } = useTextEditorStore()

  const textareaRef        = useRef<HTMLTextAreaElement>(null)
  const lineNumRef         = useRef<HTMLDivElement>(null)
  const findInputRef       = useRef<HTMLInputElement>(null)
  const splitMenuRef       = useRef<HTMLDivElement>(null)
  const highlightOverlayRef = useRef<HTMLDivElement>(null)

  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [pendingAction, setPendingAction]         = useState<PendingAction>(null)
  const [showSplitMenu, setShowSplitMenu]         = useState(false)
  const [saveError, setSaveError]                 = useState<string | null>(null)
  const [findOpen, setFindOpen]                   = useState(false)
  const [findQuery, setFindQuery]                 = useState('')
  const [findIndex, setFindIndex]                 = useState(0)
  const [cursorPos, setCursorPos]                 = useState({ line: 1, col: 1 })

  // Reset per-file state
  useEffect(() => {
    setConfirmingDiscard(false)
    setPendingAction(null)
    setSaveError(null)
    setFindOpen(false)
    setFindQuery('')
    setCursorPos({ line: 1, col: 1 })
  }, [filePath, visible])

  // Focus on open
  useEffect(() => {
    if (visible) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [visible, filePath])

  // Close split menu on outside click
  useEffect(() => {
    if (!showSplitMenu) return
    const h = (e: MouseEvent): void => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) setShowSplitMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showSplitMenu])

  // Auto-clear save error after 4 s
  useEffect(() => {
    if (!saveError) return
    const id = setTimeout(() => setSaveError(null), 4000)
    return () => clearTimeout(id)
  }, [saveError])

  // ── Computed ──────────────────────────────────────────────────────────────
  const lines      = useMemo(() => content.split('\n'), [content])
  const totalLines = lines.length

  const fileSize = useMemo(() => {
    const bytes = new TextEncoder().encode(content).length
    if (bytes < 1024)        return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }, [content])

  const findMatches = useMemo(() => {
    if (!findQuery) return []
    const lower = content.toLowerCase()
    const q     = findQuery.toLowerCase()
    const hits: number[] = []
    let idx = 0
    while ((idx = lower.indexOf(q, idx)) !== -1) { hits.push(idx); idx += q.length || 1 }
    return hits
  }, [content, findQuery])

  useEffect(() => { setFindIndex(0) }, [findQuery])

  // Highlight overlay content: split text into runs with <mark> at match positions
  const highlightContent = useMemo((): React.ReactNode => {
    if (!findQuery || !findMatches.length) return null
    const qLen  = findQuery.length
    const parts: React.ReactNode[] = []
    let pos = 0
    findMatches.forEach((start, i) => {
      if (start > pos) parts.push(content.slice(pos, start))
      parts.push(
        <mark
          key={i}
          style={{
            backgroundColor: i === findIndex ? 'rgba(251,191,36,0.45)' : 'rgba(251,191,36,0.2)',
            color: 'transparent',
            borderRadius: '2px',
          }}
        >
          {content.slice(start, start + qLen)}
        </mark>
      )
      pos = start + qLen
    })
    if (pos < content.length) parts.push(content.slice(pos))
    return <>{parts}</>
  }, [content, findMatches, findQuery, findIndex])

  // Line-number column width
  const lineNumWidth = `${Math.max(36, String(totalLines).length * 9 + 16)}px`

  // ── Handlers ──────────────────────────────────────────────────────────────
  const goToMatch = useCallback((i: number) => {
    if (!findMatches.length || !textareaRef.current) return
    const idx   = ((i % findMatches.length) + findMatches.length) % findMatches.length
    const start = findMatches[idx]
    setFindIndex(idx)
    const ta          = textareaRef.current
    const linesBefore = content.slice(0, start).split('\n').length
    const newScrollTop = Math.max(0, (linesBefore - 3) * 19.2)
    ta.scrollTop = newScrollTop
    if (highlightOverlayRef.current) highlightOverlayRef.current.scrollTop = newScrollTop
  }, [findMatches, content])

  const handleScroll = useCallback(() => {
    const top = textareaRef.current?.scrollTop ?? 0
    if (lineNumRef.current)          lineNumRef.current.scrollTop          = top
    if (highlightOverlayRef.current) highlightOverlayRef.current.scrollTop = top
  }, [])

  const updateCursor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const before = content.slice(0, ta.selectionStart).split('\n')
    setCursorPos({ line: before.length, col: before[before.length - 1].length + 1 })
  }, [content])

  const save = useCallback(async () => {
    if (!filePath || !isDirty) return
    setSaveError(null)
    const result = await window.electronAPI.writeTextFile(filePath, content)
    if (result.success) markSaved()
    else setSaveError(result.error ?? '保存失败')
  }, [filePath, content, isDirty, markSaved])

  // Execute a discarded-change action
  const confirmDiscard = useCallback(async () => {
    setConfirmingDiscard(false)
    const action = pendingAction
    setPendingAction(null)
    if (!action || action.type === 'close') { close(); return }
    const path   = action.type === 'open' ? action.path : filePath!
    const result = await window.electronAPI.readTextFile(path)
    open(path, result.success && result.content !== undefined ? result.content : '')
  }, [pendingAction, filePath, close, open])

  const cancelDiscard = useCallback(() => {
    setConfirmingDiscard(false)
    setPendingAction(null)
    textareaRef.current?.focus()
  }, [])

  // Unified "try this action, ask if dirty"
  const tryAction = useCallback((action: NonNullable<PendingAction>) => {
    if (isDirty) {
      setPendingAction(action)
      setConfirmingDiscard(true)
    } else {
      if (action.type === 'close') { close(); return }
      const path = action.type === 'open' ? action.path : filePath!
      void window.electronAPI.readTextFile(path).then(result => {
        open(path, result.success && result.content !== undefined ? result.content : '')
      })
    }
  }, [isDirty, close, filePath, open])

  const openFileDialog = useCallback(async () => {
    setShowSplitMenu(false)
    const path = await window.electronAPI.openTextFileDialog()
    if (path) tryAction({ type: 'open', path })
  }, [tryAction])

  // Tab → insert 2 spaces
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta    = e.currentTarget
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    setContent(content.slice(0, start) + '  ' + content.slice(end))
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
  }, [content, setContent])

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!visible) return
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setFindOpen(true)
        setTimeout(() => findInputRef.current?.select(), 50)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (findOpen)          { setFindOpen(false); textareaRef.current?.focus(); return }
        if (showSplitMenu)     { setShowSplitMenu(false); return }
        if (confirmingDiscard) { cancelDiscard() } else { tryAction({ type: 'close' }) }
        return
      }
      if (findOpen && (e.key === 'Enter' || e.key === 'F3')) {
        e.preventDefault()
        goToMatch(findIndex + (e.shiftKey ? -1 : 1))
        return
      }
      if (confirmingDiscard && e.key === 'Enter') { e.preventDefault(); void confirmDiscard() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, save, findOpen, findIndex, goToMatch, showSplitMenu, confirmingDiscard, cancelDiscard, tryAction, confirmDiscard])

  if (!visible) return null

  const fileName = filePath?.split(/[/\\]/).pop() ?? ''
  const nextDir: SplitDirection = splitDirection === 'horizontal' ? 'vertical' : 'horizontal'

  // Confirm-discard message
  let discardMsg: string
  if (pendingAction?.type === 'reload') {
    discardMsg = `「${fileName}」有未保存修改，确定放弃并重新加载？`
  } else if (pendingAction?.type === 'open') {
    discardMsg = `「${fileName}」未保存，放弃修改并打开「${(pendingAction as { type: 'open'; path: string }).path.split(/[/\\]/).pop()}」？`
  } else {
    discardMsg = `「${fileName}」有未保存的修改，关闭将丢失所有更改。`
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-claude-bg">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-claude-border bg-claude-surface shrink-0 min-h-[32px]">
        {confirmingDiscard ? (
          <>
            <span className="text-[11px] text-amber-400 flex-1 truncate" title={filePath ?? ''}>{discardMsg}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => void confirmDiscard()} className="px-2 py-0.5 rounded text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors" title="确认 (Enter)">放弃</button>
              <button onClick={cancelDiscard} className="px-2 py-0.5 rounded text-[11px] bg-claude-border/60 text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors" title="取消 (Esc)">取消</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {isDirty && <span className="text-amber-400 text-[13px] leading-none shrink-0" title="未保存">●</span>}
              <span className="text-[12px] text-claude-text font-mono truncate" title={filePath ?? ''}>{fileName}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Reload */}
              <button
                onClick={() => tryAction({ type: 'reload' })}
                className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
                title="从磁盘重新加载"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M9.5 5.5A4 4 0 1 1 5.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5.5 1.5l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {/* Split menu */}
              <div className="relative" ref={splitMenuRef}>
                <button onClick={() => setShowSplitMenu(v => !v)} className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors" title="分屏选项">
                  {splitDirection === 'horizontal' ? <IconSplitV /> : <IconSplitH />}
                </button>
                {showSplitMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-claude-border bg-claude-surface shadow-xl py-1">
                    <button onClick={() => { setSplitDirection(nextDir); setShowSplitMenu(false) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-claude-border/50 transition-colors">
                      <span className="text-claude-muted">{nextDir === 'horizontal' ? <IconSplitH /> : <IconSplitV />}</span>
                      {nextDir === 'vertical' ? '切换为上下分屏' : '切换为左右分屏'}
                    </button>
                    <div className="my-1 border-t border-claude-border/50" />
                    <button onClick={() => void openFileDialog()} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] text-claude-text hover:bg-claude-border/50 transition-colors">
                      <span className="text-claude-muted"><IconFolder /></span>
                      打开文件…
                    </button>
                  </div>
                )}
              </div>
              <button onClick={save} disabled={!isDirty} className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="保存 (Ctrl+S)">保存</button>
              <button onClick={() => tryAction({ type: 'close' })} className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors" title="关闭 (Esc)">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Save error bar ── */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border-b border-red-500/20 shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-400 shrink-0">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6 3.5v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span className="text-[11px] text-red-400 flex-1 truncate">保存失败：{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400/60 hover:text-red-400 text-[14px] leading-none shrink-0">×</button>
        </div>
      )}

      {/* ── Find bar ── */}
      {findOpen && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-claude-border bg-claude-surface shrink-0">
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={e => setFindQuery(e.target.value)}
            placeholder="查找…"
            className={`flex-1 bg-claude-bg border rounded px-2 py-0.5 text-[11px] text-claude-text font-mono outline-none focus:border-amber-500/60 transition-colors ${findQuery && !findMatches.length ? 'border-red-500/50' : 'border-claude-border'}`}
          />
          <span className="text-[10px] text-claude-muted shrink-0 w-[44px] text-right tabular-nums">
            {findQuery ? (findMatches.length ? `${findIndex + 1} / ${findMatches.length}` : '无结果') : ''}
          </span>
          <button onClick={() => goToMatch(findIndex - 1)} disabled={!findMatches.length} className="w-5 h-5 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border disabled:opacity-30 transition-colors" title="上一个 (Shift+Enter)">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 5l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={() => goToMatch(findIndex + 1)} disabled={!findMatches.length} className="w-5 h-5 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border disabled:opacity-30 transition-colors" title="下一个 (Enter)">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={() => { setFindOpen(false); textareaRef.current?.focus() }} className="w-5 h-5 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors" title="关闭 (Esc)">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* ── Editor: line numbers + textarea ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Line numbers — overflow hidden but scrollTop synced via JS */}
        <div
          ref={lineNumRef}
          className="shrink-0 bg-claude-surface border-r border-claude-border select-none"
          style={{ width: lineNumWidth, overflowY: 'hidden' }}
        >
          <div style={{ paddingTop: '12px', paddingBottom: '12px' }}>
            {lines.map((_, i) => (
              <div
                key={i}
                className="text-right text-claude-muted font-mono"
                style={{ fontSize: '11px', lineHeight: '1.745', paddingRight: '8px' }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Textarea + highlight overlay wrapper */}
        <div className="relative flex-1 bg-claude-bg overflow-hidden min-w-0">
          {/* Mirror-div overlay: transparent text with <mark> highlights so we avoid
              native selection-range rendering artifacts (wrong position / block spans) */}
          {findOpen && findQuery.length > 0 && findMatches.length > 0 && (
            <div
              ref={highlightOverlayRef}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none select-none font-mono"
              style={{
                fontSize: '12px',
                lineHeight: '1.6',
                padding: '12px',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                overflowY: 'hidden',
                color: 'transparent',
                zIndex: 1,
              }}
            >
              {highlightContent}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleTextareaKeyDown}
            onKeyUp={updateCursor}
            onClick={updateCursor}
            onSelect={updateCursor}
            spellCheck={false}
            className="absolute inset-0 w-full h-full resize-none outline-none text-claude-text font-mono overflow-auto"
            style={{
              fontSize: '12px',
              lineHeight: '1.6',
              tabSize: 2,
              padding: '12px',
              zIndex: 2,
              background: 'transparent',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-4 px-3 border-t border-claude-border bg-claude-surface shrink-0" style={{ height: '22px' }}>
        <span className="text-[10px] font-mono text-claude-muted tabular-nums">行 {cursorPos.line}，列 {cursorPos.col}</span>
        <span className="text-[10px] font-mono text-claude-muted tabular-nums">共 {totalLines} 行</span>
        <span className="text-[10px] font-mono text-claude-muted">{fileSize}</span>
        <span className="flex-1" />
        {isDirty && <span className="text-[10px] font-mono text-amber-400/70">未保存</span>}
      </div>

    </div>
  )
}
