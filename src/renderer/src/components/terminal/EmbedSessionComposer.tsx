import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEmbedPtyResize } from '../../hooks/useEmbedPtyResize'
import { registerEmbedDraftInjector } from '../../lib/embedDraftBridge'
import { sendPtyInterruptSignal, sendRawPtyInput, submitEmbedSessionInput } from './XTerminal'
import { usePtyAlternateScreenStore } from '../../store/ptyAlternateScreenStore'
import { useSessionStore } from '../../store/sessionStore'
import {
  filterSlashCommands,
  getSlashCompletionAtStart,
  resolveSlashInsertRange,
  type ClaudeSlashItem
} from '../../lib/claudeCodeSlashCommands'
import {
  filterAtCommands,
  flattenTreeToAtItems,
  getAtCompletionAt,
  type FileAtItem
} from '../../lib/claudeCodeAtCommands'
import { setEmbedSlashPtyEchoActive, subscribeSlashDone } from '../../lib/embedPtyTranscriptEcho'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useNativeTerminalRequestStore } from '../../store/nativeTerminalRequestStore'
import { useEmbedInputHistoryStore } from '../../store/embedInputHistoryStore'
import { useEmbedAwaitingReplyStore } from '../../store/embedAwaitingReplyStore'

interface Props {
  sessionId: string
  nativeTerminalOverlayVisible?: boolean
}

const atItemsCache = new Map<string, FileAtItem[]>()

/**
 * [2026-05-06] 外嵌 Beta 专用：替代 xterm 的键入，输入经 PTY 送给 Claude Code
 * [2026-05-06] `/` 触发命令面板，与 Claude Code 内置命令文档对齐（静态映射 + MCP 说明）
 * [2026-05-06] Enter 发送；Ctrl/Cmd+Enter 换行；Shift+Enter 默认换行（不发送）
 * [2026-05-06] 命令补全打开时：↑↓ 选择，Tab 填入高亮项；Enter 仍发送全文（原 Enter 只填入导致无法发送）
 */
export function EmbedSessionComposer({
  sessionId,
  nativeTerminalOverlayVisible = false
}: Props): React.ReactElement {
  const alternateScreen = usePtyAlternateScreenStore((s) => s.bySession[sessionId] === true)
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState(0)
  const [selectedSlash, setSelectedSlash] = useState(0)
  const [selectedAt, setSelectedAt] = useState(0)
  const [slashInteractiveMode, setSlashInteractiveMode] = useState(false)
  const [atItems, setAtItems] = useState<FileAtItem[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const atListRef = useRef<HTMLUListElement>(null)
  const historyCursorRef = useRef<number | null>(null)
  const draftBeforeHistoryRef = useRef('')
  /** [2026-05-08] 记录最近一次外嵌发送的普通（非 /）正文；PTY 收到 Ctrl+C 后填回输入框（含经典终端按键） */
  const lastPlainEmbedSentRef = useRef<string>('')
  /** [2026-05-08] 防止 Enter 双击 / 合成键重复触发同一帧两次 submit，导致乐观气泡重复 */
  const embedSendBusyRef = useRef(false)
  /** [2026-05-08] 与 draft state 同步；onChange 即写入，避免仅靠闭包/React 批处理滞后 */
  const draftMirrorRef = useRef('')
  const inputHistory = useEmbedInputHistoryStore((s) => s.bySession[sessionId] ?? [])
  const pushInputHistory = useEmbedInputHistoryStore((s) => s.pushHistory)
  const workdir = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId)?.workdir ?? '')
  /* [2026-05-08] interruptSuppress 只用于收起底部「处理中」条；若绑在按钮上，中断一次后 suppress 恒真直至 idle，按钮会长期不出现，也无法二次中断 */
  const sessionStatus = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId)?.status)
  const pendingReply = useEmbedAwaitingReplyStore((s) => s.pendingBySession[sessionId] === true)
  const showInterrupt =
    !alternateScreen &&
    !slashInteractiveMode &&
    (sessionStatus === 'running' ||
      sessionStatus === 'waiting_input' ||
      pendingReply)
  /* [2026-05-07] 原强制退出复用 dismiss，会留下 needed 状态；强制退出应清理整条终端请求。 */
  // const dismissNativeTerminal = useNativeTerminalRequestStore((s) => s.dismissNativeTerminal)
  const clearNativeTerminal = useNativeTerminalRequestStore((s) => s.clearNativeTerminal)
  /* [2026-05-07] slash TUI 由内嵌 xterm 负责 fit/resize；Composer 固定 resize 会让 /skills 搜索框布局错乱。 */
  // useEmbedPtyResize(sessionId, true)
  useEmbedPtyResize(sessionId, !slashInteractiveMode && !nativeTerminalOverlayVisible)

  useEffect(() => {
    lastPlainEmbedSentRef.current = ''
    draftMirrorRef.current = ''
  }, [sessionId])

  /* [2026-05-08] 主进程在任意 sendInput 含 Ctrl+C 时广播；与经典终端 xterm 打断同源，恢复上次普通提问草稿 */
  useEffect(() => {
    const off = window.electronAPI.onPtyIntrSent((payload) => {
      if (payload.sessionId !== sessionId) return
      const saved = lastPlainEmbedSentRef.current.trim()
      if (!saved) return
      /* [2026-05-08] 终端 xterm 仍显示旧行「在吗」但外嵌已输入「在吗123」时：live 已与快照不同，禁止用快照 setDraft，否则会冲掉 draftMirrorRef(onChange 同步的)，发送读到「在吗」 */
      const live = (taRef.current?.value ?? '').trim()
      if (live.length > 0 && live !== saved.trim()) return
      /* [2026-05-08] 仅当末尾乐观气泡与本次可恢复正文一致时才弹出，避免 /skills 等路径发 Ctrl+C 误删上一条用户消息 */
      const entries = useTranscriptStore.getState().bySession[sessionId] ?? []
      const last = entries[entries.length - 1]
      if (
        last?.kind === 'user' &&
        last.clientEcho === true &&
        last.text.trim() === saved
      ) {
        useTranscriptStore.getState().popLastOptimisticUserEcho(sessionId)
      }
      draftMirrorRef.current = saved
      setDraft(saved)
      setCursor(saved.length)
      requestAnimationFrame(() => {
        const ta = taRef.current
        if (!ta) return
        ta.focus()
        ta.setSelectionRange(saved.length, saved.length)
      })
    })
    return off
  }, [sessionId])

  /* PTY 侧检测到斜杠命令自然结束（TUI 消失 / idle 超时）→ 自动退出交互态 */
  useEffect(() => {
    return subscribeSlashDone(sessionId, () => {
      setSlashInteractiveMode(false)
      requestAnimationFrame(() => taRef.current?.focus())
    })
  }, [sessionId])

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
        draftMirrorRef.current = next
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

  /* [2026-05-07] @ 补全：与 / 菜单互斥 */
  const atCtx = useMemo(() => {
    if (slashMenuOpen) return null
    return getAtCompletionAt(draft, cursor)
  }, [draft, cursor, slashMenuOpen])

  /* [2026-05-08] 原组件挂载即 readFileTree(workdir, 3)，大目录会同步卡住主进程；改为输入 @ 后按需加载并缓存。 */
  useEffect(() => {
    if (!workdir || !atCtx) {
      setAtItems([])
      return
    }
    const cached = atItemsCache.get(workdir)
    if (cached) {
      setAtItems(cached)
      return
    }
    let cancelled = false
    window.electronAPI.readFileTree(workdir, 2).then((nodes) => {
      if (cancelled) return
      const items = flattenTreeToAtItems(nodes, workdir)
      atItemsCache.set(workdir, items)
      setAtItems(items)
    }).catch(() => {
      if (!cancelled) setAtItems([])
    })
    return () => { cancelled = true }
  }, [atCtx, workdir])

  const atList = useMemo(() => {
    if (!atCtx) return []
    return filterAtCommands(atItems, atCtx.query)
  }, [atCtx, atItems])

  const atMenuOpen = Boolean(atCtx && atList.length > 0)

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

  /* [2026-05-07] @ 菜单选择重置 & 滚动 */
  useEffect(() => {
    setSelectedAt(0)
  }, [atCtx?.query, atCtx?.end])

  useEffect(() => {
    setSelectedAt((s) => (atList.length === 0 ? 0 : Math.min(s, atList.length - 1)))
  }, [atList.length])

  useEffect(() => {
    if (!atMenuOpen || !atListRef.current) return
    const el = atListRef.current.children[selectedAt] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedAt, atMenuOpen])

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
      draftMirrorRef.current = next
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

  const applyAtItem = useCallback(
    (item: FileAtItem): void => {
      if (!atCtx) return
      const after = draft.slice(atCtx.end)
      const before = draft.slice(0, atCtx.start)
      const next = before + item.insert + after
      draftMirrorRef.current = next
      setDraft(next)
      const pos = atCtx.start + item.insert.length
      requestAnimationFrame(() => {
        const el = taRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(pos, pos)
          setCursor(pos)
        }
      })
    },
    [draft, atCtx]
  )

  const interruptGeneration = useCallback((): void => {
    sendPtyInterruptSignal(sessionId)
  }, [sessionId])

  /* [2026-05-08] 发送正文顺序：draftMirrorRef(onChange 首行同步，不被 PTY 快照 setDraft 污染) > DOM > draft；勿把 taRef 作唯一来源以免受控 value 仍为「在吗」时传入 send */
  const send = useCallback((): void => {
    if (alternateScreen) return
    if (embedSendBusyRef.current) return
    const t = (draftMirrorRef.current || taRef.current?.value || draft).replace(/\r\n/g, '\n')
    if (!t.trim()) return
    embedSendBusyRef.current = true
    draftMirrorRef.current = ''
    pushInputHistory(sessionId, t)
    historyCursorRef.current = null
    draftBeforeHistoryRef.current = ''
    setDraft('')
    setCursor(0)
    const isSlash = t.trimStart().startsWith('/')
    /* [2026-05-08] 斜杠命令不把正文当作「可恢复的最后一次提问」，避免中断后误填旧普通消息 */
    if (isSlash) {
      lastPlainEmbedSentRef.current = ''
    } else {
      lastPlainEmbedSentRef.current = t
    }
    setSlashInteractiveMode(isSlash)
    submitEmbedSessionInput(sessionId, t)
    queueMicrotask(() => {
      embedSendBusyRef.current = false
    })
    requestAnimationFrame(() => {
      if (!isSlash) taRef.current?.focus()
    })
  }, [alternateScreen, draft, pushInputHistory, sessionId])

  /** [2026-05-06] Ctrl/Cmd+Enter 在光标处插入换行（Enter 单独用于发送） */
  const insertNewlineAtCursor = useCallback((): void => {
    const el = taRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    setDraft((prev) => {
      const next = prev.slice(0, start) + '\n' + prev.slice(end)
      const pos = start + 1
      draftMirrorRef.current = next
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

  const exitSlashInteraction = useCallback((): void => {
    /* [2026-05-07] 方案 1：Esc 是 TUI 内“退一层”，不能再直接关闭前端；强制退出用 Ctrl+C 并等待 PTY 自然结束。 */
    // sendRawPtyInput(sessionId, '\x1b')
    // useTranscriptStore.getState().clearLatestPtyEchoChunk(sessionId)
    // setEmbedSlashPtyEchoActive(sessionId, false)
    // setSlashInteractiveMode(false)
    sendRawPtyInput(sessionId, '\x03')
    /* [2026-05-07] 原这里只隐藏浮窗；强制退出后必须同步清理 open/needed，避免状态残留。 */
    // dismissNativeTerminal(sessionId)
    clearNativeTerminal(sessionId)
    window.setTimeout(() => {
      setSlashInteractiveMode((active) => {
        if (active) {
          /* [2026-05-07] Ctrl+C 未产生可检测退出帧时兜底清理，避免输入框长期 readOnly。 */
          useTranscriptStore.getState().clearLatestPtyEchoChunk(sessionId)
          setEmbedSlashPtyEchoActive(sessionId, false)
          requestAnimationFrame(() => taRef.current?.focus())
        }
        return false
      })
    }, 250)
  }, [clearNativeTerminal, sessionId])

  const sendPtyControlKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!slashInteractiveMode || alternateScreen) return false
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        exitSlashInteraction()
        return true
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        exitSlashInteraction()
        return true
      }
      /* [2026-05-07] 原在 textarea 里手动转发 ↑↓/字符/Tab；/skills 这类带输入框 TUI 需要真实 xterm 处理焦点、组合键和输入。 */
      // sendRawPtyInput(sessionId, data)
      e.preventDefault()
      return true
    },
    [alternateScreen, exitSlashInteraction, sessionId, slashInteractiveMode]
  )

  const setDraftFromHistory = useCallback((text: string): void => {
    draftMirrorRef.current = text
    setDraft(text)
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      const pos = text.length
      el.setSelectionRange(pos, pos)
      setCursor(pos)
    })
  }, [])

  const handleHistoryKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (slashInteractiveMode || alternateScreen || slashMenuOpen) return false
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false
      if (draft.includes('\n')) return false
      const el = taRef.current
      const selectionStart = el?.selectionStart ?? cursor
      const selectionEnd = el?.selectionEnd ?? cursor
      if (selectionStart !== selectionEnd) return false
      if (e.key === 'ArrowUp' && selectionStart > 0 && draft.trim().length > 0) return false
      if (e.key === 'ArrowDown' && selectionStart < draft.length) return false
      if (inputHistory.length === 0) return false

      e.preventDefault()
      if (e.key === 'ArrowUp') {
        const current = historyCursorRef.current
        if (current === null) {
          draftBeforeHistoryRef.current = draft
          historyCursorRef.current = inputHistory.length - 1
        } else {
          historyCursorRef.current = Math.max(0, current - 1)
        }
        setDraftFromHistory(inputHistory[historyCursorRef.current] ?? '')
        return true
      }

      const current = historyCursorRef.current
      if (current === null) return true
      if (current >= inputHistory.length - 1) {
        historyCursorRef.current = null
        setDraftFromHistory(draftBeforeHistoryRef.current)
        draftBeforeHistoryRef.current = ''
        return true
      }
      historyCursorRef.current = current + 1
      setDraftFromHistory(inputHistory[historyCursorRef.current] ?? '')
      return true
    },
    [
      alternateScreen,
      cursor,
      draft,
      inputHistory,
      setDraftFromHistory,
      slashInteractiveMode,
      slashMenuOpen
    ]
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
          draftMirrorRef.current = after
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

    /* [2026-05-07] @ 文件补全键盘处理：与 / 菜单互斥，同一模式处理 */
    if (atMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedAt((i) => (i + 1) % atList.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedAt((i) => (i - 1 + atList.length) % atList.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        const item = atList[selectedAt]
        if (item) applyAtItem(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (atCtx) {
          const after = draft.slice(atCtx.end)
          const before = draft.slice(0, atCtx.start)
          const next = before + after
          draftMirrorRef.current = next
          setDraft(next)
          const pos = atCtx.start
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

    if (handleHistoryKey(e)) return

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
      /* [2026-05-08] IME 组字未结束时 Enter 交给输入法，避免截断中文 */
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      /* [2026-05-08] 受控 textarea：同一帧内「最后一键」的 input/onChange 可能晚于 Enter 的 keydown，currentTarget.value 仍是旧串。
       * defer 到 macrotask 后浏览器与 React 已处理完 input，再读 taRef.value 发送完整正文 */
      window.setTimeout(() => send(), 0)
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] px-3 py-3">
      <div className="mx-auto flex max-w-3xl min-h-0 items-end gap-2.5">
        <div className="relative min-h-0 flex-1">
          {slashMenuOpen ? (
            <ul
              id="slash-command-list"
              ref={listRef}
              role="listbox"
              className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-xl border border-[var(--theme-panel-border)] bg-[var(--theme-card-bg)] py-1 shadow-2xl shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-panel-border)]"
            >
              {slashList.map((item, idx) => (
                <li key={`${item.matchKey}-${item.insert}-${idx}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === selectedSlash}
                    className={`flex w-full flex-col gap-0.5 px-2.5 py-2 text-left text-[11px] transition-colors ${
                      idx === selectedSlash
                        ? 'bg-[var(--theme-accent-bg-strong)] text-claude-text'
                        : 'text-claude-text/90 hover:bg-[var(--theme-panel-bg-soft)]'
                    }`}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      applySlashItem(item)
                    }}
                    onMouseEnter={() => setSelectedSlash(idx)}
                  >
                    <span className="font-mono text-[var(--theme-accent-muted)]">{item.insert.trimEnd()}</span>
                    <span className="text-[10px] leading-snug text-claude-muted">{item.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/* [2026-05-07] @ 文件/目录补全：与 / 菜单互斥，同一位置渲染 */}
          {atMenuOpen ? (
            <ul
              id="at-file-list"
              ref={atListRef}
              role="listbox"
              className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-xl border border-[var(--theme-panel-border)] bg-[var(--theme-card-bg)] py-1 shadow-2xl shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-panel-border)]"
            >
              {atList.map((item, idx) => (
                <li key={`${item.matchKey}-${idx}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === selectedAt}
                    className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] transition-colors ${
                      idx === selectedAt
                        ? 'bg-[var(--theme-accent-bg-strong)] text-claude-text'
                        : 'text-claude-text/90 hover:bg-[var(--theme-panel-bg-soft)]'
                    }`}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      applyAtItem(item)
                    }}
                    onMouseEnter={() => setSelectedAt(idx)}
                  >
                    <span className="font-mono text-[var(--theme-accent-muted)] flex-1 truncate">{item.insert.trimEnd()}</span>
                    <span className="text-[10px] text-claude-muted shrink-0">{item.isDirectory ? '目录' : '文件'}</span>
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
              historyCursorRef.current = null
              draftBeforeHistoryRef.current = ''
              draftMirrorRef.current = e.target.value
              setDraft(e.target.value)
              setCursor(e.target.selectionStart ?? 0)
            }}
            onSelect={syncCursorFromDom}
            onClick={syncCursorFromDom}
            onFocus={() => {
              if (slashInteractiveMode) requestAnimationFrame(() => taRef.current?.blur())
            }}
            onKeyUp={syncCursorFromDom}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={
              alternateScreen
                ? '全屏终端界面进行中，输入已暂停…'
                : slashInteractiveMode
                  ? '斜杠命令交互中：请在上方内嵌终端直接输入；Ctrl+Enter 强制退出'
                  : '输入消息… Enter 发送 · Tab 填入命令 · Ctrl+Enter 换行 · / 打开命令 · @ 引用文件'
            }
            className={`fo-embed-composer-textarea min-h-[80px] w-full resize-y rounded-xl border border-[var(--theme-panel-border)] bg-[var(--theme-field-bg)] px-3 py-2.5 text-[12px] leading-relaxed text-claude-text shadow-inner shadow-[color:var(--theme-shadow)] placeholder:text-claude-muted/55 focus:border-[var(--theme-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] ${
              alternateScreen ? 'cursor-not-allowed opacity-45' : ''
            }`}
            spellCheck={false}
            aria-expanded={slashMenuOpen || atMenuOpen}
            aria-controls={slashMenuOpen ? 'slash-command-list' : atMenuOpen ? 'at-file-list' : undefined}
          />
        </div>
        {showInterrupt ? (
          <button
            type="button"
            title="向 PTY 发送 Ctrl+C；若在经典终端按 Ctrl+C，上次普通提问也会回到输入框。"
            onClick={interruptGeneration}
            className="shrink-0 rounded-xl border border-red-500/55 bg-red-500/12 px-3 py-2.5 text-[11px] font-semibold text-red-400 shadow-md shadow-[color:var(--theme-shadow)] transition hover:bg-red-500/20"
          >
            中断
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => send()}
          disabled={alternateScreen || slashInteractiveMode}
          className="shrink-0 rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] px-4 py-2.5 text-[11px] font-semibold text-[var(--theme-accent-text)] shadow-md shadow-[color:var(--theme-shadow)] transition hover:bg-[var(--theme-accent-bg-strong)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送
        </button>
        {slashInteractiveMode ? (
          <button
            type="button"
            onClick={() => {
              exitSlashInteraction()
            }}
            className="shrink-0 rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] px-3 py-2.5 text-[11px] font-semibold text-[var(--theme-accent-text)] transition hover:bg-[var(--theme-accent-bg-strong)]"
          >
            强制退出
          </button>
        ) : null}
      </div>
      {alternateScreen ? (
        <div className="mx-auto mt-2 max-w-3xl rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] px-3 py-2.5">
          <p className="text-[10px] leading-relaxed text-[var(--theme-accent-text)]">
            已检测到终端备用缓冲区（全屏 TUI，如 Ink 的{' '}
            <kbd className="rounded border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1 py-px font-mono text-[9px]">
              /help
            </kbd>
            ）。外嵌按行输入与此类界面不兼容，已自动暂停；请用顶栏切换到「经典终端」逐键操作，或点击下方向 PTY 发送常用退出键。退出备用缓冲区后此处会自动恢复。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="发送 Ctrl+C 到 PTY"
              className="rounded-md border border-[var(--theme-accent-border)] bg-[var(--theme-panel-bg-soft)] px-2 py-1 text-[9px] font-medium text-[var(--theme-accent-text)] transition hover:bg-[var(--theme-accent-bg)]"
              onClick={() => sendRawPtyInput(sessionId, '\x03')}
            >
              Ctrl+C
            </button>
            <button
              type="button"
              title="发送 Esc 到 PTY"
              className="rounded-md border border-[var(--theme-accent-border)] bg-[var(--theme-panel-bg-soft)] px-2 py-1 text-[9px] font-medium text-[var(--theme-accent-text)] transition hover:bg-[var(--theme-accent-bg)]"
              onClick={() => sendRawPtyInput(sessionId, '\x1b')}
            >
              Esc
            </button>
            <button
              type="button"
              title="发送 q 并换行"
              className="rounded-md border border-[var(--theme-accent-border)] bg-[var(--theme-panel-bg-soft)] px-2 py-1 text-[9px] font-medium text-[var(--theme-accent-text)] transition hover:bg-[var(--theme-accent-bg)]"
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
        <kbd className="rounded-md border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1.5 py-0.5 font-mono text-[9px]">Enter</kbd>{' '}
        发送 · <kbd className="rounded-md border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1 py-0.5 font-mono">Ctrl+Enter</kbd>{' '}
        换行 · <kbd className="rounded-md border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1.5 py-0.5 font-mono text-[9px]">/</kbd>{' '}
        命令面板 · <kbd className="rounded-md border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1 py-0.5 font-mono">↑↓</kbd>{' '}
        <kbd className="rounded-md border border-[var(--theme-kbd-border)] bg-[var(--theme-kbd-bg)] px-1 py-0.5 font-mono">Tab</kbd>{' '}
        填入/历史 · running / 等待确认时可「中断」· 中断（含终端 Ctrl+C）后上次普通提问可回到输入框 · 发送斜杠命令后按键直通 PTY（Esc / Ctrl+Enter 退出）· 文件拖入上方可插入 @ 路径
      </p>
    </div>
  )
}
