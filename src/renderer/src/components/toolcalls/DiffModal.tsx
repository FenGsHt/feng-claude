import React, { useEffect } from 'react'
import type { ToolCallEntry } from '../../store/toolCallStore'

// ── LCS-based line diff ───────────────────────────────────────

type DiffLine = { type: 'same' | 'removed' | 'added'; text: string }

function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split('\n')
  const b = newStr.split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'same', text: a[i - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: b[j - 1] }); j--
    } else {
      result.unshift({ type: 'removed', text: a[i - 1] }); i--
    }
  }
  return result
}

// ── Helpers ───────────────────────────────────────────────────

function getFilePath(call: ToolCallEntry): string {
  return (call.input.path as string) ?? (call.input.file_path as string) ?? ''
}

function getDiffContent(call: ToolCallEntry): { old: string; new: string } | null {
  if (call.name === 'Edit' || call.name === 'str_replace_based_edit_tool') {
    return {
      old: (call.input.old_string as string) ?? '',
      new: (call.input.new_string as string) ?? ''
    }
  }
  if (call.name === 'Write' || call.name === 'create_file') {
    return { old: '', new: (call.input.content as string) ?? '' }
  }
  if (call.name === 'MultiEdit') {
    const edits = call.input.edits as Array<{ old_string: string; new_string: string }> ?? []
    return {
      old: edits.map((e) => e.old_string).join('\n\n--- next edit ---\n\n'),
      new: edits.map((e) => e.new_string).join('\n\n--- next edit ---\n\n')
    }
  }
  return null
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  call: ToolCallEntry
  onClose: () => void
}

export function DiffModal({ call, onClose }: Props): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filePath = getFilePath(call)
  const diff = getDiffContent(call)

  if (call.name === 'Bash') {
    return (
      <Overlay onClose={onClose}>
        <Header title="Bash" subtitle={call.input.command as string} onClose={onClose} />
        <pre className="p-4 text-xs font-mono text-amber-300 bg-[#0d0d0d] overflow-auto flex-1 whitespace-pre-wrap">
          {call.input.command as string}
        </pre>
      </Overlay>
    )
  }

  if (!diff) {
    return (
      <Overlay onClose={onClose}>
        <Header title={call.name} subtitle={filePath} onClose={onClose} />
        <pre className="p-4 text-xs font-mono text-claude-text bg-[#0d0d0d] overflow-auto flex-1 whitespace-pre-wrap">
          {JSON.stringify(call.input, null, 2)}
        </pre>
      </Overlay>
    )
  }

  const lines = lineDiff(diff.old, diff.new)
  const isNewFile = diff.old === ''

  return (
    <Overlay onClose={onClose}>
      <Header title={isNewFile ? 'New file' : 'Edit'} subtitle={filePath} onClose={onClose} />
      <div className="flex-1 overflow-auto font-mono text-xs leading-5">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'removed'
                ? 'bg-red-950/60 text-red-300 px-4'
                : line.type === 'added'
                  ? 'bg-green-950/60 text-green-300 px-4'
                  : 'text-claude-muted px-4'
            }
          >
            <span className="mr-3 select-none opacity-40 w-4 inline-block text-right">
              {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
            </span>
            {line.text || ' '}
          </div>
        ))}
      </div>
    </Overlay>
  )
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-claude-bg border border-claude-border rounded-lg shadow-2xl w-[780px] max-w-[90vw] h-[75vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 h-10 border-b border-claude-border shrink-0 bg-claude-surface">
      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">{title}</span>
      <span className="text-xs text-claude-muted font-mono truncate flex-1">{subtitle}</span>
      <button onClick={onClose} className="text-claude-muted hover:text-claude-text transition-colors text-lg leading-none">×</button>
    </div>
  )
}
