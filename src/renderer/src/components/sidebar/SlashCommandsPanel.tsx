import React, { useMemo, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { SLASH_COMMAND_ITEMS } from '../../lib/claudeSlashCommands'
import { CC_SLASH_DRAG_MIME, CC_SLASH_PLAIN_PREFIX } from '../../lib/ccSlashDrag'
import { injectTerminalText } from '../../lib/injectTerminal'

/** Claude Code `/` 命令列表：点击或拖入终端区域注入（不自动回车） */
export function SlashCommandsPanel(): React.ReactElement {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SLASH_COMMAND_ITEMS
    return SLASH_COMMAND_ITEMS.filter((it) => {
      const desc = it.description.toLowerCase()
      return it.command.toLowerCase().includes(q) || desc.includes(q)
    })
  }, [query])

  const onPick = (command: string): void => {
    if (!activeSessionId) return
    injectTerminalText(activeSessionId, command)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-claude-border px-2 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选命令或说明…"
          className="w-full rounded border border-claude-border bg-claude-bg px-2 py-1.5 text-[11px] text-claude-text placeholder:text-claude-muted focus:border-amber-600/50 focus:outline-none"
        />
        <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-claude-muted">
          官方内置命令摘要；项目中技能/MCP 仍以会话内输入{' '}
          <span className="font-mono text-claude-text">/</span> 为准。
        </p>
      </div>

      {!activeSessionId ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-[11px] text-claude-muted">
          请先创建或选择一个会话后再插入命令。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.map((item) => (
            <button
              key={item.command}
              type="button"
              draggable
              title={`拖入终端或点击插入：${item.command}`}
              onClick={() => onPick(item.command)}
              onDragStart={(e) => {
                const payload = JSON.stringify({ command: item.command })
                e.dataTransfer.setData(CC_SLASH_DRAG_MIME, payload)
                e.dataTransfer.setData('text/plain', `${CC_SLASH_PLAIN_PREFIX}${item.command}`)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-claude-border/40 px-3 py-2 text-left last:border-b-0 hover:bg-claude-border/40"
            >
              <span className="font-mono text-[11px] font-medium text-amber-500/90">{item.command}</span>
              <span className="text-[10px] leading-snug text-claude-muted">{item.description}</span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-claude-muted">无匹配项</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
