import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { emitTerminalCommittedLine } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useUserPromptStore } from '../../store/userPromptStore'
import { formatFileRefForClaudeCode } from '../../lib/claudeRef'
import { getTerminalTheme } from '../../hooks/useTheme'

interface Props {
  sessionId: string
  active: boolean
}

// Map sessionId → Terminal instance (shared across re-renders)
const terminals = new Map<string, { term: Terminal; fitAddon: FitAddon }>()

/** 当前行缓冲，遇 \r/\n 提交为「最后一问」候选（与 PTY send 并行） */
const terminalLineBuffers = new Map<string, string>()

/** [2026-04-27] 用户输入缓冲：多行文本合并为完整问题 */
const userInputBuffers = new Map<string, string[]>()

/** [2026-04-28] 通用的输入缓冲函数：将发送到 PTY 的数据同时缓冲到 userInputBuffers */
function bufferUserInput(sessionId: string, data: string): void {
  // 按换行分割，每行单独缓冲
  const lines = data.split(/\r?\n/)
  let buf = userInputBuffers.get(sessionId) ?? []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      buf.push(trimmed)
      if (buf.length > 30) buf = buf.slice(-30)
    }
  }
  userInputBuffers.set(sessionId, buf)
}

/** 合并同一帧内多次 fit 请求，减轻 xterm 内部 requestIdleCallback 队列积压 */
const pendingFitRafBySession = new Map<string, number>()

function getOrCreateTerminal(sessionId: string): { term: Terminal; fitAddon: FitAddon } {
  if (terminals.has(sessionId)) return terminals.get(sessionId)!

  const initialTheme = getTerminalTheme()
  const term = new Terminal({
    fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.45,
    letterSpacing: 0.3,
    theme: initialTheme,
    // [2026-04-23] 原 5000；resize/fit 时 xterm 重算缓冲更重，打包后易触发 task queue deadline 警告，略降 scrollback
    scrollback: 2000,
    allowProposedApi: true,
    convertEol: true
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  terminals.set(sessionId, { term, fitAddon })
  return { term, fitAddon }
}

export function destroyTerminal(sessionId: string): void {
  const raf = pendingFitRafBySession.get(sessionId)
  if (raf !== undefined) {
    cancelAnimationFrame(raf)
    pendingFitRafBySession.delete(sessionId)
  }
  terminalLineBuffers.delete(sessionId)
  userInputBuffers.delete(sessionId)
  useUserPromptStore.getState().clearSession(sessionId)
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.term.dispose()
    terminals.delete(sessionId)
  }
}

export function writeToTerminal(sessionId: string, data: string): void {
  terminals.get(sessionId)?.term.write(data)
}

/** 将键盘焦点交给对应 xterm（例如从侧栏拖放路径后便于继续输入） */
export function focusTerminal(sessionId: string): void {
  terminals.get(sessionId)?.term.focus()
}

/** 恢复历史 scrollback：创建（或复用）terminal 实例并写入 base64 编码的原始终端数据 */
export function preFillTerminal(sessionId: string, rawBase64: string): void {
  const { term } = getOrCreateTerminal(sessionId)
  const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0))
  term.write(bytes)
  // After replaying raw PTY bytes (which may contain alternate-screen switches,
  // absolute cursor positions, etc.), restore the terminal to a clean state so
  // the new Claude session starts on a fresh line without visual corruption.
  //   \x1b[?1049l  — exit alternate screen (safe no-op if already in normal screen)
  //   \x1b[m       — reset all SGR attributes
  //   \x1b[?25h    — ensure cursor is visible
  //   \r\n         — move to a fresh line
  term.write('\x1b[?1049l\x1b[m\x1b[?25h\r\n')
}

/** [2026-04-27] 提交用户问题：将缓冲的多行合并为完整问题，存入 userPromptStore */
export function commitUserPrompt(sessionId: string): void {
  const lines = userInputBuffers.get(sessionId)
  if (!lines || lines.length === 0) return
  // 合并多行，过滤空行，限制长度
  const prompt = lines
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .slice(0, 2000)
  if (prompt) {
    useUserPromptStore.getState().setPrompt(sessionId, prompt)
  }
  // 清空缓冲
  userInputBuffers.set(sessionId, [])
}

export function XTerminal({ sessionId, active }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastPtyGeomRef = useRef<{ cols: number; rows: number } | null>(null)

  const fit = useCallback(() => {
    const entry = terminals.get(sessionId)
    const el = containerRef.current
    if (!entry || !el) return
    // [2026-04-23] 原未判断尺寸；布局未稳定时 fit 会白跑并加重 xterm 队列
    if (el.clientWidth < 4 || el.clientHeight < 4) return
    try {
      entry.fitAddon.fit()
      const { cols, rows } = entry.term
      const prev = lastPtyGeomRef.current
      if (prev?.cols === cols && prev?.rows === rows) return
      lastPtyGeomRef.current = { cols, rows }
      window.electronAPI?.resizePty(sessionId, cols, rows)
    } catch {
      lastPtyGeomRef.current = null
      // ignore fit errors on hidden tabs
    }
  }, [sessionId])

  const scheduleFit = useCallback(() => {
    const prev = pendingFitRafBySession.get(sessionId)
    if (prev !== undefined) cancelAnimationFrame(prev)
    const id = requestAnimationFrame(() => {
      pendingFitRafBySession.delete(sessionId)
      fit()
    })
    pendingFitRafBySession.set(sessionId, id)
  }, [sessionId, fit])

  /*
   * [2026-04-23] 原先用 mountedRef 包住 onData，仅在「首次」注册；Strict Mode / 父级重挂时新实例
   * mountedRef 归零，但 term 仍在全局 Map 里，会再次 register onData，cleanup 又不 dispose，
   * 叠多条回调 → 键入一次多次 sendInput（中文 IME 看起来像「一个字重复多遍」）。
   * 改为：每次 effect 注册一条 onData，cleanup 里 IDisposable.dispose()。
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { term } = getOrCreateTerminal(sessionId)

    if (!term.element) {
      term.open(container)
    } else {
      container.appendChild(term.element)
    }

    const dataSub = term.onData((data) => {
      window.electronAPI?.sendInput(sessionId, data)
      // [2026-04-23] 缓冲物理行，遇换行写入 history.lastUserPrompt（terminalLineBridge → sessionStore）
      let buf = terminalLineBuffers.get(sessionId) ?? ''
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          if (buf.length > 0) {
            emitTerminalCommittedLine(sessionId, buf)
            buf = ''
          }
        } else if (ch === '\x7f' || ch === '\b') {
          buf = buf.slice(0, -1)
        } else if (ch.charCodeAt(0) >= 32 || ch === '\t') {
          buf += ch
          if (buf.length > 4000) buf = buf.slice(-2000)
        }
      }
      terminalLineBuffers.set(sessionId, buf)

      // [2026-04-28] 使用统一的缓冲函数
      bufferUserInput(sessionId, data)
    })

    /** 资源管理器「复制文件」后 Ctrl+V：Electron clipboard 的 File 带 path，转成 @ 引用注入 PTY */
    const onPasteFiles = (ev: ClipboardEvent): void => {
      const files = ev.clipboardData?.files
      if (!files || files.length === 0) return
      const first = files[0] as File & { path?: string }
      if (!first.path) return
      ev.preventDefault()
      ev.stopPropagation()
      const wd =
        useSessionStore.getState().sessions.find((s) => s.id === sessionId)?.workdir ?? ''
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as File & { path?: string }
        if (!f.path) continue
        const ref = formatFileRefForClaudeCode(f.path, wd, false)
        // [2026-04-28] 同时缓冲用户输入
        bufferUserInput(sessionId, ref)
        window.electronAPI?.sendInput(sessionId, `${ref} `)
      }
    }
    term.textarea.addEventListener('paste', onPasteFiles, true)

    /**
     * [2026-04-24] Ctrl/Cmd+V 在 Electron+xterm 下常无法走通默认 paste；主进程同步读文本后 term.paste。
     * 仅当剪贴板含文本时 preventDefault，以便纯「复制文件」仍落到 onPasteFiles。
     */
    const onKeyDownClipboardPaste = (ev: KeyboardEvent): void => {
      if (ev.type !== 'keydown') return
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (ev.altKey) return
      if (ev.isComposing) return
      if (ev.code !== 'KeyV' && ev.key !== 'v' && ev.key !== 'V') return
      const text = window.electronAPI.readClipboardTextSync?.() ?? ''
      if (text.length === 0) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      term.paste(text)
    }
    term.textarea.addEventListener('keydown', onKeyDownClipboardPaste, true)

    /**
     * [2026-04-27] Ctrl+Shift+C 复制终端选中文本（终端标准快捷键，不干扰 Ctrl+C 的 SIGINT）。
     */
    const onKeyDownClipboardCopy = (ev: KeyboardEvent): void => {
      if (ev.type !== 'keydown') return
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (!ev.shiftKey) return
      if (ev.altKey) return
      if (ev.isComposing) return
      if (ev.code !== 'KeyC' && ev.key !== 'c' && ev.key !== 'C') return
      const selection = term.getSelection()
      if (!selection || selection.length === 0) return
      navigator.clipboard.writeText(selection).catch(() => {})
      ev.preventDefault()
      ev.stopImmediatePropagation()
    }
    term.textarea.addEventListener('keydown', onKeyDownClipboardCopy, true)

    // [2026-04-23] 原先立即 fit() + 80ms debounce；打包后 ResizeObserver 连发易与 xterm 内部 idle 队列打架，改为 220ms + rAF 合并
    // fit()
    scheduleFit()
    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedFit = (): void => {
      if (fitTimer) clearTimeout(fitTimer)
      fitTimer = setTimeout(() => {
        scheduleFit()
      }, 220)
    }
    const ro = new ResizeObserver(debouncedFit)
    ro.observe(container)

    return () => {
      const raf = pendingFitRafBySession.get(sessionId)
      if (raf !== undefined) {
        cancelAnimationFrame(raf)
        pendingFitRafBySession.delete(sessionId)
      }
      dataSub.dispose()
      term.textarea.removeEventListener('paste', onPasteFiles, true)
      term.textarea.removeEventListener('keydown', onKeyDownClipboardPaste, true)
      term.textarea.removeEventListener('keydown', onKeyDownClipboardCopy, true)
      ro.disconnect()
      if (fitTimer) clearTimeout(fitTimer)
    }
  }, [sessionId, scheduleFit])

  // Fit when becoming active（延后到下一帧，避免与分屏/layout 同一 tick 内多次 resize）
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => {
      scheduleFit()
    }, 100)
    return () => clearTimeout(t)
  }, [active, scheduleFit])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      style={{ background: 'var(--claude-bg)' }}
    />
  )
}
