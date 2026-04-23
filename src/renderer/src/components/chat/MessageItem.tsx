import React from 'react'
import type { Message } from '../../types/session'
import { MarkdownRenderer } from './MarkdownRenderer'

interface Props {
  message: Message
}

export function MessageItem({ message }: Props): React.ReactElement {
  const isUser = message.role === 'user'
  const isStreaming = message.status === 'streaming'

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
          isUser ? 'bg-amber-600 text-white' : 'bg-claude-border text-claude-muted'
        }`}
      >
        {isUser ? 'U' : 'C'}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-amber-600/20 text-claude-text border border-amber-600/30'
            : 'bg-claude-surface text-claude-text border border-claude-border'
        }`}
      >
        {isUser ? (
          <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-amber-400 animate-pulse ml-0.5 align-bottom" />
        )}
      </div>
    </div>
  )
}
