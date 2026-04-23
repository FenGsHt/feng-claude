import type { HistoryRecord, Session } from '../types/session'

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function recordSubtitle(h: HistoryRecord): string | undefined {
  const t = h.topic?.trim()
  if (t) return t
  const l = h.lastUserPrompt?.trim()
  return l || undefined
}

export interface SplitWorkdirItem {
  workdir: string
  /** topic / lastUserPrompt，用于列表主行 */
  subtitle?: string
}

/**
 * 分屏选目录：优先当前已打开会话的 workdir，再合并历史记录（去重保序）。
 */
export function getSplitWorkdirCandidates(
  history: HistoryRecord[],
  sessions: Session[]
): SplitWorkdirItem[] {
  const seen = new Set<string>()
  const out: SplitWorkdirItem[] = []

  function pushWd(wd: string): void {
    const k = normPath(wd)
    if (seen.has(k)) return
    seen.add(k)
    const rec = history.find((h) => normPath(h.workdir) === k)
    const subtitle = rec ? recordSubtitle(rec) : undefined
    out.push({ workdir: wd, subtitle })
  }

  for (const s of sessions) {
    pushWd(s.workdir)
  }
  for (const h of history) {
    pushWd(h.workdir)
  }

  return out
}
