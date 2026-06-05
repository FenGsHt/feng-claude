import React, { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useTodoListStore, parseMarkdownTodos } from '../../store/todoListStore'
import { runTodosForSession, answerTodoClarification } from '../../lib/runTodos'
import { useI18n } from '../../i18n'

export function TodoListPanel(): React.ReactElement {
  const { t } = useI18n()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const workdir = useSessionStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.workdir ?? '')
  const todos = useTodoListStore((s) => (workdir ? s.byWorkdir[workdir] ?? [] : []))
  const addTodo = useTodoListStore((s) => s.addTodo)
  const toggleTodo = useTodoListStore((s) => s.toggleTodo)
  const setStatus = useTodoListStore((s) => s.setStatus)
  const editTodo = useTodoListStore((s) => s.editTodo)
  const deleteTodo = useTodoListStore((s) => s.deleteTodo)
  const clearDone = useTodoListStore((s) => s.clearDone)
  const retryFailed = useTodoListStore((s) => s.retryFailed)
  const syncFromMarkdown = useTodoListStore((s) => s.syncFromMarkdown)

  const [draft, setDraft] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [replyText, setReplyText] = useState<Record<string, string>>({})

  if (!workdir) {
    return (
      <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
        {t.todolist.noSession}
      </div>
    )
  }

  const submitAdd = (): void => {
    const text = draft.trim()
    if (!text) return
    addTodo(workdir, text)
    setDraft('')
  }

  const commitEdit = (): void => {
    if (editId) editTodo(workdir, editId, editText)
    setEditId(null)
    setEditText('')
  }

  const handleSync = async (): Promise<void> => {
    const res = await window.electronAPI.readTextFile(`${workdir}/.feng-todos.md`)
    if (res.success && res.content !== undefined) {
      syncFromMarkdown(workdir, parseMarkdownTodos(res.content))
    }
  }

  const sendReply = (todoId: string, text: string, question: string | undefined): void => {
    const answer = (replyText[todoId] ?? '').trim()
    if (!answer) return
    void answerTodoClarification(activeSessionId, workdir, todoId, text, question, answer)
    setReplyText((m) => {
      const next = { ...m }
      delete next[todoId]
      return next
    })
  }

  const doneCount = todos.filter((x) => x.status === 'done').length
  const failedCount = todos.filter((x) => x.status === 'failed').length
  const clarifyCount = todos.filter((x) => x.status === 'needs_clarify').length
  const pendingCount = todos.filter((x) => x.status === 'pending').length

  return (
    <div className="flex flex-col h-full">
      {/* Add input */}
      <div className="px-2 pt-2 pb-1 flex gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
          placeholder={t.todolist.placeholder}
          className="flex-1 bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60"
        />
        <button
          onClick={submitAdd}
          className="shrink-0 px-2 rounded text-[11px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
        >
          {t.todolist.add}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 py-1">
        {todos.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {t.todolist.empty}
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-start gap-2 px-3 py-1.5 hover:bg-claude-border/50 rounded group"
            >
              {todo.status === 'failed' ? (
                <button
                  onClick={() => setStatus(workdir, todo.id, 'pending')}
                  title={t.todolist.retryHint}
                  className="mt-0.5 shrink-0 w-3.5 h-3.5 flex items-center justify-center text-[11px] leading-none text-red-400 hover:text-amber-400 transition-colors"
                >
                  ⚠
                </button>
              ) : todo.status === 'needs_clarify' ? (
                <span
                  title={t.todolist.clarifyHint}
                  className="mt-0.5 shrink-0 w-3.5 h-3.5 flex items-center justify-center text-[11px] leading-none text-sky-400"
                >
                  ?
                </span>
              ) : (
                <input
                  type="checkbox"
                  checked={todo.status === 'done'}
                  onChange={() => toggleTodo(workdir, todo.id)}
                  className="mt-0.5 shrink-0 accent-amber-500 cursor-pointer"
                />
              )}
              {editId === todo.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitEdit()
                    } else if (e.key === 'Escape') {
                      setEditId(null)
                      setEditText('')
                    }
                  }}
                  className="flex-1 min-w-0 bg-claude-bg border border-amber-500/60 rounded px-1 py-0.5 text-xs text-claude-text outline-none"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs break-words cursor-text ${
                      todo.status === 'done'
                        ? 'line-through text-claude-muted/60'
                        : todo.status === 'failed'
                          ? 'text-red-300/90'
                          : todo.status === 'needs_clarify'
                            ? 'text-sky-300/90'
                            : 'text-claude-text'
                    }`}
                    onDoubleClick={() => {
                      setEditId(todo.id)
                      setEditText(todo.text)
                    }}
                    title={t.todolist.editHint}
                  >
                    {todo.text}
                  </p>
                  {todo.status === 'failed' && todo.note && (
                    <p className="mt-0.5 text-[10px] text-amber-500/80 break-words leading-snug">
                      ⚠ {todo.note}
                    </p>
                  )}
                  {todo.status === 'needs_clarify' && (
                    <div className="mt-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-1">
                      {todo.note && (
                        <p className="text-[10px] text-sky-300/90 break-words leading-snug">
                          💬 {todo.note}
                        </p>
                      )}
                      <div className="mt-1 flex gap-1">
                        <input
                          type="text"
                          value={replyText[todo.id] ?? ''}
                          onChange={(e) =>
                            setReplyText((m) => ({ ...m, [todo.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              sendReply(todo.id, todo.text, todo.note)
                            }
                          }}
                          placeholder={t.todolist.replyPlaceholder}
                          className="flex-1 min-w-0 bg-claude-bg border border-sky-500/40 rounded px-1.5 py-0.5 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-sky-400/70"
                        />
                        <button
                          onClick={() => sendReply(todo.id, todo.text, todo.note)}
                          title={t.todolist.replySend}
                          className="shrink-0 px-2 rounded text-[10px] bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors"
                        >
                          {t.todolist.replySend}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => deleteTodo(workdir, todo.id)}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-claude-muted hover:text-red-400 transition-all text-xs"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Run with Claude / retry failed */}
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="shrink-0 px-2 pt-1.5 flex gap-1">
          {pendingCount > 0 && (
            <button
              onClick={() => void runTodosForSession(activeSessionId)}
              title={t.todolist.startTitle}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2.5 1.5l6 4-6 4v-8z" fill="currentColor" />
              </svg>
              {t.todolist.start}
            </button>
          )}
          {failedCount > 0 && (
            <button
              onClick={() => {
                retryFailed(workdir)
                void runTodosForSession(activeSessionId)
              }}
              title={t.todolist.retryFailedTitle}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium bg-red-500/12 text-red-400 hover:bg-red-500/22 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M9.5 5.5A4 4 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M8 1v2h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t.todolist.retryFailed}
            </button>
          )}
        </div>
      )}

      {/* Footer tools */}
      {todos.length > 0 && (
        <div className="shrink-0 border-t border-claude-border px-2 py-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-claude-muted">
            {doneCount}/{todos.length}
            {failedCount > 0 && (
              <span className="ml-1.5 text-red-400/80">· {failedCount} {t.todolist.failed}</span>
            )}
            {clarifyCount > 0 && (
              <span className="ml-1.5 text-sky-400/80">· {clarifyCount} {t.todolist.clarify}</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handleSync()}
              title={t.todolist.syncHint}
              className="px-1.5 py-0.5 rounded text-[10px] text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
            >
              {t.todolist.syncFromFile}
            </button>
            {doneCount > 0 && (
              <button
                onClick={() => clearDone(workdir)}
                className="px-1.5 py-0.5 rounded text-[10px] text-claude-muted hover:text-red-400 hover:bg-red-600/15 transition-colors"
              >
                {t.todolist.clearDone}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
