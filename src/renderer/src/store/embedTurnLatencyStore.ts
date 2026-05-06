/** [2026-05-06] 外嵌发送时刻戳 → 首条 assistant 转录条目挂上 latencyMs */

const userSentAtBySession = new Map<string, number>()

export function markEmbedUserMessageSent(sessionId: string): void {
  userSentAtBySession.set(sessionId, Date.now())
}

/** 仅第一条 assistant 应调用；取走后删除锚点 */
export function takeFirstAssistantLatencyMs(sessionId: string): number | undefined {
  const t = userSentAtBySession.get(sessionId)
  if (t === undefined) return undefined
  userSentAtBySession.delete(sessionId)
  return Math.max(0, Date.now() - t)
}

export function clearEmbedTurnLatency(sessionId: string): void {
  userSentAtBySession.delete(sessionId)
}
