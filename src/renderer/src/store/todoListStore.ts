/** [2026-06-05] 按项目（workdir）隔离的待办清单，可一键交给 Claude 执行。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TodoStatus = 'pending' | 'done' | 'failed'

export interface TodoItem {
  id: string
  text: string
  status: TodoStatus
  /** 无法完成时的原因（status==='failed' 时有意义） */
  note?: string
  createdAt: number
}

interface TodoListStore {
  byWorkdir: Record<string, TodoItem[]>
  addTodo: (workdir: string, text: string) => void
  /** 复选框：pending ↔ done 互切（失败项点一下回到 pending 以便重试） */
  toggleTodo: (workdir: string, id: string) => void
  setStatus: (workdir: string, id: string, status: TodoStatus, note?: string) => void
  editTodo: (workdir: string, id: string, text: string) => void
  deleteTodo: (workdir: string, id: string) => void
  /** 清除已完成项（不动失败项） */
  clearDone: (workdir: string) => void
  /** 用 .feng-todos.md 解析出的清单回写（按文本匹配更新状态/原因，保守合并） */
  syncFromMarkdown: (workdir: string, parsed: TodoItem[]) => void
}

function genId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export const useTodoListStore = create<TodoListStore>()(
  persist(
    (set) => ({
      byWorkdir: {},

      addTodo: (workdir, text) =>
        set((s) => {
          const trimmed = text.trim()
          if (!workdir || !trimmed) return {}
          const list = s.byWorkdir[workdir] ?? []
          return {
            byWorkdir: {
              ...s.byWorkdir,
              [workdir]: [...list, { id: genId(), text: trimmed, status: 'pending' as TodoStatus, createdAt: Date.now() }]
            }
          }
        }),

      toggleTodo: (workdir, id) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          return {
            byWorkdir: {
              ...s.byWorkdir,
              [workdir]: list.map((t) =>
                t.id === id
                  ? { ...t, status: t.status === 'done' ? 'pending' : 'done', note: undefined }
                  : t
              )
            }
          }
        }),

      setStatus: (workdir, id, status, note) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          return {
            byWorkdir: {
              ...s.byWorkdir,
              [workdir]: list.map((t) =>
                t.id === id ? { ...t, status, note: status === 'failed' ? note : undefined } : t
              )
            }
          }
        }),

      editTodo: (workdir, id, text) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          const trimmed = text.trim()
          if (!trimmed) return {}
          return {
            byWorkdir: {
              ...s.byWorkdir,
              [workdir]: list.map((t) => (t.id === id ? { ...t, text: trimmed } : t))
            }
          }
        }),

      deleteTodo: (workdir, id) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          return {
            byWorkdir: { ...s.byWorkdir, [workdir]: list.filter((t) => t.id !== id) }
          }
        }),

      clearDone: (workdir) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          return {
            byWorkdir: { ...s.byWorkdir, [workdir]: list.filter((t) => t.status !== 'done') }
          }
        }),

      syncFromMarkdown: (workdir, parsed) =>
        set((s) => {
          if (!workdir) return {}
          const existing = s.byWorkdir[workdir] ?? []
          // 保守合并：保留所有 store 项（按文本更新状态/原因），文件里的新项才追加。
          // 不删除 store 中、文件里没有的项 —— 避免误删「点击开始后新增、尚未写入文件」的待办。
          const merged: TodoItem[] = existing.map((e) => {
            const fromFile = parsed.find((p) => p.text === e.text)
            return fromFile ? { ...e, status: fromFile.status, note: fromFile.note } : e
          })
          for (const p of parsed) {
            if (!existing.some((e) => e.text === p.text)) merged.push(p)
          }
          return { byWorkdir: { ...s.byWorkdir, [workdir]: merged } }
        })
    }),
    {
      name: 'todolist-store',
      version: 2,
      partialize: (s) => ({ byWorkdir: s.byWorkdir }),
      // v1(done:boolean) → v2(status/note)
      migrate: (persisted) => {
        const state = persisted as { byWorkdir?: Record<string, Array<Record<string, unknown>>> }
        if (state?.byWorkdir) {
          for (const wd of Object.keys(state.byWorkdir)) {
            state.byWorkdir[wd] = (state.byWorkdir[wd] ?? []).map((t) => ({
              id: (t.id as string) ?? genId(),
              text: (t.text as string) ?? '',
              status: (t.status as TodoStatus) ?? (t.done ? 'done' : 'pending'),
              note: t.note as string | undefined,
              createdAt: (t.createdAt as number) ?? Date.now()
            }))
          }
        }
        return state as unknown as TodoListStore
      }
    }
  )
)

const FAILED_RE = /\s*<!--\s*(?:failed|失败|原因|reason)\s*[:：]?\s*(.*?)\s*-->\s*$/i

/** TodoItem[] → .feng-todos.md 文本。失败项用 `[!]` + 行尾 HTML 注释记录原因。 */
export function todosToMarkdown(items: TodoItem[]): string {
  const lines = items.map((t) => {
    const marker = t.status === 'done' ? 'x' : t.status === 'failed' ? '!' : ' '
    const note = t.status === 'failed' && t.note ? ` <!-- failed: ${t.note} -->` : ''
    return `- [${marker}] ${t.text}${note}`
  })
  return `# Todo List\n\n${lines.join('\n')}\n`
}

/**
 * [2026-06-05] 从项目根的 .feng-todos.md 回读状态到 store。
 * 仅在该项目已有待办时才读盘（避免每次 idle 都无谓读文件）。
 */
export async function syncTodosFromFile(workdir: string): Promise<void> {
  if (!workdir) return
  const store = useTodoListStore.getState()
  if ((store.byWorkdir[workdir] ?? []).length === 0) return
  try {
    const res = await window.electronAPI.readTextFile(`${workdir}/.feng-todos.md`)
    if (res.success && res.content !== undefined) {
      store.syncFromMarkdown(workdir, parseMarkdownTodos(res.content))
    }
  } catch {
    /* 文件不存在或读取失败：忽略 */
  }
}

/**
 * .feng-todos.md 文本 → TodoItem[]。
 * 解析 `- [ ]/[x]/[!]/[-]` 行；`!`、`-` 均视为失败，行尾 `<!-- failed: 原因 -->` 提取为 note。
 */
export function parseMarkdownTodos(md: string): TodoItem[] {
  const out: TodoItem[] = []
  for (const raw of md.split(/\r?\n/)) {
    const m = raw.match(/^\s*-\s*\[([ xX!\-])\]\s+(.+?)\s*$/)
    if (!m) continue
    const marker = m[1].toLowerCase()
    let text = m[2]
    let note: string | undefined
    const fm = text.match(FAILED_RE)
    if (fm) {
      note = fm[1] || undefined
      text = text.replace(FAILED_RE, '').trim()
    }
    const status: TodoStatus = marker === 'x' ? 'done' : marker === '!' || marker === '-' ? 'failed' : 'pending'
    out.push({ id: genId(), text, status, note, createdAt: Date.now() })
  }
  return out
}
