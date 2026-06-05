/** [2026-06-05] 把指定会话项目的待办交给 Claude 执行 —— 标题栏/面板/pane 头部共用。 */
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

/**
 * 把指定会话所属项目的未完成待办写入 .feng-todos.md 并自动发送给 Claude。
 * 无会话 / 无待办时改为打开待办面板，返回 false。
 */
export async function runTodosForSession(sessionId: string | null | undefined): Promise<boolean> {
  const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
  if (!sessionId || !session) {
    navigateToTodoListTab()
    return false
  }
  const workdir = session.workdir
  const all = useTodoListStore.getState().byWorkdir[workdir] ?? []
  const pending = all.filter((t) => t.status === 'pending')
  if (pending.length === 0) {
    navigateToTodoListTab()
    return false
  }
  // 1) 写入项目文件，供 Claude 执行中重读/勾选；并确保不会被误提交进用户仓库
  await ensureGitignored(workdir, '.feng-todos.md')
  await window.electronAPI.writeTextFile(`${workdir}/.feng-todos.md`, todosToMarkdown(all))
  // 2) 组装 prompt 并自动发送
  const list = pending.map((t, i) => `${i + 1}. ${t.text}`).join('\n')
  const prompt =
    `请依次完成下面的待办清单，并在 .feng-todos.md 中实时更新每项状态：\n` +
    `- 完成：把该行的 [ ] 改为 [x]\n` +
    `- 无法完成（受阻/缺前置条件）：把 [ ] 改为 [!]，并在该行已有的 \`<!-- id:... -->\` 注释里追加 \` failed:简短原因\`（例如 \`<!-- id:abc failed:缺少生产环境凭证 -->\`）\n` +
    `保持每行的文本和 \`<!-- id:... -->\` 注释不变，只改状态标记和追加原因，不要删除任何条目。\n\n` +
    `待办清单（也已写入 @.feng-todos.md）：\n${list}`
  submitEmbedSessionInput(sessionId, prompt)
  return true
}
