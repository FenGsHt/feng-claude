import { create } from 'zustand'

/**
 * [2026-05-06] 根据 PTY 输出中的 CSI 序列推断「备用缓冲区 / 全屏 TUI」（Ink、htop 等常用 ?1049h/l）。
 * 与 xterm 解析并行：仅在渲染进程做轻量扫描，不替代终端仿真。
 *
 * [2026-05-12] 增加 idle 后宽限期（IDLE_GRACE_MS）：idle 事件与后续 PTY_OUTPUT chunk 在不同 IPC
 * 通道发送，渲染端收到顺序无保证。部分项目（如含失败 MCP 服务器的项目）在 idle 之后仍有延迟输出
 * 包含 ?1049h，导致备用屏标志误置 true、外嵌输入被永久阻断。宽限期内收到 ?1049h 视作启动噪声丢弃。
 */

const ALT_SEQ = /\x1b\[\?(1049|1047)([hl])/g
const MAX_CARRY = 16
/** idle 后多少毫秒内的 ?1049h 视作启动噪声，不触发备用屏锁定 */
const IDLE_GRACE_MS = 1500

const carryBySession = new Map<string, string>()
/** 最近一次收到 idle 的时间戳 */
const lastIdleAtBySession = new Map<string, number>()

interface State {
  /** sessionId → 当前处于备用屏（仅存 true，缺省表示否） */
  bySession: Record<string, boolean>
}

export const usePtyAlternateScreenStore = create<State>(() => ({
  bySession: {}
}))

/** [2026-05-12] 由 usePty.ts 在收到 idle 时调用，开启宽限期 */
export function markPtySessionIdle(sessionId: string): void {
  lastIdleAtBySession.set(sessionId, Date.now())
}

export function feedPtyAlternateScreenFromOutput(sessionId: string, chunk: string): void {
  const prevCarry = carryBySession.get(sessionId) ?? ''
  const full = prevCarry + chunk

  let inAlt = usePtyAlternateScreenStore.getState().bySession[sessionId] === true
  ALT_SEQ.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ALT_SEQ.exec(full)) !== null) {
    const entering = m[2] === 'h'
    if (entering) {
      // [2026-05-12] idle 宽限期内的 ?1049h 视作启动噪声，不触发锁定
      const idleAt = lastIdleAtBySession.get(sessionId)
      if (idleAt !== undefined && Date.now() - idleAt < IDLE_GRACE_MS) continue
    }
    inAlt = entering
  }

  const lastEsc = full.lastIndexOf('\x1b')
  let newCarry = ''
  if (lastEsc >= 0) {
    const tail = full.slice(lastEsc)
    if (!/\x1b\[\?(?:1049|1047)[hl]$/.test(tail) && tail.length <= MAX_CARRY) {
      newCarry = tail
    }
  }
  carryBySession.set(sessionId, newCarry)

  const wasAlt = usePtyAlternateScreenStore.getState().bySession[sessionId] === true
  if (inAlt === wasAlt) return

  usePtyAlternateScreenStore.setState((s) => {
    const next = { ...s.bySession }
    if (inAlt) next[sessionId] = true
    else delete next[sessionId]
    return { bySession: next }
  })
}

export function clearPtyAlternateScreenSession(sessionId: string): void {
  lastIdleAtBySession.delete(sessionId)
  carryBySession.delete(sessionId)
  usePtyAlternateScreenStore.setState((s) => {
    if (!(sessionId in s.bySession)) return s
    const next = { ...s.bySession }
    delete next[sessionId]
    return { bySession: next }
  })
}

export function isPtyAlternateScreenActive(sessionId: string): boolean {
  return usePtyAlternateScreenStore.getState().bySession[sessionId] === true
}
