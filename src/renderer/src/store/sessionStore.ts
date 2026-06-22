import { create } from 'zustand'
import type { Session, HistoryRecord } from '../types/session'
import type { TelegramChannelSessionConfig, ClaudeSettings } from '../types/settings'
import { OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE } from '../types/settings'
import type { PaneNode, CreateSessionMode } from '../types/paneLayout'
import {
  collectLeafSessionIds,
  removeSessionFromLayout,
  replaceLeafWithSplit
} from '../lib/paneLayout'
import { destroyTerminal, focusTerminal, preFillTerminal, wakeTerminal } from '../components/terminal/XTerminal'
import { useEmbedAwaitingReplyStore } from './embedAwaitingReplyStore'
import { clearEmbedTurnLatency } from './embedTurnLatencyStore'
import { clearEmbedPtyEchoBuffer } from '../lib/embedPtyTranscriptEcho'
import { clearPtyAlternateScreenSession } from './ptyAlternateScreenStore'
import { useTranscriptStore } from './transcriptStore'
import { useTokenUsageStore } from './tokenUsageStore'
import { useToolCallStore } from './toolCallStore'
import { clearTokenUsageBuffer, resetAllTokenUsageParsing } from '../lib/claudeTokenUsageParse'
import type { PersistedWorkspace } from '../types/workspace'
import { persistedPaneToLive, persistedSlotsValid } from '../lib/workspaceSerialize'
import type { SessionCreateOk, SessionCreateErr } from '../types/ipc'

/** [2026-06-11] 由 profileId 解析显示名（用于启动时快照到 session.profileName） */
function resolveProfileName(settings: ClaudeSettings, profileId?: string | null): string | undefined {
  const id = profileId ?? settings.activeProfileId
  if (id === OFFICIAL_PROFILE_ID) return OFFICIAL_PROFILE.name
  return settings.profiles.find((p) => p.id === id)?.name
}

/** Debounce timers for notifyTerminalCommittedLine — avoids concurrent history writes per session */
const notifyDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 自动记录时跳过无信息量的单行（与 shell 噪音区分） */
const SKIP_TERMINAL_LINES = new Set(['claude', 'clear', 'exit', 'cls'])


function normalizeCommittedTerminalLine(raw: string): string | null {
  // [2026-04-28] Strip ANSI escape sequences and orphaned cursor codes
  // Arrow keys send \x1b[A/B/C/D; ESC (code 27) is filtered out in XTerminal
  // leaving orphan [A, [B, etc. in the buffer.
  let s = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')  // full CSI sequences
  s = s.replace(/\x1b[()][AB012]/g, '')               // charset sequences
  s = s.replace(/\x1b[\[\](){}#%;><=~^_\\]/g, '')     // orphaned ESC + intro char
  s = s.replace(/\[[0-9;]*[A-Za-z]/g, '')             // orphaned CSI (ESC already stripped)
  s = s.replace(/\r/g, '').trim()
  if (!s) return null
  const capped = s.length > 200 ? s.slice(0, 200) : s
  const lower = capped.toLowerCase()
  if (SKIP_TERMINAL_LINES.has(lower)) return null
  return capped
}

/** [2026-05-06] 与侧栏 / restoreFromHistory 的 norm 对齐，避免同一目录因尾部 \\ 产生两条 history */
function workdirToHistoryId(workdir: string): string {
  const norm = workdir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return `wd:${norm}`
}

/** [2026-05-06] 外嵌输入框提交的原文：不做 SKIP_TERMINAL_LINES，否则侧栏 lastUserPrompt 常被清空 */
function sanitizeEmbedPromptForHistory(raw: string): string | null {
  let s = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  s = s.replace(/\x1b[()][AB012]/g, '')
  s = s.replace(/\x1b[\[\](){}#%;><=~^_\\]/g, '')
  s = s.replace(/\[[0-9;]*[A-Za-z]/g, '')
  s = s.replace(/\r/g, '').trim()
  if (!s) return null
  return s.length > 300 ? s.slice(0, 300) : s
}

/**
 * [2026-04-23] 主进程未重编时可能仍返回无 `ok` 字段的旧成功体；此时 `!raw.ok` 为真会误判失败，且 `error` 为 undefined。
 * 同时将 `ok:false` 但空的 error 归为默认文案。
 */
function normalizeCreateSessionResult(raw: unknown, fallbackWorkdir: string): SessionCreateOk | SessionCreateErr {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'createSession 无有效返回', workdir: fallbackWorkdir }
  }
  const r = raw as Record<string, unknown>
  if (r.ok === true && typeof r.sessionId === 'string' && typeof r.pid === 'number') {
    return {
      ok: true,
      sessionId: r.sessionId,
      pid: r.pid,
      workdir: typeof r.workdir === 'string' ? r.workdir : fallbackWorkdir,
      scrollback: r.scrollback as SessionCreateOk['scrollback'],
      profileId: typeof r.profileId === 'string' ? r.profileId : undefined
    }
  }
  if (r.ok === false) {
    const err =
      typeof r.error === 'string' && r.error.trim().length > 0 ? r.error : '创建终端会话失败'
    return {
      ok: false,
      error: err,
      workdir: typeof r.workdir === 'string' ? r.workdir : fallbackWorkdir
    }
  }
  /* 旧主进程成功体：无 ok */
  if (typeof r.sessionId === 'string' && typeof r.pid === 'number') {
    return {
      ok: true,
      sessionId: r.sessionId,
      pid: r.pid,
      workdir: typeof r.workdir === 'string' ? r.workdir : fallbackWorkdir,
      scrollback: r.scrollback as SessionCreateOk['scrollback'],
      profileId: typeof r.profileId === 'string' ? r.profileId : undefined
    }
  }
  return { ok: false, error: 'createSession 返回格式异常', workdir: fallbackWorkdir }
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
  /* [2026-05-06] 原 hid 未去尾部 /，与 norm(session.workdir) 不一致时同一目录会分裂两条记录，lastUserPrompt 写在「另一条」上看起来像丢失 */
  // const hid = `wd:${session.workdir.replace(/\\/g, '/').toLowerCase()}`
  const hid = workdirToHistoryId(session.workdir)
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
  /** [2026-04-23] 主区域多分屏布局；与 tabs 中 session 对应 */
  layoutRoot: PaneNode | null
  /** [2026-06-16] 停泊的分屏组：切到其它会话时把当前分屏组暂存，切回其任一成员时还原，
   *  避免分屏窗格在 Alt+E/R 切走再切回后丢失、变成独立 tab */
  parkedLayouts: PaneNode[]
  history: HistoryRecord[]

  /**
   * @param splitFromSessionId 分屏时从该 session 所在格拆出；缺省则使用当前 active（与点哪个窗格上的分屏一致）
   * @param resume 传 true 时以 --continue 恢复该目录上次对话上下文
   * @param profileId [2026-04-28] 指定使用的 API profile ID（可选）
   * @param shellOnly [2026-05-06] true 时仅打开 Shell，不自动启动 Claude Code
   */
  createSession: (workdir: string, mode?: CreateSessionMode, splitFromSessionId?: string, resume?: boolean, profileId?: string, shellOnly?: boolean, telegramChannel?: TelegramChannelSessionConfig) => Promise<void>
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void
  /** [2026-06-16] 保存分屏拖动比例（path 为分屏树路径，sizes 为两侧百分比），用于切换窗口后还原 */
  updateSplitSizes: (path: string, sizes: [number, number]) => void

  updateSessionStatus: (sessionId: string, status: Session['status']) => void

  loadHistory: () => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  /** History 面板：在新标签打开该历史条目的工作目录 */
  restoreFromHistory: (record: HistoryRecord) => Promise<void>

  /** 终端提交完整一行后更新 lastUserPrompt（经规范化过滤） */
  notifyTerminalCommittedLine: (sessionId: string, rawLine: string) => void
  /** [2026-05-06] 外嵌 composer 提交：直接写入 lastUserPrompt（不过滤 claude/clear 等单行） */
  recordEmbedLastUserPrompt: (sessionId: string, rawLine: string) => void
  /** 侧栏右键：保存/清除自定义主题 */
  updateHistoryTopic: (recordId: string, topic: string | null) => Promise<void>

  /** 从磁盘快照恢复：按顺序建 PTY，再按 slot 还原分屏与 active */
  restoreWorkspace: (pw: PersistedWorkspace) => Promise<void>

  /** 原地重启：关闭当前 PTY，在相同 workdir 重新创建，保持 tab 位置不变 */
  /** [2026-05-08] telegramChannelOverride：切换 TG 预设后避免仍用 store 内旧 env 创建 PTY */
  restartSession: (
    id: string,
    newProfileId?: string,
    telegramChannelOverride?: TelegramChannelSessionConfig
  ) => Promise<void>

  /** [2026-04-28] 更新会话的 profileId（切换配置） */
  updateSessionProfileId: (sessionId: string, profileId: string) => void
  /** [2026-05-08] 更新会话的 Telegram Channel 配置；重启后生效 */
  updateSessionTelegramChannel: (sessionId: string, telegramChannel?: TelegramChannelSessionConfig) => void
  updateSessionEmbedMode: (sessionId: string, embedMode: boolean) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  layoutRoot: null,
  parkedLayouts: [],
  history: [],

  createSession: async (
    workdir: string,
    mode: CreateSessionMode = 'fullscreen',
    splitFromSessionId?: string,
    resume?: boolean,
    profileId?: string,
    shellOnly?: boolean,
    telegramChannel?: TelegramChannelSessionConfig
  ) => {
    /* [2026-04-23] 原先分屏时用「锚点 session 的 workdir」覆盖入参 workdir，导致用户在分屏对话框里选的目录/
     * 「其他文件夹」始终被忽略，PTY 永远在旧目录创建。
     * 正确行为：始终以调用方传入的 workdir 作为会话目录（分屏仅从 splitFromSessionId 决定插入位置）。
     */
    const raw = await window.electronAPI.createSession(workdir, resume, profileId, shellOnly, telegramChannel)
    const result = normalizeCreateSessionResult(raw, workdir)
    /* [2026-04-23] 原假定 invoke 恒成功；主进程 PTY 失败时改为 ok 判别。
     * [2026-04-23] 若在 !ok 时 throw，App 启动与 restoreFromHistory 等路径未全部 try/catch，会 Uncaught (in promise)；失败时仅打日志并 return */
    if (!result.ok) {
      console.warn('[sessionStore] createSession failed:', result.error, result.workdir)
      return
    }
    // Use the resolved absolute path returned by main — avoids '.' being stored
    const resolvedWorkdir = result.workdir ?? workdir
    // [2026-04-28] Always use returned profileId (IPC returns active profile if not specified)
    const sessionProfileId = result.profileId
    // [2026-06-11] 启动时快照 profile 名称，标签徽章用它而非实时读设置
    const launchSettings = await window.electronAPI.settings.get().catch(() => null)
    const sessionProfileName = launchSettings
      ? resolveProfileName(launchSettings, sessionProfileId)
      : undefined
    // [2026-05-11] 新 session 默认继承当前活跃 session 的外嵌/终端模式
    const defaultEmbedMode = get().activeSessionId
      ? get().sessions.find((s) => s.id === get().activeSessionId)?.embedMode ?? false
      : (launchSettings?.embedClaudeOutputBeta === true)
    const newSession: Session = {
      id: result.sessionId,
      title: resolvedWorkdir.split(/[/\\]/).pop() ?? resolvedWorkdir,
      workdir: resolvedWorkdir,
      status: 'running',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ptyPid: result.pid,
      profileId: sessionProfileId ?? undefined,
      profileName: sessionProfileName,
      shellOnly: shellOnly || undefined,
      telegramChannel: result.telegramChannel ?? telegramChannel,
      embedMode: defaultEmbedMode || undefined
    }

    set((s) => {
      let layoutRoot = s.layoutRoot
      let parked = s.parkedLayouts

      if (mode === 'fullscreen' || !layoutRoot) {
        // [2026-06-16] 新建全屏会话前，把当前分屏组停泊，便于切回时还原
        if (s.layoutRoot && s.layoutRoot.type === 'split') {
          const curIds = collectLeafSessionIds(s.layoutRoot)
          parked = [...parked.filter((t) => !collectLeafSessionIds(t).some((sid) => curIds.includes(sid))), s.layoutRoot]
        }
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
        layoutRoot,
        parkedLayouts: parked
      }
    })

    if (result.scrollback) {
      preFillTerminal(result.sessionId, result.scrollback)
    }

    await upsertWorkdirHistory(newSession)
    await get().loadHistory()
  },

  closeSession: (id: string) => {
    destroyTerminal(id)
    clearTokenUsageBuffer(id)
    useTokenUsageStore.getState().clearSession(id)
    useTranscriptStore.getState().clearSession(id)
    useToolCallStore.getState().clearSession(id)
    clearEmbedPtyEchoBuffer(id)
    useEmbedAwaitingReplyStore.getState().clearPending(id)
    clearEmbedTurnLatency(id)
    clearPtyAlternateScreenSession(id)
    window.electronAPI.closeSession(id)
    // [2026-06-12] 销毁该 session 的调试浏览器 tab，释放内存
    window.electronAPI.browserView?.destroySession?.(id)
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id)
      // 从停泊组里也移除该会话，丢弃空组
      const parked = s.parkedLayouts
        .map((t) => removeSessionFromLayout(t, id))
        .filter((t): t is PaneNode => t !== null)
      let layoutRoot = s.layoutRoot ? removeSessionFromLayout(s.layoutRoot, id) : null

      const newActive =
        s.activeSessionId === id
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s.activeSessionId

      if (layoutRoot === null && newActive) {
        // 当前组被关空：若 newActive 属于某停泊组则还原它，否则单格显示
        const pIdx = parked.findIndex((t) => collectLeafSessionIds(t).includes(newActive))
        if (pIdx >= 0) { layoutRoot = parked[pIdx]; parked.splice(pIdx, 1) }
        else layoutRoot = { type: 'leaf', sessionId: newActive }
      }

      return { sessions: remaining, activeSessionId: newActive, layoutRoot, parkedLayouts: parked }
    })
  },

  setActiveSession: (id: string) => {
    // [2026-06-12] 通知 main：调试浏览器面板跟随切换到该 session 的 tab
    // [2026-06-18] 非 CC（shell-only）终端不自动创建调试浏览器 —— 把 shellOnly 透传给 main
    const targetShellOnly = get().sessions.find((s) => s.id === id)?.shellOnly ?? false
    window.electronAPI.browserView?.setActiveSession?.(id, targetShellOnly)
    set((s) => {
      const curIds = s.layoutRoot ? collectLeafSessionIds(s.layoutRoot) : []
      // 目标已在当前布局里 → 仅切焦点，分屏不变
      if (s.layoutRoot && curIds.includes(id)) {
        return { activeSessionId: id }
      }
      let parked = [...s.parkedLayouts]
      // 把当前「分屏组」停泊起来（单格 leaf 无需停泊，还原即重建）
      if (s.layoutRoot && s.layoutRoot.type === 'split') {
        parked = parked.filter((t) => !collectLeafSessionIds(t).some((sid) => curIds.includes(sid)))
        parked.push(s.layoutRoot)
      }
      // 目标若属于某个停泊的分屏组 → 还原该组（分屏窗格随之回来）
      const pIdx = parked.findIndex((t) => collectLeafSessionIds(t).includes(id))
      if (pIdx >= 0) {
        const restored = parked[pIdx]
        parked.splice(pIdx, 1)
        return { activeSessionId: id, layoutRoot: restored, parkedLayouts: parked }
      }
      return { activeSessionId: id, layoutRoot: { type: 'leaf', sessionId: id }, parkedLayouts: parked }
    })
  },

  updateSplitSizes: (path: string, sizes: [number, number]) => {
    // path 形如 "s" / "s/0" / "s/1/0"，首段为根标记，其后 0=first 1=second
    const segs = path.split('/').slice(1)
    const apply = (node: PaneNode, rest: string[]): PaneNode => {
      if (node.type !== 'split') return node
      if (rest.length === 0) return { ...node, sizes }
      const [head, ...tail] = rest
      if (head === '0') return { ...node, first: apply(node.first, tail) }
      if (head === '1') return { ...node, second: apply(node.second, tail) }
      return node
    }
    set((s) => (s.layoutRoot ? { layoutRoot: apply(s.layoutRoot, segs) } : {}))
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
    // Session workdirs are always absolute paths (resolved by main on SESSION_CREATE),
    // so a simple case-insensitive local comparison is sufficient — no IPC needed.
    const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const target = norm(record.workdir)
    const existing = get().sessions.find((s) => norm(s.workdir) === target)
    if (existing) {
      get().setActiveSession(existing.id)
      focusTerminal(existing.id)
      return
    }
    await get().createSession(record.workdir, 'fullscreen', undefined, true)
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

  recordEmbedLastUserPrompt: (sessionId: string, rawLine: string) => {
    const line = sanitizeEmbedPromptForHistory(rawLine)
    if (!line) return
    void (async () => {
      const sess = get().sessions.find((s) => s.id === sessionId)
      if (!sess) return
      await upsertWorkdirHistory(sess, { lastUserPrompt: line })
      await get().loadHistory()
    })()
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

  restartSession: async (id: string, newProfileId?: string, telegramChannelOverride?: TelegramChannelSessionConfig) => {
    const sess = get().sessions.find((s) => s.id === id)
    if (!sess) return
    // [2026-04-28] Use newProfileId if provided, otherwise keep existing
    const targetProfileId = newProfileId ?? sess.profileId
    const { workdir, createdAt } = sess
    /* [2026-05-08] 原仅解构 sess.telegramChannel；切换预设后若未传入覆盖，restart 仍可能读到切换前快照 */
    const telegramChannel = telegramChannelOverride ?? sess.telegramChannel

    destroyTerminal(id)
    clearTokenUsageBuffer(id)
    useTokenUsageStore.getState().clearSession(id)
    useTranscriptStore.getState().clearSession(id)
    useToolCallStore.getState().clearSession(id)
    clearEmbedPtyEchoBuffer(id)
    useEmbedAwaitingReplyStore.getState().clearPending(id)
    clearEmbedTurnLatency(id)
    clearPtyAlternateScreenSession(id)
    window.electronAPI.closeSession(id)

    /* [2026-04-30] 重新打开同一会话时 /resume 恢复该目录对话（与重开应用行为一致）
     * [2026-05-09] 切换 Telegram Bot 预设时跳过 resume：Claude 会话会缓存旧 bot 的 Telegram 插件状态，
     *   恢复旧 session 时不会重读 .env，导致切回前一个 bot 后无响应。 */
    const skipResume = telegramChannelOverride !== undefined
    let result = normalizeCreateSessionResult(
      await window.electronAPI.createSession(workdir, !skipResume, targetProfileId, sess.shellOnly, telegramChannel),
      workdir
    )
    if (!result.ok) {
      console.warn('[restartSession] 带 resume 创建失败，尝试普通启动:', result.error)
      result = normalizeCreateSessionResult(
        await window.electronAPI.createSession(workdir, false, targetProfileId, sess.shellOnly, telegramChannel),
        workdir
      )
    }
    if (!result.ok) {
      console.error('[restartSession] 创建会话失败:', result.error)
      set((s) => {
        const remaining = s.sessions.filter((sess) => sess.id !== id)
        const parked = s.parkedLayouts
          .map((t) => removeSessionFromLayout(t, id))
          .filter((t): t is PaneNode => t !== null)
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
        return { sessions: remaining, activeSessionId: newActive, layoutRoot, parkedLayouts: parked }
      })
      return
    }
    // 将旧 session 的调试浏览器 tab 迁移到新 session，避免重新建 tab 并重置 URL
    window.electronAPI.browserView?.migrateSession?.(id, result.sessionId)
    const resolvedWorkdir = result.workdir ?? workdir
    // [2026-06-11] restart 是显式切换配置/重启的路径，按当前设置快照 profile 名称
    const restartSettings = await window.electronAPI.settings.get().catch(() => null)
    const restartProfileName = restartSettings
      ? resolveProfileName(restartSettings, result.profileId ?? targetProfileId)
      : sess.profileName
    const newSession: Session = {
      id: result.sessionId,
      title: resolvedWorkdir.split(/[/\\]/).pop() ?? resolvedWorkdir,
      workdir: resolvedWorkdir,
      status: 'running',
      messages: [],
      createdAt,
      updatedAt: Date.now(),
      ptyPid: result.pid,
      profileId: result.profileId ?? targetProfileId,
      profileName: restartProfileName,
      shellOnly: sess.shellOnly,
      telegramChannel: result.telegramChannel ?? telegramChannel
    }

    function replaceLeafId(node: PaneNode, oldId: string, newId: string): PaneNode {
      if (node.type === 'leaf') return node.sessionId === oldId ? { ...node, sessionId: newId } : node
      return { ...node, first: replaceLeafId(node.first, oldId, newId), second: replaceLeafId(node.second, oldId, newId) }
    }

    set((s) => ({
      sessions: s.sessions.map((existing) => existing.id === id ? newSession : existing),
      activeSessionId: s.activeSessionId === id ? result.sessionId : s.activeSessionId,
      layoutRoot: s.layoutRoot
        ? replaceLeafId(s.layoutRoot, id, result.sessionId)
        : { type: 'leaf', sessionId: result.sessionId },
      // 同步停泊组里的旧 id → 新 id，避免重启会话后停泊组里残留死引用
      parkedLayouts: s.parkedLayouts.map((t) => replaceLeafId(t, id, result.sessionId))
    }))

    if (result.scrollback) {
      preFillTerminal(result.sessionId, result.scrollback)
    }
    // [2026-06-02] 切换配置后终端可能显示异常，延迟 wake 确保 XTerminal 完成挂载
    setTimeout(() => wakeTerminal(result.sessionId), 200)
    setTimeout(() => wakeTerminal(result.sessionId), 600)
  },

  restoreWorkspace: async (pw: PersistedWorkspace) => {
    useTokenUsageStore.getState().resetAll()
    resetAllTokenUsageParsing()

    // [2026-06-11] 一次性读设置，用于快照各 session 的 profile 名称
    const restoreSettings = await window.electronAPI.settings.get().catch(() => null)

    const sessions: Session[] = []
    // [2026-04-28] Restore sessions with their saved profileIds
    for (let i = 0; i < pw.sessionWorkdirs.length; i++) {
      const wd = pw.sessionWorkdirs[i]
      const profileId = pw.profileIds?.[i]
      // [2026-05-06] Shell-only sessions: restore=false, shellOnly=true
      const shellOnly = pw.shellOnlySlots?.[i] ?? false
      const telegramChannel = pw.telegramChannelSlots?.[i]
      try {
        // Shell-only 不带 --continue，直接开 shell；普通 session 恢复上次会话
        const result = normalizeCreateSessionResult(
          await window.electronAPI.createSession(wd, shellOnly ? false : true, profileId, shellOnly, telegramChannel),
          wd
        )
        /* [2026-04-23] 原仅 catch 网络式错误；结构化 ok:false 不会抛，须显式跳过以免误用字段 */
        if (!result.ok) {
          console.warn(`[workspace restore] skipped (${result.error}): ${wd}`)
          continue
        }
        const resolvedWd = result.workdir ?? wd
        // [2026-05-06] Shell-only sessions skip scrollback pre-fill:
        // tools like lazygit use alternate screen buffer, and the cleanup
        // sequence (\x1b[?1049l) would switch back to normal screen, leaving
        // a confusing blank terminal. Also, we can't restore the running process.
        if (result.scrollback && !shellOnly) {
          preFillTerminal(result.sessionId, result.scrollback)
        }
        sessions.push({
          id: result.sessionId,
          title: resolvedWd.split(/[/\\]/).pop() ?? resolvedWd,
          workdir: resolvedWd,
          status: 'running',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ptyPid: result.pid,
          profileId: result.profileId ?? profileId,
          profileName: restoreSettings
            ? resolveProfileName(restoreSettings, result.profileId ?? profileId)
            : undefined,
          shellOnly: shellOnly || undefined,
          telegramChannel: result.telegramChannel ?? telegramChannel,
          embedMode: pw.embedModeSlots?.[i] ?? undefined
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

    set({ sessions, layoutRoot, activeSessionId, parkedLayouts: [] })
    await get().loadHistory()
  },

  updateSessionProfileId: (sessionId: string, profileId: string) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, profileId } : sess
      )
    }))
  },

  updateSessionTelegramChannel: (sessionId: string, telegramChannel?: TelegramChannelSessionConfig) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, telegramChannel } : sess
      )
    }))
  },

  updateSessionEmbedMode: (sessionId: string, embedMode: boolean) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, embedMode } : sess
      )
    }))
  }
}))
