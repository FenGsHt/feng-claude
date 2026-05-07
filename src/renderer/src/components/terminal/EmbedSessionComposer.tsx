import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEmbedPtyResize } from '../../hooks/useEmbedPtyResize'
import { registerEmbedDraftInjector } from '../../lib/embedDraftBridge'
import { sendRawPtyInput, submitEmbedSessionInput } from './XTerminal'
import { usePtyAlternateScreenStore } from '../../store/ptyAlternateScreenStore'
import {
  filterSlashCommands,
  getSlashCompletionAtStart,
  resolveSlashInsertRange,
  type ClaudeSlashItem
} from '../../lib/claudeCodeSlashCommands'
import { setEmbedSlashPtyEchoActive } from '../../lib/embedPtyTranscriptEcho'
import { useTranscriptStore } from '../../store/transcriptStore'

interface Props {
  sessionId: string
}

/**
 * [2026-05-06] 外嵌 Beta 专用：替代 xterm 的键入，输入经 PTY 送给 Claude Code
 * [2026-05-06] `/` 触发命令面板，与 Claude Code 内置命令文档对齐（静态映射 + MCP 说明）
 * [2026-05-06] Enter 发送；Ctrl/Cmd+Enter 换行；Shift+Enter 默认换行（不发送）
 * [2026-05-06] 命令补全打开时：↑↓ 选择，Tab 填入高亮项；Enter 仍发送全文（原 Enter 只填入导致无法发送）
 */
export function EmbedSessionComposer({ sessionId }: Props): React.ReactElement {
  const alternateScreen = usePtyAlternateScreenStore((s) => s.bySession[sessionId] === true)
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState(0)
  const [selectedSlash, setSelectedSlash] = useState(0)
  const [slashInteractiveMode, setSlashInteractiveMode] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useEmbedPtyResize(sessionId, true)

  /* [2026-05-06] 供 TerminalDropZone 拖入 @路径 / 命令时写入本框，避免仅 sendInput 而界面空白 */
  useEffect(() => {
    return registerEmbedDraftInjector(sessionId, (text) => {
      setDraft((prev) => {
        const el = taRef.current
        const start =
          typeof el?.selectionStart === 'number' ? el.selectionStart : prev.length
        const end = typeof el?.selectionEnd === 'number' ? el.selectionEnd : prev.length
        const next = prev.slice(0, start) + text + prev.slice(end)
        const pos = start + text.length
        requestAnimationFrame(() => {
          const ta = taRef.current
          if (ta) {
            ta.focus()
            ta.setSelectionRange(pos, pos)
          }
          setCursor(pos)
        })
        return next
      })
    })
  }, [sessionId])

  const slashCtx = useMemo(() => getSlashCompletionAtStart(draft, cursor), [draft, cursor])

  const slashList = useMemo(() => {
    if (!slashCtx) return []
    return filterSlashCommands(slashCtx.query)
  }, [slashCtx])

  const slashMenuOpen = Boolean(slashCtx && slashList.length > 0)

  useEffect(() => {
    setSelectedSlash(0)
  }, [slashCtx?.query, slashCtx?.end])

  useEffect(() => {
    setSelectedSlash((s) => (slashList.length === 0 ? 0 : Math.min(s, slashList.length - 1)))
  }, [slashList.length])

  useEffect(() => {
    if (!slashMenuOpen || !listRef.current) return
    const el = listRef.current.children[selectedSlash] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedSlash, slashMenuOpen])

  const syncCursorFromDom = useCallback((): void => {
    const el = taRef.current
    if (!el) return
    setCursor(el.selectionStart ?? 0)
  }, [])

  const applySlashItem = useCallback(
    (item: ClaudeSlashItem): void => {
      const domCur = taRef.current?.selectionStart
      const curPos = typeof domCur === 'number' ? domCur : cursor
      const range = resolveSlashInsertRange(draft, curPos)
      if (!range) return
      const after = draft.slice(range.end)
      const next = item.insert + after
      setDraft(next)
      const pos = range.start + item.insert.length
      requestAnimationFrame(() => {
        const el = taRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(pos, pos)
          setCursor(pos)
        }
      })
    },
    [draft, cursor]
  )

  const send = useCallback((): void => {
    if (alternateScreen) return
    const t = draft
    if (!t.trim()) return
    setDraft('')
    setCursor(0)
    setSlashInteractiveMode(t.trimStart().startsWith('/'))
    submitEmbedSessionInput(sessionId, t)
    requestAnimationFrame(() => taRef.current?.focus())
  }, [alternateScreen, draft, sessionId])

  /** [2026-05-06] Ctrl/Cmd+Enter 在光标处插入换行（Enter 单独用于发送） */
  const insertNewlineAtCursor = useCallback((): void => {
    const el = taRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    setDraft((prev) => {
      const next = prev.slice(0, start) + '\n' + prev.slice(end)
      const pos = start + 1
      requestAnimationFrame(() => {
        const t = taRef.current
        if (t) {
          t.setSelectionRange(pos, pos)
          setCursor(pos)
        }
      })
      return next
    })
  }, [])

  /* [2026-05-06] /mcp 二级菜单中单次 Esc 只退一层；退出前端交互前连发多拍 Esc，尽量与 Claude Code 选单栈对齐 */
  const SLASH_EXIT_ESC_BURST = 6
  const SLASH_EXIT_ESC_GAP_MS = 30

  const exitSlashInteraction = useCallback((): void => {
    /* [2026-05-06] 原单次 Esc；进入子菜单后仍留在 Ink 选单内，与前端已退出不同步 */
    // sendRawPtyInput(sessionId, '\x1b')
    // setSlashInteractiveMode(false)
    let sent = 0
    const pump = (): void => {
      sendRawPtyInput(sessionId, '\x1b')
      sent += 1
      if (sent < SLASH_EXIT_ESC_BURST) {
        window.setTimeout(pump, SLASH_EXIT_ESC_GAP_MS)
      } else {
        useTranscriptStore.getState().clearLatestPtyEchoChunk(sessionId)
        setEmbedSlashPtyEchoActive(sessionId, false)
        setSlashInteractiveMode(false)
        requestAnimationFrame(() => taRef.current?.focus())
      }
    }
    pump()
  }, [sessionId])

  const sendPtyControlKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!slashInteractiveMode || alternateScreen) return false
      const win = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
      const sendRaw = (v: string): void => sendRawPtyInput(sessionId, v)

      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        sendRaw('\x03')
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        sendRaw('\x1b[A')
        return true
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        sendRaw('\x1b[B')
        return true
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        sendRaw('\x1b[D')
        return true
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        sendRaw('\x1b[C')
        return true
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        sendRaw(win ? '\r' : '\n')
        return true
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        sendRaw('\t')
        return true
      }
      if (e.key === 'Escape') {
        /* [2026-05-06] 原 Esc 直发 PTY；按反馈改为优先退出交互态，避免用户被锁在直控模式 */
        // e.preventDefault()
        // sendRaw('\x1b')
        /* [2026-05-06] 上版只退前端状态会与 Claude Code 真实 TUI 不同步；改为统一退出函数。 */
        // setSlashInteractiveMode(false)
        // requestAnimationFrame(() => taRef.current?.focus())
        e.preventDefault()
        exitSlashInteraction()
        return true
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        sendRaw('\x7f')
        return true
      }
      if (e.key.length === 1 && !e.metaKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault()
        sendRaw(e.key)
        return true
      }
      return false
    },
    [alternateScreen, exitSlashInteraction, sessionId, slashInteractiveMode]
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (sendPtyControlKey(e)) return
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSlash((i) => (i + 1) % slashList.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSlash((i) => (i - 1 + slashList.length) % slashList.length)
        return
      }
      /* [2026-05-06] 原 Enter 只 applySlashItem，用户补全已展开时无法发送；改为 Tab 填入 */
      if (e.key === 'Tab') {
        e.preventDefault()
        const item = slashList[selectedSlash]
        if (item) applySlashItem(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const ctx = getSlashCompletionAtStart(draft, cursor)
        if (ctx) {
          const after = draft.slice(ctx.end)
          setDraft(after)
          const pos = 0
          requestAnimationFrame(() => {
            const el = taRef.current
            if (el) {
              el.setSelectionRange(pos, pos)
              setCursor(pos)
            }
          })
        }
        return
      }
    }

    /* [2026-05-06] 原：Ctrl/Cmd+Enter 发送；改为 Enter 发送、Ctrl/Cmd+Enter 换行（与常见 IM 一致） */
    // if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    //   e.preventDefault()
    //   send()
    // }

    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        /* [2026-05-06] 原 Ctrl/Cmd+Enter 永远是换行；斜杠交互态下改为退出直控，避免无法回到普通输入 */
        // e.preventDefault()
        // insertNewlineAtCursor()
        if (slashInteractiveMode) {
          e.preventDefault()
          exitSlashInteraction()
          return
        }
        e.preventDefault()
        insertNewlineAtCursor()
        return
      }
      if (e.shiftKey) {
        return
      }
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-gradient-to-t from-black/40 to-[#0c0c0c] px-3 py-3">
      <div className="mx-auto flex max-w-3xl min-h-0 items-end gap-2.5">
        <div className="relative min-h-0 flex-1">
          {slashMenuOpen ? (
            <ul
              id="slash-command-list"
              ref={listRef}
              role="listbox"
              className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1d] py-1 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]"
            >
              {slashList.map((item, idx) => (
                <li key={`${item.matchKey}-${item.insert}-${idx}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === selectedSlash}
                    className={`flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-[11px] transition-colors ${
                      idx === selectedSlash
                        ? 'bg-amber-500/20 text-claude-text'
                        : 'text-claude-text/90 hover:bg-white/[0.06]'
                    }`}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      applySlashItem(item)
                    }}
                    onMouseEnter={() => setSelectedSlash(idx)}
                  >
                    <span className="font-mono text-amber-400/95">{item.insert.trimEnd()}</span>
                    <span className="text-[10px] leading-snug text-claude-muted">{item.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            ref={taRef}
            value={draft}
            disabled={alternateScreen}
            readOnly={slashInteractiveMode}
            onChange={(e) => {
              setDraft(e.target.value)
              setCursor(e.target.selectionStart ?? 0)
            }}
            onSelect={syncCursorFromDom}
            onClick={syncCursorFromDom}
            onKeyUp={syncCursorFromDom}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={
              alternateScreen
                ? '全屏终端界面进行中，输入已暂停…'
                : slashInteractiveMode
                  ? '斜杠命令交互中：↑↓ Enter Tab 与字符键已直通 PTY；Esc / Ctrl+Enter 退出交互'
                  : '输入消息… Enter 发送 · Tab 填入命令 · Ctrl+Enter 换行 · / 打开命令'
            }
            className={`min-h-[80px] w-full resize-y rounded-xl border border-white/[0.08] bg-[#161618] px-3 py-2.5 text-[12px] leading-relaxed text-claude-text shadow-inner shadow-black/40 placeholder:text-claude-muted/55 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 ${
              alternateScreen ? 'cursor-not-allowed opacity-45' : ''
            }`}
            spellCheck={false}
            aria-expanded={slashMenuOpen}
            aria-controls={slashMenuOpen ? 'slash-command-list' : undefined}
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={alternateScreen || slashInteractiveMode}
          className="shrink-0 rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/25 to-amber-600/15 px-4 py-2.5 text-[11px] font-semibold text-amber-100 shadow-md shadow-amber-950/30 transition hover:from-amber-500/35 hover:to-amber-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送
        </button>
        {slashInteractiveMode ? (
          <button
            type="button"
            onClick={() => {
              exitSlashInteraction()
            }}
            className="shrink-0 rounded-xl border border-emerald-500/35 bg-emerald-900/20 px-3 py-2.5 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-900/30"
          >
            退出交互
          </button>
        ) : null}
      </div>
      {alternateScreen ? (
        <div className="mx-auto mt-2 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2.5">
          <p className="text-[10px] leading-relaxed text-amber-100/90">
            已检测到终端备用缓冲区（全屏 TUI，如 Ink 的{' '}
            <kbd className="rounded border border-amber-400/30 bg-black/30 px-1 py-px font-mono text-[9px]">
              /help
            </kbd>
            ）。外嵌按行输入与此类界面不兼容，已自动暂停；请用顶栏切换到「经典终端」逐键操作，或点击下方向 PTY 发送常用退出键。退出备用缓冲区后此处会自动恢复。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="发送 Ctrl+C 到 PTY"
              className="rounded-md border border-amber-400/25 bg-black/20 px-2 py-1 text-[9px] font-medium text-amber-50/95 transition hover:bg-black/35"
              onClick={() => sendRawPtyInput(sessionId, '\x03')}
            >
              Ctrl+C
            </button>
            <button
              type="button"
              title="发送 Esc 到 PTY"
              className="rounded-md border border-amber-400/25 bg-black/20 px-2 py-1 text-[9px] font-medium text-amber-50/95 transition hover:bg-black/35"
              onClick={() => sendRawPtyInput(sessionId, '\x1b')}
            >
              Esc
            </button>
            <button
              type="button"
              title="发送 q 并换行"
              className="rounded-md border border-amber-400/25 bg-black/20 px-2 py-1 text-[9px] font-medium text-amber-50/95 transition hover:bg-black/35"
              onClick={() => {
                const nl =
                  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? '\r' : '\n'
                sendRawPtyInput(sessionId, `q${nl}`)
              }}
            >
              q ↵
            </button>
          </div>
        </div>
      ) : (
        <p className="mx-auto mt-2 max-w-3xl text-[9px] leading-relaxed text-claude-muted/70">
          若程序进入全屏 TUI 的备用缓冲区，下方按行输入会自动暂停直至程序发出退出信号。也可随时用顶栏切到经典终端。
        </p>
      )}
      <p className="mx-auto mt-2 max-w-3xl text-center text-[9px] leading-relaxed text-claude-muted/75">
        <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px]">Enter</kbd>{' '}
        发送 · <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1 py-0.5 font-mono">Ctrl+Enter</kbd>{' '}
        换行 · <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px]">/</kbd>{' '}
        命令面板 · <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1 py-0.5 font-mono">↑↓</kbd>{' '}
        <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1 py-0.5 font-mono">Tab</kbd>{' '}
        填入 · 发送斜杠命令后按键直通 PTY（Esc / Ctrl+Enter 退出）· 文件拖入上方可插入 @ 路径
      </p>
    </div>
  )
}
