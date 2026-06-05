/** [2026-06-05] 按项目（workdir）隔离的待办清单，可一键交给 Claude 执行。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TodoStatus = 'pending' | 'done' | 'failed' | 'needs_clarify'

export interface TodoItem {
  id: string
  text: string
  status: TodoStatus
  /** failed: 无法完成的原因；needs_clarify: AI 的疑问/澄清请求 */
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
  /** 把所有失败项重置为待办（便于重试） */
  retryFailed: (workdir: string) => void
  /** 用 .feng-todos.md 解析出的清单回写（优先按 id、回退按文本匹配，保守合并） */
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
                t.id === id
                  ? { ...t, status, note: status === 'failed' || status === 'needs_clarify' ? note : undefined }
                  : t
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

      retryFailed: (workdir) =>
        set((s) => {
          const list = s.byWorkdir[workdir]
          if (!list) return {}
          return {
            byWorkdir: {
              ...s.byWorkdir,
              [workdir]: list.map((t) =>
                t.status === 'failed' ? { ...t, status: 'pending' as TodoStatus, note: undefined } : t
              )
            }
          }
        }),

      syncFromMarkdown: (workdir, parsed) =>
        set((s) => {
          if (!workdir) return {}
          const existing = s.byWorkdir[workdir] ?? []
          // 保守合并：优先按 id 匹配（文本被改写也能对上），回退按文本；保留所有 store 项，文件新项才追加。
          // 不删除 store 中、文件里没有的项 —— 避免误删「点击开始后新增、尚未写入文件」的待办。
          const findInFile = (e: TodoItem): TodoItem | undefined =>
            parsed.find((p) => p.id === e.id) ?? parsed.find((p) => p.text === e.text)
          const merged: TodoItem[] = existing.map((e) => {
            const fromFile = findInFile(e)
            return fromFile ? { ...e, status: fromFile.status, note: fromFile.note } : e
          })
          for (const p of parsed) {
            if (!existing.some((e) => e.id === p.id || e.text === p.text)) merged.push(p)
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

// 行尾元数据注释：始终带稳定 id，失败时附原因（id 在前、failed 在末尾以便贪婪匹配原因）
const META_RE = /\s*<!--\s*(.*?)\s*-->\s*$/
// 向后兼容：旧格式 `<!-- failed: 原因 -->`（无 id）
const LEGACY_FAILED_RE = /^(?:failed|失败|原因|reason)\s*[:：]?\s*(.*)$/i

/** TodoItem[] → .feng-todos.md 文本。每行带隐藏 id；失败附原因、需澄清附疑问。 */
export function todosToMarkdown(items: TodoItem[]): string {
  const lines = items.map((t) => {
    const marker =
      t.status === 'done' ? 'x' : t.status === 'failed' ? '!' : t.status === 'needs_clarify' ? '?' : ' '
    let meta = `id:${t.id}`
    if (t.status === 'failed' && t.note) meta += ` failed:${t.note}`
    else if (t.status === 'needs_clarify' && t.note) meta += ` clarify:${t.note}`
    return `- [${marker}] ${t.text} <!-- ${meta} -->`
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
 * 标记：[x]=完成，[!]/[-]=失败，[?]=需澄清，其余=待办。
 * 行尾 `<!-- id:XXX failed:原因 -->` / `<!-- id:XXX clarify:疑问 -->`（或旧的 `<!-- failed:原因 -->`）提取 id 与 note。
 */
export function parseMarkdownTodos(md: string): TodoItem[] {
  const out: TodoItem[] = []
  for (const raw of md.split(/\r?\n/)) {
    const m = raw.match(/^\s*-\s*\[([ xX!?\-])\]\s+(.+?)\s*$/)
    if (!m) continue
    const marker = m[1].toLowerCase()
    let text = m[2]
    let id: string | undefined
    let note: string | undefined

    // 剥离所有行尾 HTML 注释并合并（Claude 可能写成一个或多个注释）
    let meta = ''
    let mm = text.match(META_RE)
    while (mm) {
      meta = `${mm[1]} ${meta}`
      text = text.slice(0, mm.index).trim()
      mm = text.match(META_RE)
    }
    if (meta.trim()) {
      const idM = meta.match(/\bid:(\S+)/)
      if (idM) id = idM[1]
      const noteM = meta.match(/\b(?:failed|clarify)\s*[:：]?\s*(.*)$/i)
      if (noteM) note = noteM[1].trim() || undefined
      // 旧格式：整段就是 failed/原因（无 id）
      if (!idM && !noteM) {
        const legacy = meta.trim().match(LEGACY_FAILED_RE)
        if (legacy) note = legacy[1].trim() || undefined
      }
    }

    const status: TodoStatus =
      marker === 'x' ? 'done' : marker === '!' || marker === '-' ? 'failed' : marker === '?' ? 'needs_clarify' : 'pending'
    out.push({
      id: id ?? genId(),
      text,
      status,
      note: status === 'failed' || status === 'needs_clarify' ? note : undefined,
      createdAt: Date.now()
    })
  }
  return out
}
