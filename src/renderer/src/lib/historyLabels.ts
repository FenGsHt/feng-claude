import type { HistoryRecord } from '../types/session'

/** 侧栏/分屏列表主行：手动主题 > 最后一问 > 文件夹标题 */
export function historyRecordPrimaryLabel(r: HistoryRecord): string {
  const topic = r.topic?.trim()
  if (topic) return topic
  const last = r.lastUserPrompt?.trim()
  if (last) return last
  return r.title
}
