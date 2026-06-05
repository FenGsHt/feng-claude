import React, { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useTodoListStore, type TodoItem, type TodoList } from '../../store/todoListStore'
import { runTodoList, answerTodoClarification } from '../../lib/runTodos'
import { useI18n } from '../../i18n'

export function TodoListPanel(): React.ReactElement {
  const { t } = useI18n()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeSession = useSessionStore((s) => s.sessions.find((x) => x.id === s.activeSessionId))
  const lists = useTodoListStore((s) => s.lists)
  const createList = useTodoListStore((s) => s.createList)

  const targetName = activeSession
    ? activeSession.title || activeSession.workdir.split(/[/\\]/).filter(Boolean).pop() || activeSession.workdir
    : null

  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const addList = (): void => {
    const name = newName.trim()
    if (!name) return
    const id = createList(name)
    setNewName('')
    setExpanded((m) => ({ ...m, [id]: true }))
  }

  return (
    <div className="flex flex-col h-full">
      {/* New list */}
      <div className="px-2 pt-2 pb-1 flex gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addList()
            }
          }}
          placeholder={t.todolist.newListPlaceholder}
          className="flex-1 bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60"
        />
        <button
          onClick={addList}
          className="shrink-0 px-2 rounded text-[11px] bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
        >
          {t.todolist.newList}
        </button>
      </div>

      {/* 运行目标提示：清单全局通用，运行发给「当前活跃终端」，此处明示避免发错 */}
      <div className="px-2.5 pb-1">
        {targetName ? (
          <p className="text-[10px] text-claude-muted truncate" title={activeSession?.workdir}>
            {t.todolist.runTarget}
            <span className="text-amber-400/90">▶ {targetName}</span>
          </p>
        ) : (
          <p className="text-[10px] text-red-400/80">{t.todolist.noActiveSession}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {lists.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs px-3 text-center">
            {t.todolist.noLists}
          </div>
        ) : (
          lists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              activeSessionId={activeSessionId}
              targetName={targetName}
              expanded={expanded[list.id] ?? false}
              onToggleExpand={() =>
                setExpanded((m) => ({ ...m, [list.id]: !(m[list.id] ?? false) }))
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

function ListCard({
  list,
  activeSessionId,
  targetName,
  expanded,
  onToggleExpand
}: {
  list: TodoList
  activeSessionId: string | null
  targetName: string | null
  expanded: boolean
  onToggleExpand: () => void
}): React.ReactElement {
  const { t } = useI18n()
  const renameList = useTodoListStore((s) => s.renameList)
  const deleteList = useTodoListStore((s) => s.deleteList)
  const addTodo = useTodoListStore((s) => s.addTodo)
  const toggleTodo = useTodoListStore((s) => s.toggleTodo)
  const setStatus = useTodoListStore((s) => s.setStatus)
  const editTodo = useTodoListStore((s) => s.editTodo)
  const deleteTodo = useTodoListStore((s) => s.deleteTodo)
  const clearDone = useTodoListStore((s) => s.clearDone)
  const retryFailed = useTodoListStore((s) => s.retryFailed)
  const resetAll = useTodoListStore((s) => s.resetAll)

  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [nameText, setNameText] = useState(list.name)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [replyText, setReplyText] = useState<Record<string, string>>({})

  const items = list.items
  const doneCount = items.filter((x) => x.status === 'done').length
  const failedCount = items.filter((x) => x.status === 'failed').length
  const clarifyCount = items.filter((x) => x.status === 'needs_clarify').length
  const pendingCount = items.filter((x) => x.status === 'pending').length

  const submitAdd = (): void => {
    const text = draft.trim()
    if (!text) return
    addTodo(list.id, text)
    setDraft('')
  }
  const commitRename = (): void => {
    renameList(list.id, nameText)
    setRenaming(false)
  }
  const commitEdit = (): void => {
    if (editId) editTodo(list.id, editId, editText)
    setEditId(null)
    setEditText('')
  }
  const sendReply = (todoId: string, text: string, question: string | undefined): void => {
    const answer = (replyText[todoId] ?? '').trim()
    if (!answer) return
    void answerTodoClarification(activeSessionId, list.id, todoId, text, question, answer)
    setReplyText((m) => {
      const next = { ...m }
      delete next[todoId]
      return next
    })
  }

  return (
    <div className="mx-1.5 mb-1.5 rounded-lg border border-claude-border bg-claude-bg/40">
      {/* Card header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          onClick={onToggleExpand}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-claude-muted hover:text-claude-text transition-colors"
          title={expanded ? t.todolist.collapse : t.todolist.expand}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            fill="none"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M3 1.5l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {renaming ? (
          <input
            type="text"
            autoFocus
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                setNameText(list.name)
                setRenaming(false)
              }
            }}
            className="flex-1 min-w-0 bg-claude-bg border border-amber-500/60 rounded px-1 py-0.5 text-[12px] text-claude-text outline-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[12px] font-medium text-claude-text cursor-text"
            onClick={onToggleExpand}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setNameText(list.name)
              setRenaming(true)
            }}
            title={t.todolist.renameHint}
          >
            {list.name}
          </span>
        )}

        {/* progress */}
        <span className="shrink-0 text-[10px] text-claude-muted tabular-nums">
          {doneCount}/{items.length}
        </span>

        {/* run pending */}
        {pendingCount > 0 && (
          <button
            onClick={() => void runTodoList(activeSessionId, list.id)}
            title={targetName ? `${t.todolist.startTitle} → ${targetName}` : t.todolist.noActiveSession}
            disabled={!targetName}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
              <path d="M2.5 1.5l6 4-6 4v-8z" fill="currentColor" />
            </svg>
          </button>
        )}
        {/* run all (reset every item to pending, then run) */}
        {items.length > 0 && (
          <button
            onClick={() => {
              resetAll(list.id)
              void runTodoList(activeSessionId, list.id)
            }}
            title={targetName ? `${t.todolist.runAllTitle} → ${targetName}` : t.todolist.noActiveSession}
            disabled={!targetName}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {/* 双三角：全部重跑 */}
            <svg width="11" height="11" viewBox="0 0 12 11" fill="none">
              <path d="M1.5 1.5l4 4-4 4v-8z" fill="currentColor" />
              <path d="M6.5 1.5l4 4-4 4v-8z" fill="currentColor" />
            </svg>
          </button>
        )}
        {/* delete list */}
        <button
          onClick={() => deleteList(list.id)}
          title={t.todolist.deleteList}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-claude-muted hover:bg-red-600/20 hover:text-red-400 transition-colors text-xs"
        >
          ✕
        </button>
      </div>

      {/* status chips when collapsed */}
      {!expanded && (failedCount > 0 || clarifyCount > 0) && (
        <div className="px-2 pb-1.5 -mt-0.5 flex gap-1.5 text-[10px]">
          {failedCount > 0 && <span className="text-red-400/80">⚠ {failedCount} {t.todolist.failed}</span>}
          {clarifyCount > 0 && <span className="text-sky-400/80">? {clarifyCount} {t.todolist.clarify}</span>}
        </div>
      )}

      {/* Card body */}
      {expanded && (
        <div className="border-t border-claude-border/60">
          {/* add item */}
          <div className="px-2 py-1.5 flex gap-1">
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

          {/* items */}
          <div className="flex flex-col gap-0.5 pb-1">
            {items.length === 0 ? (
              <div className="flex items-center justify-center py-3 text-claude-muted text-[11px]">
                {t.todolist.empty}
              </div>
            ) : (
              items.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  editing={editId === todo.id}
                  editText={editText}
                  replyValue={replyText[todo.id] ?? ''}
                  onToggle={() => toggleTodo(list.id, todo.id)}
                  onResetPending={() => setStatus(list.id, todo.id, 'pending')}
                  onStartEdit={() => {
                    setEditId(todo.id)
                    setEditText(todo.text)
                  }}
                  onEditChange={setEditText}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => {
                    setEditId(null)
                    setEditText('')
                  }}
                  onDelete={() => deleteTodo(list.id, todo.id)}
                  onReplyChange={(v) => setReplyText((m) => ({ ...m, [todo.id]: v }))}
                  onReplySend={() => sendReply(todo.id, todo.text, todo.note)}
                />
              ))
            )}
          </div>

          {/* footer tools */}
          {items.length > 0 && (
            <div className="border-t border-claude-border/60 px-2 py-1 flex items-center justify-between gap-2">
              <span className="text-[10px] text-claude-muted">
                {failedCount > 0 && <span className="text-red-400/80">⚠ {failedCount} </span>}
                {clarifyCount > 0 && <span className="text-sky-400/80">? {clarifyCount}</span>}
              </span>
              <div className="flex items-center gap-1">
                {failedCount > 0 && (
                  <button
                    onClick={() => {
                      retryFailed(list.id)
                      void runTodoList(activeSessionId, list.id)
                    }}
                    title={t.todolist.retryFailedTitle}
                    className="px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/15 transition-colors"
                  >
                    {t.todolist.retryFailed}
                  </button>
                )}
                {doneCount > 0 && (
                  <button
                    onClick={() => clearDone(list.id)}
                    className="px-1.5 py-0.5 rounded text-[10px] text-claude-muted hover:text-red-400 hover:bg-red-600/15 transition-colors"
                  >
                    {t.todolist.clearDone}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TodoRow({
  todo,
  editing,
  editText,
  replyValue,
  onToggle,
  onResetPending,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onReplyChange,
  onReplySend
}: {
  todo: TodoItem
  editing: boolean
  editText: string
  replyValue: string
  onToggle: () => void
  onResetPending: () => void
  onStartEdit: () => void
  onEditChange: (v: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onReplyChange: (v: string) => void
  onReplySend: () => void
}): React.ReactElement {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-2 px-3 py-1 hover:bg-claude-border/40 group">
      {todo.status === 'failed' ? (
        <button
          onClick={onResetPending}
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
          onChange={onToggle}
          className="mt-0.5 shrink-0 accent-amber-500 cursor-pointer"
        />
      )}

      {editing ? (
        <input
          type="text"
          autoFocus
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommitEdit()
            } else if (e.key === 'Escape') {
              onCancelEdit()
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
            onDoubleClick={onStartEdit}
            title={t.todolist.editHint}
          >
            {todo.text}
          </p>
          {todo.status === 'failed' && todo.note && (
            <p className="mt-0.5 text-[10px] text-amber-500/80 break-words leading-snug">⚠ {todo.note}</p>
          )}
          {todo.status === 'needs_clarify' && (
            <div className="mt-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-1">
              {todo.note && (
                <p className="text-[10px] text-sky-300/90 break-words leading-snug">💬 {todo.note}</p>
              )}
              <div className="mt-1 flex gap-1">
                <input
                  type="text"
                  value={replyValue}
                  onChange={(e) => onReplyChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onReplySend()
                    }
                  }}
                  placeholder={t.todolist.replyPlaceholder}
                  className="flex-1 min-w-0 bg-claude-bg border border-sky-500/40 rounded px-1.5 py-0.5 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-sky-400/70"
                />
                <button
                  onClick={onReplySend}
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
        onClick={onDelete}
        className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-claude-muted hover:text-red-400 transition-all text-xs"
      >
        ✕
      </button>
    </div>
  )
}
