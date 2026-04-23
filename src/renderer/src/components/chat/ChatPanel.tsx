import React, { useEffect, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useSessionStore } from '../../store/sessionStore'
import { MessageItem } from './MessageItem'
import { InputArea } from './InputArea'

export function ChatPanel(): React.ReactElement {
  const { sessions, activeSessionId } = useSessionStore()
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const messages = activeSession?.messages ?? []

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth' })
    }
  }, [messages.length])

  if (!activeSessionId || !activeSession) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-claude-muted">
          <div className="text-center space-y-3">
            <div className="text-4xl">◇</div>
            <p className="text-sm">No active session</p>
            <p className="text-xs opacity-60">Click + in the tab bar to start a new session</p>
          </div>
        </div>
        <InputArea />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-claude-muted">
          <div className="text-center space-y-3">
            <div className="text-4xl">◆</div>
            <p className="text-sm font-medium text-claude-text">Claude Code</p>
            <p className="text-xs opacity-60">
              Working in: <span className="font-mono">{activeSession.workdir}</span>
            </p>
            <p className="text-xs opacity-40">Type a message below to get started</p>
          </div>
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          itemContent={(_, message) => <MessageItem key={message.id} message={message} />}
          className="flex-1"
          followOutput="smooth"
        />
      )}
      <InputArea />
    </div>
  )
}
