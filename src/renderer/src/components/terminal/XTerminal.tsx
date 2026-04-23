import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { emitTerminalCommittedLine } from '../../lib/terminalLineBridge'

interface Props {
  sessionId: string
  active: boolean
}

// Map sessionId → Terminal instance (shared across re-renders)
const terminals = new Map<string, { term: Terminal; fitAddon: FitAddon }>()

/** 当前行缓冲，遇 \\r/\\n 提交为「最后一问」候选（与 PTY send 并行） */
const terminalLineBuffers = new Map<string, string>()

function getOrCreateTerminal(sessionId: string): { term: Terminal; fitAddon: FitAddon } {
  if (terminals.has(sessionId)) return terminals.get(sessionId)!

  const term = new Terminal({
    fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    theme: {
      background: '#1a1a1a',
      foreground: '#ececec',
      cursor: '#d97706',
      cursorAccent: '#1a1a1a',
      selectionBackground: '#d9770640',
      black: '#1a1a1a',
      brightBlack: '#555555',
      red: '#f87171',
      brightRed: '#fca5a5',
      green: '#4ade80',
      brightGreen: '#86efac',
      yellow: '#fbbf24',
      brightYellow: '#fcd34d',
      blue: '#60a5fa',
      brightBlue: '#93c5fd',
      magenta: '#c084fc',
      brightMagenta: '#d8b4fe',
      cyan: '#22d3ee',
      brightCyan: '#67e8f9',
      white: '#d4d4d4',
      brightWhite: '#ffffff'
    },
    scrollback: 5000,
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
  terminalLineBuffers.delete(sessionId)
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

export function XTerminal({ sessionId, active }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  const fit = useCallback(() => {
    const entry = terminals.get(sessionId)
    if (!entry || !containerRef.current) return
    try {
      entry.fitAddon.fit()
      const { cols, rows } = entry.term
      window.electronAPI?.resizePty(sessionId, cols, rows)
    } catch {
      // ignore fit errors on hidden tabs
    }
  }, [sessionId])

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
    })

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(container)

    return () => {
      dataSub.dispose()
      ro.disconnect()
    }
  }, [sessionId, fit])

  // Fit when becoming active
  useEffect(() => {
    if (active) {
      setTimeout(fit, 50)
    }
  }, [active, fit])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      style={{ background: '#1a1a1a' }}
    />
  )
}
