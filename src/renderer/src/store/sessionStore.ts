import { create } from 'zustand'
import type { Session, HistoryRecord } from '../types/session'
import type { PaneNode, CreateSessionMode } from '../types/paneLayout'
import {
  collectLeafSessionIds,
  removeSessionFromLayout,
  replaceLeafWithSplit
} from '../lib/paneLayout'
import { destroyTerminal } from '../components/terminal/XTerminal'
import { useTokenUsageStore } from './tokenUsageStore'
import { clearTokenUsageBuffer, resetAllTokenUsageParsing } from '../lib/claudeTokenUsageParse'
import type { PersistedWorkspace } from '../types/workspace'
import { persistedPaneToLive, persistedSlotsValid } from '../lib/workspaceSerialize'

/** Debounce timers for notifyTerminalCommittedLine — avoids concurrent history writes per session */
const notifyDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 自动记录时跳过无信息量的单行（与 shell 噪音区分） */
const SKIP_TERMINAL_LINES = new Set(['claude', 'clear', 'exit', 'cls'])

function normalizeCommittedTerminalLine(raw: string): string | null {
  const s0 = raw.replace(/\r/g, '').trim()
  if (!s0) return null
  const capped = s0.length > 200 ? s0.slice(0, 200) : s0
  const lower = capped.toLowerCase()
  if (SKIP_TERMINAL_LINES.has(lower)) return null
  return capped
}

/* [2026-04-23] 原 upsert 未保留 topic/lastUserPrompt，重写为可选覆盖 lastUserPrompt、其余字段从 prev 合并
async function upsertWorkdirHistory(session: Pick<Session, 'title' | 'workdir'>): Promise<void> {
  const hid = `wd:${session.workdir.replace(/\\/g, '/').toLowerCase()}`
  const prev = await window.electronAPI.history.get(hid)
  const now = Date.now()
  await window.electronAPI.history.save({
    id: hid,
    title: session.title,
    workdir: session.workdir,
    messages: prev?.messages ?? [],
    createdAt: prev?.createdAt ?? now,
    updatedAt: now
  })
}
*/
/** [2026-04-23] 将工作目录同步到 electron-store；合并 topic、lastUserPrompt */
async function upsertWorkdirHistory(
  session: Pick<Session, 'title' | 'workdir'>,
  opts?: { lastUserPrompt?: string }
): Promise<void> {
  const hid = `wd:${session.workdir.replace(/\\/g, '/').toLowerCase()}`
  const prev = await window.electronAPI.history.get(hid)
  const now = Date.now()
  await window.electronAPI.history.save({
    id: hid,
    title: session.title,
    workdir: session.workdir,
    messages: prev?.messages ?? [],
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    topic: prev?.topic,
    lastUserPrompt: opts?.lastUserPrompt ?? prev?.lastUserPrompt
  })
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  /** [2026-04-23] 主区域多分屏布局；与 tabs 中 session 对应，切换 tab 到未入屏会话时会暂退为单屏 */
  layoutRoot: PaneNode | null
  history: HistoryRecord[]

  /**
   * @param splitFromSessionId 分屏时从该 session 所在格拆出；缺省则使用当前 active（与点哪个窗格上的分屏一致）
   */
  createSession: (workdir: string, mode?: CreateSessionMode, splitFromSessionId?: string) => Promise<void>
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void

  updateSessionStatus: (sessionId: string, status: Session['status']) => void

  loadHistory: () => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  /** History 面板：在新标签打开该历史条目的工作目录 */
  restoreFromHistory: (record: HistoryRecord) => Promise<void>

  /** 终端提交完整一行后更新 lastUserPrompt（经规范化过滤） */
  notifyTerminalCommittedLine: (sessionId: string, rawLine: string) => void
  /** 侧栏右键：保存/清除自定义主题 */
  updateHistoryTopic: (recordId: string, topic: string | null) => Promise<void>

  /** 从磁盘快照恢复：按顺序建 PTY，再按 slot 还原分屏与 active */
  restoreWorkspace: (pw: PersistedWorkspace) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  layoutRoot: null,
  history: [],

  createSession: async (
    workdir: string,
    mode: CreateSessionMode = 'fullscreen',
    splitFromSessionId?: string
  ) => {
    /* [2026-04-23] 原先分屏时用「锚点 session 的 workdir」覆盖入参 workdir，导致用户在分屏对话框里选的目录/
     * 「其他文件夹」始终被忽略，PTY 永远在旧目录创建。
     * 正确行为：始终以调用方传入的 workdir 作为会话目录（分屏仅从 splitFromSessionId 决定插入位置）。
     */
    const cwd = workdir

    const result = await window.electronAPI.createSession(cwd)
    const newSession: Session = {
      id: result.sessionId,
      title: cwd.split(/[/\\]/).pop() ?? cwd,
      workdir: cwd,
      status: 'running',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ptyPid: result.pid
    }

    set((s) => {
      let layoutRoot = s.layoutRoot

      if (mode === 'fullscreen') {
        layoutRoot = { type: 'leaf', sessionId: result.sessionId }
      } else if (!layoutRoot) {
        layoutRoot = { type: 'leaf', sessionId: result.sessionId }
      } else if (mode === 'split-right') {
        const anchor = splitFromSessionId ?? s.activeSessionId
        if (anchor) {
          layoutRoot =
            replaceLeafWithSplit(layoutRoot, anchor, 'horizontal', result.sessionId) ??
            ({ type: 'leaf', sessionId: result.sessionId } satisfies PaneNode)
        }
      } else if (mode === 'split-down') {
        const anchor = splitFromSessionId ?? s.activeSessionId
        if (anchor) {
          layoutRoot =
            replaceLeafWithSplit(layoutRoot, anchor, 'vertical', result.sessionId) ??
            ({ type: 'leaf', sessionId: result.sessionId } satisfies PaneNode)
        }
      }

      return {
        sessions: [...s.sessions, newSession],
        activeSessionId: result.sessionId,
        layoutRoot
      }
    })

    await upsertWorkdirHistory(newSession)
    await get().loadHistory()
  },

  closeSession: (id: string) => {
    destroyTerminal(id)
    clearTokenUsageBuffer(id)
    useTokenUsageStore.getState().clearSession(id)
    window.electronAPI.closeSession(id)
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id)
      let layoutRoot = s.layoutRoot ? removeSessionFromLayout(s.layoutRoot, id) : null
      if (layoutRoot === null && remaining.length > 0) {
        layoutRoot = { type: 'leaf', sessionId: remaining[remaining.length - 1].id }
      }

      const newActive =
        s.activeSessionId === id
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s.activeSessionId

      return { sessions: remaining, activeSessionId: newActive, layoutRoot }
    })
  },

  setActiveSession: (id: string) => {
    set((s) => {
      const ids = s.layoutRoot ? collectLeafSessionIds(s.layoutRoot) : []
      if (!s.layoutRoot || !ids.includes(id)) {
        return {
          activeSessionId: id,
          layoutRoot: { type: 'leaf', sessionId: id }
        }
      }
      return { activeSessionId: id }
    })
  },

  updateSessionStatus: (sessionId: string, status: Session['status']) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, status } : sess
      )
    }))
  },

  loadHistory: async () => {
    const records = await window.electronAPI.history.list()
    set({ history: records ?? [] })
  },

  deleteHistory: async (id: string) => {
    await window.electronAPI.history.delete(id)
    set((s) => ({ history: s.history.filter((r) => r.id !== id) }))
  },

  restoreFromHistory: async (record: HistoryRecord) => {
    await get().createSession(record.workdir, 'fullscreen')
  },

  notifyTerminalCommittedLine: (sessionId: string, rawLine: string) => {
    const line = normalizeCommittedTerminalLine(rawLine)
    if (!line) return
    // Debounce: rapid terminal lines collapse into one write per 400 ms,
    // preventing concurrent get→merge→save races on the history store.
    const prev = notifyDebounceTimers.get(sessionId)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(async () => {
      notifyDebounceTimers.delete(sessionId)
      const sess = get().sessions.find((s) => s.id === sessionId)
      if (!sess) return
      await upsertWorkdirHistory(sess, { lastUserPrompt: line })
      await get().loadHistory()
    }, 400)
    notifyDebounceTimers.set(sessionId, timer)
  },

  updateHistoryTopic: async (recordId: string, topic: string | null) => {
    const prev = await window.electronAPI.history.get(recordId)
    if (!prev) return
    const t = topic?.trim()
    await window.electronAPI.history.save({
      ...prev,
      topic: t ? t : undefined,
      updatedAt: Date.now()
    })
    await get().loadHistory()
  },

  restoreWorkspace: async (pw: PersistedWorkspace) => {
    useTokenUsageStore.getState().resetAll()
    resetAllTokenUsageParsing()

    const sessions: Session[] = []
    for (const wd of pw.sessionWorkdirs) {
      try {
        const result = await window.electronAPI.createSession(wd)
        sessions.push({
          id: result.sessionId,
          title: wd.split(/[/\\]/).pop() ?? wd,
          workdir: wd,
          status: 'running',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ptyPid: result.pid
        })
      } catch {
        // Directory no longer exists or PTY spawn failed — skip silently
        console.warn(`[workspace restore] skipped missing/invalid workdir: ${wd}`)
      }
    }

    const ids = sessions.map((s) => s.id)
    let layoutRoot: PaneNode | null = null

    if (ids.length > 0 && pw.layoutRoot && persistedSlotsValid(pw.layoutRoot, ids.length)) {
      layoutRoot = persistedPaneToLive(pw.layoutRoot, ids)
    }
    if (!layoutRoot && ids.length === 1) {
      layoutRoot = { type: 'leaf', sessionId: ids[0] }
    }
    if (!layoutRoot && ids.length > 1) {
      layoutRoot = { type: 'leaf', sessionId: ids[0] }
    }

    for (const sess of sessions) {
      await upsertWorkdirHistory(sess)
    }

    let activeSessionId: string | null = null
    if (ids.length > 0) {
      const idx = Math.min(Math.max(pw.activeSlotIndex, 0), ids.length - 1)
      activeSessionId = ids[idx]
    }

    set({ sessions, layoutRoot, activeSessionId })
    await get().loadHistory()
  }
}))
