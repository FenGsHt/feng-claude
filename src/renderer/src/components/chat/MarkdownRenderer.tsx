import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props): React.ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? '')
          const isBlock = match !== null
          return isBlock ? (
            <SyntaxHighlighter
              style={vscDarkPlus as any}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: '0.5rem 0',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: '#1e1e1e'
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              className="bg-claude-border px-1 py-0.5 rounded text-amber-300 text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-amber-500 pl-3 text-claude-muted italic mb-2">
              {children}
            </blockquote>
          )
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold mb-2 text-claude-text">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-base font-bold mb-2 text-claude-text">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-bold mb-1 text-claude-text">{children}</h3>
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
