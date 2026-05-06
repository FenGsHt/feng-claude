import { create } from 'zustand'

/**
 * [2026-05-06] 根据 PTY 输出中的 CSI 序列推断「备用缓冲区 / 全屏 TUI」（Ink、htop 等常用 ?1049h/l）。
 * 与 xterm 解析并行：仅在渲染进程做轻量扫描，不替代终端仿真。
 */

const ALT_SEQ = /\x1b\[\?(1049|1047)([hl])/g
const MAX_CARRY = 16

const carryBySession = new Map<string, string>()

interface State {
  /** sessionId → 当前处于备用屏（仅存 true，缺省表示否） */
  bySession: Record<string, boolean>
}

export const usePtyAlternateScreenStore = create<State>(() => ({
  bySession: {}
}))

export function feedPtyAlternateScreenFromOutput(sessionId: string, chunk: string): void {
  const prevCarry = carryBySession.get(sessionId) ?? ''
  const full = prevCarry + chunk

  let inAlt = usePtyAlternateScreenStore.getState().bySession[sessionId] === true
  ALT_SEQ.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ALT_SEQ.exec(full)) !== null) {
    inAlt = m[2] === 'h'
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
