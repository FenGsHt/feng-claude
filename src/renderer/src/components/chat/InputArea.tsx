import React, { useState, useRef, useCallback } from 'react'
import { useSessionStore } from '../../store/sessionStore'

export function InputArea(): React.ReactElement {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { activeSessionId, sessions, sendMessage } = useSessionStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const isRunning = activeSession?.status === 'running'
  const canSend = !isRunning && text.trim().length > 0 && !!activeSessionId

  const handleSend = useCallback(() => {
    if (!canSend || !activeSessionId) return
    sendMessage(activeSessionId, text.trim())
    setText('')
    textareaRef.current?.focus()
  }, [canSend, activeSessionId, text, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInterrupt = () => {
    if (!activeSessionId) return
    // Send Ctrl+C to interrupt
    window.electronAPI.sendInput(activeSessionId, '\x03')
  }

  return (
    <div className="px-4 py-3 border-t border-claude-border bg-claude-surface shrink-0">
      <div className="flex items-end gap-2 bg-claude-bg rounded-xl border border-claude-border focus-within:border-amber-600/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning
              ? 'Claude is thinking...'
              : !activeSessionId
                ? 'Create or select a session to start'
                : 'Message Claude... (Enter to send, Shift+Enter for newline)'
          }
          disabled={!activeSessionId}
          rows={1}
          className="flex-1 resize-none bg-transparent text-claude-text placeholder-claude-muted text-sm px-4 py-3 focus:outline-none min-h-[44px] max-h-[200px]"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 200) + 'px'
          }}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          {isRunning && (
            <button
              onClick={handleInterrupt}
              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
              title="Interrupt (Ctrl+C)"
            >
              ■
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              canSend
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-claude-border text-claude-muted cursor-not-allowed'
            }`}
          >
            Send
          </button>
        </div>
      </div>
      <p className="text-xs text-claude-muted mt-1.5 px-1">
        Enter to send · Shift+Enter for newline · Ctrl+C to interrupt
      </p>
    </div>
  )
}
