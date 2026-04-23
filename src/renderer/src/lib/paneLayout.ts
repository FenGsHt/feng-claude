import type { PaneNode } from '../types/paneLayout'

export function collectLeafSessionIds(node: PaneNode): string[] {
  if (node.type === 'leaf') return [node.sessionId]
  return [...collectLeafSessionIds(node.first), ...collectLeafSessionIds(node.second)]
}

/** 将「当前激活」所在叶子拆成左右或上下两格，右侧/下侧为新 session */
export function replaceLeafWithSplit(
  root: PaneNode,
  targetSessionId: string,
  dir: 'horizontal' | 'vertical',
  newSessionId: string
): PaneNode | null {
  if (root.type === 'leaf') {
    if (root.sessionId !== targetSessionId) return null
    const original: PaneNode = { type: 'leaf', sessionId: targetSessionId }
    const fresh: PaneNode = { type: 'leaf', sessionId: newSessionId }
    return { type: 'split', dir, first: original, second: fresh }
  }
  const tryFirst = replaceLeafWithSplit(root.first, targetSessionId, dir, newSessionId)
  if (tryFirst !== null) {
    return { ...root, first: tryFirst }
  }
  const trySecond = replaceLeafWithSplit(root.second, targetSessionId, dir, newSessionId)
  if (trySecond !== null) {
    return { ...root, second: trySecond }
  }
  return null
}

/** 从布局树去掉某个 session；若一侧为空则抬升另一侧 */
export function removeSessionFromLayout(root: PaneNode, sessionId: string): PaneNode | null {
  if (root.type === 'leaf') {
    return root.sessionId === sessionId ? null : root
  }
  const first = removeSessionFromLayout(root.first, sessionId)
  const second = removeSessionFromLayout(root.second, sessionId)
  if (first === null && second === null) return null
  if (first === null) return second
  if (second === null) return first
  return { ...root, first, second }
}
