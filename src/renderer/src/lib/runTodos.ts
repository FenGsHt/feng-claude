/** [2026-06-05] 把某个命名清单交给当前会话的 Claude 执行 —— 面板/ pane 头部共用。 */
import { useSessionStore } from '../store/sessionStore'
import { useTodoListStore, todosToMarkdown } from '../store/todoListStore'
import { submitEmbedSessionInput } from '../components/terminal/terminalRuntime'
import { navigateToTodoListTab } from '../components/sidebar/sidebarNav'

/** 确保 workdir/.gitignore 含某条目，缺失则追加（不存在则创建）。避免 .feng-todos.md 被误提交。 */
async function ensureGitignored(workdir: string, entry: string): Promise<void> {
  const path = `${workdir}/.gitignore`
  try {
    const res = await window.electronAPI.readTextFile(path)
    const existing = res.success && res.content !== undefined ? res.content : ''
    const has = existing.split(/\r?\n/).some((l) => l.trim() === entry)
    if (has) return
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    await window.electronAPI.writeTextFile(path, `${existing}${sep}${entry}\n`)
  } catch {
    /* 读写失败（无权限等）：忽略，不阻塞主流程 */
  }
}

/** 解析当前活跃会话的 workdir（无会话返回 null） */
function activeWorkdir(sessionId: string | null | undefined): string | null {
  const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
  return session?.workdir ?? null
}

/**
 * 把指定清单的未完成待办写入当前会话项目的 .feng-todos.md 并自动发送给 Claude。
 * 无会话 / 无待办时返回 false（不发送）。
 */
export async function runTodoList(
  sessionId: string | null | undefined,
  listId: string
): Promise<boolean> {
  const workdir = activeWorkdir(sessionId)
  const list = useTodoListStore.getState().lists.find((l) => l.id === listId)
  if (!sessionId || !workdir || !list) return false
  const pending = list.items.filter((t) => t.status === 'pending')
  if (pending.length === 0) return false

  // 1) 写入项目文件作为兼容兜底；并确保不会被误提交
  await ensureGitignored(workdir, '.feng-todos.md')
  await window.electronAPI.writeTextFile(`${workdir}/.feng-todos.md`, todosToMarkdown(list.items))
  // 记录本次运行清单 + 发给 Claude 的有序 id（序号→id 映射，供解析状态块）
  useTodoListStore.getState().setLastRun(workdir, listId, pending.map((t) => t.id))

  // 2) 组装 prompt 并自动发送。用「序号」而非内部 id，避免 Claude 把 id 当成任务系统的 ID 去查找。
  const lines = pending.map((t, i) => `${i + 1}. ${t.text}`).join('\n')
  const prompt =
    `请依次完成下面清单「${list.name}」的待办：\n${lines}\n\n` +
    `全部处理完后，必须在回复的最后输出一个状态块，按上面的序号逐项汇报结果（这是必须的交付物，不要省略；序号只是行号，不要当作任何系统里的 ID）：\n` +
    '```todo-status\n' +
    `1 = done            # 已完成\n` +
    `2 = failed: 原因     # 无法完成（受阻/缺前置条件）\n` +
    `3 = clarify: 疑问    # 需求不清，需要我补充说明\n` +
    '```\n' +
    `每行一个序号，只列出上面这些条目。`
  submitEmbedSessionInput(sessionId, prompt)
  return true
}

/**
 * 用户对某条「需澄清」待办补充说明后：把该项重置为待办、回写文件，并把
 * 「原待办 + AI 疑问 + 用户答复」组装成 prompt 发回当前会话让 Claude 继续。
 */
export async function answerTodoClarification(
  sessionId: string | null | undefined,
  listId: string,
  todoId: string,
  text: string,
  question: string | undefined,
  answer: string
): Promise<boolean> {
  const trimmed = answer.trim()
  const workdir = activeWorkdir(sessionId)
  if (!sessionId || !workdir || !trimmed) return false
  // 重置为待办（清掉疑问），并回写文件
  useTodoListStore.getState().setStatus(listId, todoId, 'pending')
  const list = useTodoListStore.getState().lists.find((l) => l.id === listId)
  if (!list) return false
  await ensureGitignored(workdir, '.feng-todos.md')
  await window.electronAPI.writeTextFile(`${workdir}/.feng-todos.md`, todosToMarkdown(list.items))
  // 本次只涉及这一条：序号 1 → 该条目 id
  useTodoListStore.getState().setLastRun(workdir, listId, [todoId])

  const qLine = question ? `你之前的疑问是：${question}\n` : ''
  const prompt =
    `关于待办「${text}」：\n${qLine}用户补充说明：${trimmed}\n` +
    `请据此继续完成该项。完成后在回复末尾输出状态块汇报结果：\n` +
    '```todo-status\n' +
    `1 = done            # 已完成\n` +
    `1 = clarify: 疑问    # 仍需澄清\n` +
    '```\n' +
    `（序号 1 即这条；只输出一行。）`
  submitEmbedSessionInput(sessionId, prompt)
  return true
}

/** pane 头部按钮：当前没有清单可运行时打开面板 */
export function openTodoPanel(): void {
  navigateToTodoListTab()
}
