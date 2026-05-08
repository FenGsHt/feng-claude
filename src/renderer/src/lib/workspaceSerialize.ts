import type { PaneNode } from '../types/paneLayout'
import type { PersistedPaneNode, PersistedWorkspace } from '../types/workspace'
import { WORKSPACE_VERSION } from '../types/workspace'
import type { Session } from '../types/session'

export function paneNodeToPersisted(root: PaneNode, idToSlot: Map<string, number>): PersistedPaneNode {
  if (root.type === 'leaf') {
    const slot = idToSlot.get(root.sessionId)
    if (slot === undefined) {
      throw new Error(`persist: unknown session id in layout: ${root.sessionId}`)
    }
    return { type: 'leaf', slot }
  }
  return {
    type: 'split',
    dir: root.dir,
    first: paneNodeToPersisted(root.first, idToSlot),
    second: paneNodeToPersisted(root.second, idToSlot)
  }
}

/** 当前 store → 磁盘快照；无会话时返回 null（不写盘或清空） */
export function workspaceToPersisted(
  sessions: Session[],
  layoutRoot: PaneNode | null,
  activeSessionId: string | null
): PersistedWorkspace | null {
  if (sessions.length === 0) return null

  const idToSlot = new Map(sessions.map((s, i) => [s.id, i]))

  let layoutPersisted: PersistedPaneNode
  if (layoutRoot) {
    layoutPersisted = paneNodeToPersisted(layoutRoot, idToSlot)
  } else {
    layoutPersisted = { type: 'leaf', slot: 0 }
  }

  let activeSlotIndex = 0
  if (activeSessionId) {
    const i = idToSlot.get(activeSessionId)
    if (i !== undefined) activeSlotIndex = i
  }

  // [2026-04-28] Collect profileIds for each session (keep all, including nulls)
  const profileIds = sessions.map((s) => s.profileId)
  // [2026-05-06] Persist shellOnly flag
  const shellOnlySlots = sessions.map((s) => !!s.shellOnly)
  // [2026-05-08] Persist per-pane Telegram Channel config so each window keeps its own pairing state.
  const telegramChannelSlots = sessions.map((s) => s.telegramChannel)

  return {
    version: WORKSPACE_VERSION,
    sessionWorkdirs: sessions.map((s) => s.workdir),
    // Only include profileIds if at least one is set
    profileIds: profileIds.some((id) => id != null) ? profileIds as string[] : undefined,
    // Only include shellOnlySlots if at least one session is shell-only
    shellOnlySlots: shellOnlySlots.some(Boolean) ? shellOnlySlots : undefined,
    telegramChannelSlots: telegramChannelSlots.some(Boolean) ? telegramChannelSlots : undefined,
    layoutRoot: layoutPersisted,
    activeSlotIndex
  }
}

export function persistedPaneToLive(root: PersistedPaneNode | null, sessionIds: string[]): PaneNode | null {
  if (!root || sessionIds.length === 0) return null

  function mapNode(node: PersistedPaneNode): PaneNode | null {
    if (node.type === 'leaf') {
      const sid = sessionIds[node.slot]
      if (!sid) return null
      return { type: 'leaf', sessionId: sid }
    }
    const f = mapNode(node.first)
    const s = mapNode(node.second)
    if (!f || !s) return null
    return { type: 'split', dir: node.dir, first: f, second: s }
  }

  return mapNode(root)
}

/** 校验 layout 中 slot 均在 [0, sessionCount) */
export function persistedSlotsValid(layout: PersistedPaneNode | null, sessionCount: number): boolean {
  if (sessionCount <= 0) return false
  if (!layout) return true
  function walk(n: PersistedPaneNode): boolean {
    if (n.type === 'leaf') {
      return Number.isInteger(n.slot) && n.slot >= 0 && n.slot < sessionCount
    }
    return walk(n.first) && walk(n.second)
  }
  return walk(layout)
}

export function parsePersistedWorkspace(raw: unknown): PersistedWorkspace | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<PersistedWorkspace>
  if (o.version !== WORKSPACE_VERSION || !Array.isArray(o.sessionWorkdirs)) return null
  if (o.sessionWorkdirs.some((w) => typeof w !== 'string')) return null
  if (typeof o.activeSlotIndex !== 'number' || o.activeSlotIndex < 0) return null
  if (o.layoutRoot !== null && typeof o.layoutRoot !== 'object') return null
  // [2026-04-28] Validate profileIds if present
  if (o.profileIds !== undefined && Array.isArray(o.profileIds)) {
    if (o.profileIds.some((id) => typeof id !== 'string')) return null
    if (o.profileIds.length !== o.sessionWorkdirs.length) return null
  }
  // [2026-05-06] Validate shellOnlySlots if present
  if (o.shellOnlySlots !== undefined && Array.isArray(o.shellOnlySlots)) {
    if (o.shellOnlySlots.some((v) => typeof v !== 'boolean')) return null
    if (o.shellOnlySlots.length !== o.sessionWorkdirs.length) return null
  }
  // [2026-05-08] Validate Telegram Channel slot configs; token shape is validated only at launch.
  if (o.telegramChannelSlots !== undefined && Array.isArray(o.telegramChannelSlots)) {
    if (o.telegramChannelSlots.length !== o.sessionWorkdirs.length) return null
    for (const cfg of o.telegramChannelSlots) {
      if (cfg === undefined || cfg === null) continue
      if (typeof cfg !== 'object') return null
      const c = cfg as Record<string, unknown>
      if (typeof c.enabled !== 'boolean') return null
      if (c.useGlobalDefault !== undefined && typeof c.useGlobalDefault !== 'boolean') return null
      if (c.botToken !== undefined && typeof c.botToken !== 'string') return null
      if (c.stateDirId !== undefined && typeof c.stateDirId !== 'string') return null
    }
  }
  return o as PersistedWorkspace
}
