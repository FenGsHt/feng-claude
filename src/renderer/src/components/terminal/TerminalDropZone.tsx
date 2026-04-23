import React, { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import {
  FILE_DRAG_MIME,
  formatFileRefForClaudeCode,
  type FileDragPayload
} from '../../lib/claudeRef'
import { focusTerminal } from './XTerminal'

/** 包住 xterm：从文件树拖入时往当前 Claude 会话注入 @path 引用（经 PTY 发送） */
export function TerminalDropZone({
  sessionId,
  children
}: {
  sessionId: string
  children: React.ReactNode
}): React.ReactElement {
  const [dragOver, setDragOver] = useState(false)
  const sessions = useSessionStore((s) => s.sessions)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const workdir = sessions.find((s) => s.id === sessionId)?.workdir ?? ''

  const parsePayload = (e: React.DragEvent): FileDragPayload | null => {
    try {
      const raw =
        e.dataTransfer.getData(FILE_DRAG_MIME) ||
        e.dataTransfer.getData('application/json')
      if (raw) {
        const o = JSON.parse(raw) as Partial<FileDragPayload>
        if (o?.path)
          return {
            path: o.path,
            kind: o.kind === 'directory' ? 'directory' : 'file'
          }
      }
    } catch {
      //
    }
    const plain = e.dataTransfer.getData('text/plain').trim()
    if (plain) return { path: plain, kind: 'file' }
    return null
  }

  const handleDragOver = (e: React.DragEvent): void => {
    const types = Array.from(e.dataTransfer.types ?? [])
    if (
      types.includes(FILE_DRAG_MIME) ||
      types.includes('application/json') ||
      types.includes('text/plain')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDragEnter = (e: React.DragEvent): void => {
    const types = Array.from(e.dataTransfer.types ?? [])
    if (
      types.includes(FILE_DRAG_MIME) ||
      types.includes('application/json') ||
      types.includes('text/plain')
    ) {
      e.preventDefault()
      setDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    const el = e.currentTarget as HTMLElement
    const rel = e.relatedTarget as Node | null
    if (!rel || !el.contains(rel)) setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const payload = parsePayload(e)
    if (!payload) return

    const ref = formatFileRefForClaudeCode(payload.path, workdir, payload.kind === 'directory')
    setActiveSession(sessionId)
    window.electronAPI.sendInput(sessionId, `${ref} `)
    queueMicrotask(() => focusTerminal(sessionId))
  }

  return (
    <div
      role="presentation"
      className={`flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden transition-shadow ${
        dragOver ? 'ring-1 ring-dashed ring-amber-500/50 ring-inset' : ''
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </div>
  )
}
