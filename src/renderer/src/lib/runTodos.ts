/** [2026-06-05] 把某个命名清单交给当前会话的 Claude 执行 —— 面板/ pane 头部共用。 */
import { useSessionStore } from '../store/sessionStore'
import { useTodoListStore, todosToMarkdown } from '../store/todoListStore'
import { submitEmbedSessionInput } from '../components/terminal/XTerminal'
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

  // 1) 写入项目文件，供 Claude 执行中重读/勾选；并确保不会被误提交
  await ensureGitignored(workdir, '.feng-todos.md')
  await window.electronAPI.writeTextFile(`${workdir}/.feng-todos.md`, todosToMarkdown(list.items))
  // 记录该 workdir 本次运行的清单，供 idle 自动回读
  useTodoListStore.getState().setLastRun(workdir, listId)

  // 2) 组装 prompt 并自动发送。状态回传靠「回复末尾的状态块」，比让 Claude 编辑文件可靠。
  const lines = pending.map((t) => `- [${t.id}] ${t.text}`).join('\n')
  const prompt =
    `请依次完成下面清单「${list.name}」的待办（每条前方括号里是它的 id）：\n${lines}\n\n` +
    `全部处理完后，必须在回复的最后输出一个状态块，逐项用 id 汇报结果（这是必须的交付物，不要省略）：\n` +
    '```todo-status\n' +
    `<id> = done            # 已完成\n` +
    `<id> = failed: 原因     # 无法完成（受阻/缺前置条件）\n` +
    `<id> = clarify: 疑问    # 需求不清，需要我补充说明\n` +
    '```\n' +
    `只列出上面这些条目，每行一个 id。`
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
  useTodoListStore.getState().setLastRun(workdir, listId)

  const qLine = question ? `你之前的疑问是：${question}\n` : ''
  const prompt =
    `关于待办「${text}」：\n${qLine}用户补充说明：${trimmed}\n` +
    `请据此继续完成该项，完成后在 .feng-todos.md 把它改为 [x]；若仍有疑问可再改为 [?] 并更新 clarify 备注。`
  submitEmbedSessionInput(sessionId, prompt)
  return true
}

/** pane 头部按钮：当前没有清单可运行时打开面板 */
export function openTodoPanel(): void {
  navigateToTodoListTab()
}
