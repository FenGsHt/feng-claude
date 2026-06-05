/** [2026-06-05] 全局可复用的命名待办清单：可建多个，每个可独立编辑并一键交给 Claude 执行。 */
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

export interface TodoList {
  id: string
  name: string
  items: TodoItem[]
  createdAt: number
}

interface TodoListStore {
  lists: TodoList[]
  /** workdir → 该目录上次运行的清单 id，用于 idle 时自动回读 .feng-todos.md */
  lastRunByWorkdir: Record<string, string>

  createList: (name: string) => string
  renameList: (listId: string, name: string) => void
  deleteList: (listId: string) => void

  addTodo: (listId: string, text: string) => void
  /** 复选框：pending ↔ done 互切 */
  toggleTodo: (listId: string, itemId: string) => void
  setStatus: (listId: string, itemId: string, status: TodoStatus, note?: string) => void
  editTodo: (listId: string, itemId: string, text: string) => void
  deleteTodo: (listId: string, itemId: string) => void
  /** 清除已完成项（不动失败/需澄清项） */
  clearDone: (listId: string) => void
  /** 把所有失败项重置为待办（便于重试） */
  retryFailed: (listId: string) => void
  /** 把清单内所有项（含已完成）重置为待办（用于整单重跑） */
  resetAll: (listId: string) => void

  setLastRun: (workdir: string, listId: string) => void
  /** 用 .feng-todos.md 解析出的条目回写某清单（优先按 id、回退按文本匹配，保守合并） */
  syncFromMarkdown: (listId: string, parsed: TodoItem[]) => void
}

function genId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

/** 在指定清单上做不可变更新 */
function mapList(
  lists: TodoList[],
  listId: string,
  fn: (list: TodoList) => TodoList
): TodoList[] {
  return lists.map((l) => (l.id === listId ? fn(l) : l))
}

function mapItems(
  lists: TodoList[],
  listId: string,
  fn: (items: TodoItem[]) => TodoItem[]
): TodoList[] {
  return mapList(lists, listId, (l) => ({ ...l, items: fn(l.items) }))
}

export const useTodoListStore = create<TodoListStore>()(
  persist(
    (set) => ({
      lists: [],
      lastRunByWorkdir: {},

      createList: (name) => {
        const id = genId()
        const trimmed = name.trim() || '未命名清单'
        set((s) => ({ lists: [...s.lists, { id, name: trimmed, items: [], createdAt: Date.now() }] }))
        return id
      },

      renameList: (listId, name) =>
        set((s) => {
          const trimmed = name.trim()
          if (!trimmed) return {}
          return { lists: mapList(s.lists, listId, (l) => ({ ...l, name: trimmed })) }
        }),

      deleteList: (listId) => set((s) => ({ lists: s.lists.filter((l) => l.id !== listId) })),

      addTodo: (listId, text) =>
        set((s) => {
          const trimmed = text.trim()
          if (!trimmed) return {}
          return {
            lists: mapItems(s.lists, listId, (items) => [
              ...items,
              { id: genId(), text: trimmed, status: 'pending' as TodoStatus, createdAt: Date.now() }
            ])
          }
        }),

      toggleTodo: (listId, itemId) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) =>
            items.map((t) =>
              t.id === itemId
                ? { ...t, status: t.status === 'done' ? 'pending' : 'done', note: undefined }
                : t
            )
          )
        })),

      setStatus: (listId, itemId, status, note) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) =>
            items.map((t) =>
              t.id === itemId
                ? { ...t, status, note: status === 'failed' || status === 'needs_clarify' ? note : undefined }
                : t
            )
          )
        })),

      editTodo: (listId, itemId, text) =>
        set((s) => {
          const trimmed = text.trim()
          if (!trimmed) return {}
          return {
            lists: mapItems(s.lists, listId, (items) =>
              items.map((t) => (t.id === itemId ? { ...t, text: trimmed } : t))
            )
          }
        }),

      deleteTodo: (listId, itemId) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) => items.filter((t) => t.id !== itemId))
        })),

      clearDone: (listId) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) => items.filter((t) => t.status !== 'done'))
        })),

      retryFailed: (listId) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) =>
            items.map((t) =>
              t.status === 'failed' ? { ...t, status: 'pending' as TodoStatus, note: undefined } : t
            )
          )
        })),

      resetAll: (listId) =>
        set((s) => ({
          lists: mapItems(s.lists, listId, (items) =>
            items.map((t) => ({ ...t, status: 'pending' as TodoStatus, note: undefined }))
          )
        })),

      setLastRun: (workdir, listId) =>
        set((s) => ({ lastRunByWorkdir: { ...s.lastRunByWorkdir, [workdir]: listId } })),

      syncFromMarkdown: (listId, parsed) =>
        set((s) => {
          const findInFile = (e: TodoItem): TodoItem | undefined =>
            parsed.find((p) => p.id === e.id) ?? parsed.find((p) => p.text === e.text)
          return {
            lists: mapItems(s.lists, listId, (existing) => {
              // 保守合并：优先按 id 匹配（文本被改写也能对上），回退按文本；保留所有 store 项，文件新项才追加。
              const merged: TodoItem[] = existing.map((e) => {
                const fromFile = findInFile(e)
                return fromFile ? { ...e, status: fromFile.status, note: fromFile.note } : e
              })
              for (const p of parsed) {
                if (!existing.some((e) => e.id === p.id || e.text === p.text)) merged.push(p)
              }
              return merged
            })
          }
        })
    }),
    {
      name: 'todolist-store',
      version: 3,
      partialize: (s) => ({ lists: s.lists, lastRunByWorkdir: s.lastRunByWorkdir }),
      // v1(done) / v2(byWorkdir + status) → v3(lists)
      migrate: (persisted) => {
        const state = (persisted ?? {}) as {
          lists?: TodoList[]
          byWorkdir?: Record<string, Array<Record<string, unknown>>>
          lastRunByWorkdir?: Record<string, string>
        }
        if (!state.lists && state.byWorkdir) {
          const lists: TodoList[] = []
          for (const wd of Object.keys(state.byWorkdir)) {
            const items = (state.byWorkdir[wd] ?? []).map((t) => ({
              id: (t.id as string) ?? genId(),
              text: (t.text as string) ?? '',
              status: (t.status as TodoStatus) ?? (t.done ? 'done' : 'pending'),
              note: t.note as string | undefined,
              createdAt: (t.createdAt as number) ?? Date.now()
            }))
            const name = wd.split(/[/\\]/).filter(Boolean).pop() ?? wd
            lists.push({ id: genId(), name, items, createdAt: Date.now() })
          }
          state.lists = lists
          delete state.byWorkdir
        }
        if (!state.lists) state.lists = []
        if (!state.lastRunByWorkdir) state.lastRunByWorkdir = {}
        return state as unknown as TodoListStore
      }
    }
  )
)

// 行尾元数据注释：始终带稳定 id，失败/需澄清时附备注（id 在前、failed/clarify 在末尾以便贪婪匹配）
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

/** 解析文件内容后，定位它对应的清单 id：优先 lastRun，其次按条目 id 重叠最多的清单。 */
function resolveListForParsed(workdir: string, parsedIds: Set<string>): string | undefined {
  const store = useTodoListStore.getState()
  const last = store.lastRunByWorkdir[workdir]
  if (last && store.lists.some((l) => l.id === last)) return last
  let best: { id: string; overlap: number } | undefined
  for (const l of store.lists) {
    const overlap = l.items.reduce((n, it) => n + (parsedIds.has(it.id) ? 1 : 0), 0)
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: l.id, overlap }
  }
  return best?.id
}

/**
 * [2026-06-05] 回读 workdir 下 .feng-todos.md，刷新对应清单状态。
 * 不再硬依赖 lastRunByWorkdir：先按它，找不到则按条目 id 重叠定位清单（重启后仍可用）。
 */
export async function syncTodosFromFile(workdir: string): Promise<void> {
  if (!workdir) return
  try {
    const res = await window.electronAPI.readTextFile(`${workdir}/.feng-todos.md`)
    if (!res.success || res.content === undefined) return
    const parsed = parseMarkdownTodos(res.content)
    if (parsed.length === 0) return
    const parsedIds = new Set(parsed.map((p) => p.id))
    const listId = resolveListForParsed(workdir, parsedIds)
    if (listId) useTodoListStore.getState().syncFromMarkdown(listId, parsed)
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
