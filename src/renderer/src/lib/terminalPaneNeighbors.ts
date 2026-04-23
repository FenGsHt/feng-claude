/** 用于 querySelector，标记每个可聚焦终端窗格（与 Alt+方向键切换焦点一致） */
export const TERMINAL_PANE_ATTR = 'data-terminal-pane'

export type PaneDirection = 'left' | 'right' | 'up' | 'down'

interface PaneGeom {
  id: string
  rect: DOMRect
  cx: number
  cy: number
}

function collectPaneGeoms(): PaneGeom[] {
  const nodes = document.querySelectorAll<HTMLElement>(`[${TERMINAL_PANE_ATTR}]`)
  const out: PaneGeom[] = []
  for (const el of nodes) {
    const id = el.getAttribute(TERMINAL_PANE_ATTR)
    if (!id) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    out.push({
      id,
      rect,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2
    })
  }
  return out
}

function perpendicularOverlap(a: DOMRect, b: DOMRect, dir: PaneDirection): number {
  if (dir === 'left' || dir === 'right') {
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  }
  return Math.min(a.right, b.right) - Math.max(a.left, b.left)
}

function isInDirection(dx: number, dy: number, dir: PaneDirection): boolean {
  const eps = 2
  switch (dir) {
    case 'left':
      return dx < -eps
    case 'right':
      return dx > eps
    case 'up':
      return dy < -eps
    case 'down':
      return dy > eps
    default:
      return false
  }
}

/**
 * 根据窗格屏幕矩形找「该方向上」最近的相邻会话（优先垂轴有重叠，避免斜错格误跳）。
 */
export function findNeighborSessionId(activeId: string, dir: PaneDirection): string | null {
  const items = collectPaneGeoms()
  if (items.length < 2) return null

  const active = items.find((x) => x.id === activeId)
  if (!active) return null

  const PENALTY_NO_OVERLAP = 1e12

  const scoreCandidate = (cand: PaneGeom): number => {
    const dx = cand.cx - active.cx
    const dy = cand.cy - active.cy
    if (!isInDirection(dx, dy, dir)) return Infinity
    const overlap = perpendicularOverlap(active.rect, cand.rect, dir)
    const distSq = dx * dx + dy * dy
    const penalty = overlap <= 0 ? PENALTY_NO_OVERLAP : 0
    return distSq + penalty
  }

  let bestId: string | null = null
  let bestScore = Infinity

  for (const cand of items) {
    if (cand.id === activeId) continue
    const s = scoreCandidate(cand)
    if (s < bestScore) {
      bestScore = s
      bestId = cand.id
    }
  }

  if (bestId !== null && bestScore < Infinity) return bestId

  // 无垂轴重叠时的兜底：仍在该扇区内取最近中心点
  bestId = null
  bestScore = Infinity
  for (const cand of items) {
    if (cand.id === activeId) continue
    const dx = cand.cx - active.cx
    const dy = cand.cy - active.cy
    if (!isInDirection(dx, dy, dir)) continue
    const distSq = dx * dx + dy * dy
    if (distSq < bestScore) {
      bestScore = distSq
      bestId = cand.id
    }
  }

  return bestId
}
