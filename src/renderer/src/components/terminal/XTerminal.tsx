import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

interface Props {
  sessionId: string
  active: boolean
}

// Map sessionId → Terminal instance (shared across re-renders)
const terminals = new Map<string, { term: Terminal; fitAddon: FitAddon }>()

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
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.term.dispose()
    terminals.delete(sessionId)
  }
}

export function writeToTerminal(sessionId: string, data: string): void {
  terminals.get(sessionId)?.term.write(data)
}

export function XTerminal({ sessionId, active }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)

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

  useEffect(() => {
    if (!containerRef.current) return
    const { term, fitAddon } = getOrCreateTerminal(sessionId)

    if (!mountedRef.current) {
      term.open(containerRef.current)
      mountedRef.current = true

      // Send keystrokes to PTY
      term.onData((data) => {
        window.electronAPI?.sendInput(sessionId, data)
      })
    } else {
      // Re-attach to DOM when switching tabs
      containerRef.current.appendChild(term.element!)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
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
