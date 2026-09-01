import React, { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import {
  FILE_DRAG_MIME,
  formatFileRefForClaudeCode,
  type FileDragPayload
} from '../../lib/claudeRef'
import { CC_SLASH_DRAG_MIME, CC_SLASH_PLAIN_PREFIX } from '../../lib/ccSlashDrag'
import { injectEmbedDraft } from '../../lib/embedDraftBridge'
import { getElectronFilePath } from '../../lib/electronFilePath'
import { isOfficeFile } from '../office/officeFileDetector'
import { focusTerminal } from './terminalRuntime'

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

  /** [2026-05-06] 外嵌 Beta 有 EmbedSessionComposer 时写入输入框，否则保持 PTY sendInput */
  const tryEmbedDraft = (text: string): boolean => {
    if (injectEmbedDraft(sessionId, text)) {
      setActiveSession(sessionId)
      return true
    }
    return false
  }

  /** 资源管理器拖入：Chromium 常见 type 为 Files；另支持 text/uri-list */
  const hasFileDropHint = (types: readonly string[]): boolean =>
    types.includes('Files') ||
    types.includes('text/uri-list') ||
    types.some((t) => t.toLowerCase() === 'files')

  /** Electron 下通过 webUtils 读取 File 的本地路径；否则尝试 text/uri-list。 */
  const pathsFromOsDrop = (e: React.DragEvent): string[] => {
    const out: string[] = []
    const { files } = e.dataTransfer
    for (let i = 0; i < files.length; i++) {
      const path = getElectronFilePath(files[i])
      if (path) out.push(path)
    }
    if (out.length > 0) return out
    const raw = e.dataTransfer.getData('text/uri-list')
    if (!raw) return out
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      try {
        const u = new URL(t)
        if (u.protocol !== 'file:') continue
        let pathname = decodeURIComponent(u.pathname.replace(/\+/g, '%20'))
        if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
        out.push(pathname)
      } catch {
        //
      }
    }
    return out
  }

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
      types.includes(CC_SLASH_DRAG_MIME) ||
      types.includes(FILE_DRAG_MIME) ||
      types.includes('application/json') ||
      types.includes('text/plain') ||
      hasFileDropHint(types)
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDragEnter = (e: React.DragEvent): void => {
    const types = Array.from(e.dataTransfer.types ?? [])
    if (
      types.includes(CC_SLASH_DRAG_MIME) ||
      types.includes(FILE_DRAG_MIME) ||
      types.includes('application/json') ||
      types.includes('text/plain') ||
      hasFileDropHint(types)
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

    /* [2026-04-23] 原仅处理文件树拖入；现优先处理侧栏 / 命令（CC_SLASH_*） */
    try {
      const raw = e.dataTransfer.getData(CC_SLASH_DRAG_MIME)
      if (raw) {
        const o = JSON.parse(raw) as { command?: string }
        if (o.command && typeof o.command === 'string' && o.command.startsWith('/')) {
          if (tryEmbedDraft(o.command)) return
          setActiveSession(sessionId)
          window.electronAPI.sendInput(sessionId, o.command)
          queueMicrotask(() => focusTerminal(sessionId))
          return
        }
      }
    } catch {
      //
    }
    const plainFirst = e.dataTransfer.getData('text/plain').trim()
    if (plainFirst.startsWith(CC_SLASH_PLAIN_PREFIX)) {
      const cmd = plainFirst.slice(CC_SLASH_PLAIN_PREFIX.length)
      if (tryEmbedDraft(cmd)) return
      setActiveSession(sessionId)
      window.electronAPI.sendInput(sessionId, cmd)
      queueMicrotask(() => focusTerminal(sessionId))
      return
    }

    const osPaths = pathsFromOsDrop(e)
    if (osPaths.length > 0) {
      if (osPaths.length === 1 && isOfficeFile(osPaths[0])) {
        const openPreview = (window as any).__officePreviewOpen
        if (openPreview) {
          openPreview(osPaths[0])
          return
        }
      }
      const blob = osPaths
        .map((p) => `${formatFileRefForClaudeCode(p, workdir, false)} `)
        .join('')
      if (tryEmbedDraft(blob)) return
      setActiveSession(sessionId)
      for (const p of osPaths) {
        const ref = formatFileRefForClaudeCode(p, workdir, false)
        window.electronAPI.sendInput(sessionId, `${ref} `)
      }
      queueMicrotask(() => focusTerminal(sessionId))
      return
    }

    const payload = parsePayload(e)
    if (!payload) return

    if (payload.kind === 'file' && isOfficeFile(payload.path)) {
      const openPreview = (window as any).__officePreviewOpen
      if (openPreview) {
        openPreview(payload.path)
        return
      }
    }

    const ref = formatFileRefForClaudeCode(payload.path, workdir, payload.kind === 'directory')
    if (tryEmbedDraft(`${ref} `)) return
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
