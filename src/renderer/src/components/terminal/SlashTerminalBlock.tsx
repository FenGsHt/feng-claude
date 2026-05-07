import React, { useCallback, useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { subscribeSlashPtyOutput } from '../../lib/embedPtyTranscriptEcho'
import { useResolvedTheme } from '../../hooks/useTheme'
import { getThemeDefinition, type ResolvedThemeId } from '../../theme/themeRegistry'

interface Props {
  sessionId: string
}

const liveSlashTerms = new Map<string, Terminal>()

export function focusSlashTerminal(sessionId: string): void {
  liveSlashTerms.get(sessionId)?.focus()
}

function themeForResolved(resolved: ResolvedThemeId) {
  /* [2026-05-07] 原组件内按 id 分支选择 ANSI palette；改用 registry 支持更多主题。 */
  // if (resolved === 'fallout') return FALLOUT_THEME
  // if (resolved === 'light') return LIGHT_THEME
  // return DARK_THEME
  return getThemeDefinition(resolved).terminal
}

export function SlashTerminalBlock({ sessionId }: Props): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const resolvedTheme = useResolvedTheme()

  const fitAndResizePty = useCallback((): void => {
    const term = termRef.current
    const fit = fitRef.current
    const host = hostRef.current
    if (!term || !fit || !host || host.clientWidth < 8 || host.clientHeight < 8) return
    try {
      fit.fit()
      window.electronAPI.resizePty(sessionId, term.cols, term.rows)
    } catch {
      // hidden / detached xterm can fail fit; next ResizeObserver tick will retry
    }
  }, [sessionId])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.35,
      letterSpacing: 0.2,
      cursorBlink: true,
      scrollback: 1000,
      convertEol: true,
      theme: themeForResolved(resolvedTheme)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit
    liveSlashTerms.set(sessionId, term)

    const dataSub = term.onData((data) => {
      window.electronAPI.sendInput(sessionId, data)
    })
    const unsubscribe = subscribeSlashPtyOutput(sessionId, (data) => {
      term.write(data)
    })
    const ro = new ResizeObserver(() => fitAndResizePty())
    ro.observe(host)

    requestAnimationFrame(() => {
      fitAndResizePty()
      term.focus()
    })

    return () => {
      unsubscribe()
      ro.disconnect()
      dataSub.dispose()
      term.dispose()
      if (liveSlashTerms.get(sessionId) === term) liveSlashTerms.delete(sessionId)
      termRef.current = null
      fitRef.current = null
    }
  }, [fitAndResizePty, resolvedTheme, sessionId])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = themeForResolved(resolvedTheme)
  }, [resolvedTheme])

  return (
    <div
      className="claude-transcript-pty-echo claude-transcript-pty-echo--slash w-full max-w-3xl rounded-xl border border-[var(--theme-tool-border)] bg-[var(--theme-card-bg)] px-3 py-2.5 shadow-inner shadow-[color:var(--theme-shadow)] ring-1 ring-[var(--theme-tool-border)]"
      data-transcript-pty="slash"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-accent-muted)]">
          <span className="font-mono text-[11px] normal-case tracking-normal text-[var(--theme-accent-text)] opacity-80">/</span>
          终端交互（外嵌 xterm）
        </div>
        <span className="text-[9px] text-[var(--theme-accent-text)] opacity-50">点击终端后可直接输入、搜索、选择、Esc 返回</span>
      </div>
      <div
        ref={hostRef}
        className="min-h-[420px] overflow-hidden rounded-lg bg-[var(--theme-panel-bg-soft)] px-1 py-1 ring-1 ring-[var(--theme-panel-border)] [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent"
      />
    </div>
  )
}
