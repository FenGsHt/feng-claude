/** 文件树拖拽到终端时用到的自定义 MIME（另附 application/json / text/plain） */
export const FILE_DRAG_MIME = 'application/x-claude-gui-file'

export interface FileDragPayload {
  path: string
  kind: 'file' | 'directory'
}

/**
 * 将绝对路径格式化为 Claude Code 终端里可用的 @ 文件/目录引用（相对当前会话 cwd 优先）。
 */
export function formatFileRefForClaudeCode(
  absPath: string,
  workDir: string,
  isDirectory: boolean
): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const ap = norm(absPath)
  const wd = norm(workDir)

  let inner: string
  if (!wd) {
    inner = ap
  } else if (ap.toLowerCase() === wd.toLowerCase()) {
    inner = '.'
  } else if (ap.toLowerCase().startsWith(wd.toLowerCase() + '/')) {
    inner = ap.slice(wd.length + 1)
  } else {
    inner = ap
  }

  const suffix = isDirectory && !inner.endsWith('/') ? '/' : ''
  return '@' + inner + suffix
}
