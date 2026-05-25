import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import type { CreateSessionMode } from '../../types/paneLayout'
import { getSplitWorkdirCandidates } from '../../lib/recentWorkdirs'
import { injectEmbedDraft } from '../../lib/embedDraftBridge'
import { SplitWorkdirDialog } from './SplitWorkdirDialog'
import { openTextEditor } from '../sidebar/sidebarNav'
import { WorktreeDialog } from './WorktreeDialog'
import { fmtTokens } from '../../lib/formatTokens'
import { startRecognition, stopRecognition } from '../../services/speechRecognition'
import type { SpeechConfig } from '../../services/speechRecognition'

interface WorktreeInfo {
  path: string
  branch: string
  isMain: boolean
}

interface UnmergedInfo {
  branch: string
  count: number
}

interface Props {
  sessionId: string
  focused: boolean
}

function SplitVIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="5.5" y1="0.75" x2="5.5" y2="10.25" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function SplitHIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="0.75" y1="5.5" x2="10.25" y2="5.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function WorktreeIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 1L10 4V8L5.5 11L1 8V4L5.5 1Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <line x1="5.5" y1="1" x2="5.5" y2="11" stroke="currentColor" strokeWidth="0.7"/>
      <line x1="1" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="0.7"/>
      <line x1="1" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="0.7"/>
    </svg>
  )
}

function MergeIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="2" cy="5" r="1.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M3.5 5H6.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M6 3L8 5L6 7" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  )
}

function BrowserIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="0.75" y1="3" x2="10.25" y2="3" stroke="currentColor" strokeWidth="0.8"/>
      <circle cx="2.5" cy="2" r="0.5" fill="currentColor"/>
      <circle cx="4" cy="2" r="0.5" fill="currentColor"/>
      <circle cx="5.5" cy="2" r="0.5" fill="currentColor"/>
    </svg>
  )
}

/** [2026-05-06] 切换外嵌 ↔ 经典终端：图标表示点击后将进入的模式 */
function TerminalClassicIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 4.2L3.8 5.5L2.5 6.8" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="4.5" y1="6.8" x2="7.5" y2="6.8" stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" />
    </svg>
  )
}

function TranscriptEmbedIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="1" y="1.5" width="9" height="6" rx="0.9" stroke="currentColor" strokeWidth="1" />
      <path d="M2 10h7" stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" />
      <circle cx="3.3" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="5.5" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="7.7" cy="4.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

function MicIcon({ active }: { active: boolean }): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="3.5" y="0.75" width="4" height="5.5" rx="2" stroke="currentColor" strokeWidth="1.1"
        fill={active ? 'currentColor' : 'none'} />
      <path d="M1.5 5.5C1.5 7.98 3.24 10 5.5 10C7.76 10 9.5 7.98 9.5 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="5.5" y1="10" x2="5.5" y2="11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

export function TerminalPaneHeader({ sessionId, focused }: Props): React.ReactElement {
  const embedBeta = useSessionStore((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId)
    return sess?.embedMode ?? false
  })
  const sess = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId))
  const createSession = useSessionStore((s) => s.createSession)
  const closeSession = useSessionStore((s) => s.closeSession)
  const restartSession = useSessionStore((s) => s.restartSession)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const loadHistory = useSessionStore((s) => s.loadHistory)
  const history = useSessionStore((s) => s.history)
  const sessions = useSessionStore((s) => s.sessions)
  const tokenUsage = useTokenUsageStore((s) => s.bySession[sessionId])

  const [splitMode, setSplitMode] = useState<CreateSessionMode | null>(null)
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [unmergedInfo, setUnmergedInfo] = useState<UnmergedInfo[]>([])
  const [showMergeReminder, setShowMergeReminder] = useState(false)

  // 语音识别状态
  const [speechRecording, setSpeechRecording] = useState(false)
  const [speechInterim, setSpeechInterim] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [speechSettings, setSpeechSettings] = useState<{ enabled: boolean; shortcut: string; config: SpeechConfig } | null>(null)
  const speechRecordingRef = useRef(false)
  const focusedRef = useRef(focused)

  const candidates = useMemo(
    () => getSplitWorkdirCandidates(history, sessions),
    [history, sessions]
  )

  /* [2026-05-11] 顶栏一键切换当前 session 的外嵌/终端模式（每 session 独立） */
  const toggleEmbedVersusTerminal = useCallback(() => {
    const s = useSessionStore.getState()
    const sessForLog = s.sessions.find((x) => x.id === sessionId)
    const current = sessForLog?.embedMode ?? false
    console.log('[embed-toggle]', {
      sessionId,
      next: !current,
      workdir: sessForLog?.workdir,
      sessionCount: s.sessions.length
    })
    s.updateSessionEmbedMode(sessionId, !current)
  }, [sessionId])

  // 检查是否是 git 仓库以及 worktree 状态
  const checkGitStatus = useCallback(async () => {
    if (!sess?.workdir) return
    try {
      const repoResult = await window.electronAPI.git?.isRepo(sess.workdir)
      if (!repoResult?.isRepo) {
        setIsGitRepo(false)
        return
      }
      setIsGitRepo(true)

      const wtResult = await window.electronAPI.git?.worktreeList(sess.workdir)
      if (!wtResult) return
      setWorktrees(wtResult.worktrees)

      // 检查每个 worktree 分支是否有未合并的提交
      const unmerged: UnmergedInfo[] = []
      for (const wt of wtResult.worktrees.filter(w => !w.isMain)) {
        try {
          const result = await window.electronAPI.git?.unmergedCommits({
            repoPath: sess.workdir,
            branch: wt.branch,
          })
          if (result && result.count > 0) {
            unmerged.push({ branch: wt.branch, count: result.count })
          }
        } catch (e) {
          console.warn('[TerminalPaneHeader] unmergedCommits check failed for', wt.branch, e)
        }
      }
      setUnmergedInfo(unmerged)
      setShowMergeReminder(unmerged.length > 0)
    } catch (e) {
      console.warn('[TerminalPaneHeader] git check failed:', e)
      setIsGitRepo(false)
    }
  }, [sess?.workdir])

  useEffect(() => {
    void checkGitStatus()
  }, [checkGitStatus])

  // 读取语音识别设置
  useEffect(() => {
    const load = async (): Promise<void> => {
      const s = await window.electronAPI.settings.get()
      const sp = s.speech
      if (!sp?.enabled) { setSpeechSettings(null); return }
      setSpeechSettings({
        enabled: true,
        shortcut: sp.shortcut || 'Alt+M',
        config: {
          engine: sp.engine,
          language: sp.language,
          whisperEndpoint: sp.whisperEndpoint,
          whisperToken: sp.whisperToken,
          whisperModel: sp.whisperModel,
          micDeviceId: sp.micDeviceId,
          whisperPrompt: sp.whisperPrompt,
        }
      })
    }
    void load()
    const unsub = window.electronAPI.onSettingsChanged(() => void load())
    return unsub
  }, [])

  // 保持 focusedRef 与 prop 同步
  useEffect(() => { focusedRef.current = focused }, [focused])

  const toggleSpeech = useCallback((): void => {
    if (!speechSettings) return
    if (speechRecordingRef.current) {
      stopRecognition(speechSettings.config.engine)
      speechRecordingRef.current = false
      setSpeechRecording(false)
      setSpeechInterim('')
    } else {
      speechRecordingRef.current = true
      setSpeechRecording(true)
      setSpeechInterim('')
      startRecognition(speechSettings.config, {
        onInterim: (t) => setSpeechInterim(t),
        onResult: (t) => {
          setSpeechInterim('')
          if (t && sess?.id) {
            window.electronAPI.sendInput(sess.id, t)
          }
        },
        onStop: () => {
          speechRecordingRef.current = false
          setSpeechRecording(false)
          setSpeechInterim('')
        },
        onError: (msg) => {
          speechRecordingRef.current = false
          setSpeechRecording(false)
          setSpeechInterim('')
          setSpeechError(msg)
          setTimeout(() => setSpeechError(''), 6000)
        },
      })
    }
  }, [speechSettings, sess?.id])

  // 快捷键：由主进程 before-input-event 拦截后通过 IPC 触发
  useEffect(() => {
    if (!speechSettings?.enabled) return
    const unsub = window.electronAPI.onSpeechToggle(() => {
      if (focusedRef.current) toggleSpeech()
    })
    return unsub
  }, [speechSettings?.enabled, toggleSpeech])

  // 浏览器元素拾取器：将拾取的元素信息插入当前聚焦的终端
  useEffect(() => {
    if (typeof window.electronAPI.onElementPicked !== 'function') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = window.electronAPI.onElementPicked((info: any) => {
      if (!focusedRef.current || !sess?.id) return
      const lines: string[] = []
      lines.push(`[Element] ${info.path}`)
      lines.push(`Selector: ${info.selector}`)
      if (info.text) lines.push(`Text: "${info.text.replace(/\n/g, ' ')}"`)
      lines.push(`HTML: ${info.html}`)
      const ref = '\n' + lines.join('\n') + '\n'
      // [2026-05-12] 优先写入外嵌输入框，不存在时发到 PTY
      if (!injectEmbedDraft(sess.id, ref)) {
        window.electronAPI.sendInput(sess.id, ref)
      }
    })
    return unsub
  }, [sess?.id])

  async function beginSplit(mode: CreateSessionMode): Promise<void> {
    if (mode === 'split-worktree') {
      setShowWorktreeDialog(true)
      return
    }
    await loadHistory()
    const dirs = getSplitWorkdirCandidates(
      useSessionStore.getState().history,
      useSessionStore.getState().sessions
    )
    if (dirs.length === 0) {
      const dir = await window.electronAPI.openDirDialog()
      if (dir) {
        try {
          await createSession(dir, mode, sessionId)
        } catch (e) {
          console.warn('[TerminalPaneHeader] 分屏创建会话失败', e)
        }
      }
      return
    }
    setSplitMode(mode)
  }

  const handleWorktreeCreate = async (worktreePath: string, branch: string): void => {
    // 在 worktree 路径创建新会话
    try {
      await createSession(worktreePath, 'split-right', sessionId)
    } catch (e) {
      console.warn('[TerminalPaneHeader] worktree 会话创建失败', e)
      return
    }
    void checkGitStatus() // 更新 worktree 状态
  }

  const hasTokens = tokenUsage && (tokenUsage.input > 0 || tokenUsage.output > 0)
  const hasCacheRead = tokenUsage && tokenUsage.cacheRead > 0

  // Tooltip: detailed breakdown
  const tokenTitle = tokenUsage
    ? [
        `Input:  ${tokenUsage.input.toLocaleString()} tokens`,
        `Output: ${tokenUsage.output.toLocaleString()} tokens`,
        tokenUsage.cacheCreate > 0 ? `Cache write: ${tokenUsage.cacheCreate.toLocaleString()}` : '',
        tokenUsage.cacheRead > 0 ? `Cache read:  ${tokenUsage.cacheRead.toLocaleString()}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  return (
    <>
      <div
        role="presentation"
        onMouseDown={() => setActiveSession(sessionId)}
        className={`flex h-7 shrink-0 cursor-default items-center gap-2 border-b px-2 transition-colors ${
          focused
            ? 'border-amber-600/40 bg-claude-bg'
            : 'border-claude-border bg-claude-surface'
        }`}
        title={sess?.workdir ?? undefined}
      >
        {/* Status dot */}
        <span
          className={`shrink-0 rounded-full transition-colors ${
            sess?.status === 'running'
              ? 'h-1.5 w-1.5 bg-amber-400 animate-pulse'
              : sess?.status === 'waiting_input'
                ? 'h-1.5 w-1.5 bg-green-400'
                : sess?.status === 'error'
                  ? 'h-1.5 w-1.5 bg-red-400'
                  : 'h-1.5 w-1.5 bg-claude-muted/40'
          }`}
        />

        {/* Title */}
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-medium leading-none ${
            focused ? 'text-claude-text' : 'text-claude-muted'
          }`}
        >
          {sess?.title ?? sessionId}
        </span>

        {/* Token usage */}
        {hasTokens && (
          <span
            className="shrink-0 font-mono text-[9px] tabular-nums leading-none text-claude-muted/70 whitespace-nowrap"
            title={tokenTitle}
          >
            {fmtTokens(tokenUsage!.input)}↑ {fmtTokens(tokenUsage!.output)}↓
            {hasCacheRead && (
              <span className="text-sky-400/70 ml-1" title="Cache read tokens">
                {fmtTokens(tokenUsage!.cacheRead)}⚡
              </span>
            )}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
          <HeaderBtn
            title={
              embedBeta
                ? '切换到传统 Claude Code 终端 (xterm)'
                : '切换到外嵌会话视图 (结构化对话)'
            }
            onClick={toggleEmbedVersusTerminal}
            accent={embedBeta}
          >
            {embedBeta ? <TerminalClassicIcon /> : <TranscriptEmbedIcon />}
          </HeaderBtn>
          {/* [2026-05-08] Telegram 配置已迁至标签栏「模型」药丸旁的频道按钮 */}
          {/* 合并提醒 */}
          {showMergeReminder && (
            <HeaderBtn
              title={`${unmergedInfo.length} 个分支有未合并提交：${unmergedInfo.map(u => `${u.branch}(${u.count})`).join(', ')}`}
              onClick={() => setShowWorktreeDialog(true)}
              warning
            >
              <MergeIcon />
            </HeaderBtn>
          )}
          <HeaderBtn title="Split right" onClick={() => void beginSplit('split-right')}>
            <SplitVIcon />
          </HeaderBtn>
          <HeaderBtn title="Split down" onClick={() => void beginSplit('split-down')}>
            <SplitHIcon />
          </HeaderBtn>
          {/* Worktree 按钮 */}
          {isGitRepo && (
            <HeaderBtn title="Split worktree (新建分支)" onClick={() => void beginSplit('split-worktree')}>
              <WorktreeIcon />
            </HeaderBtn>
          )}
          {/* 麦克风按钮：仅 speech.enabled 时显示 */}
          {speechSettings?.enabled && (
            <button
              onMouseDown={(e) => { e.stopPropagation(); toggleSpeech() }}
              title={`语音输入 (${speechSettings.shortcut || 'Alt+M'})`}
              className={`relative flex h-5 w-5 items-center justify-center rounded transition-colors ${
                speechRecording
                  ? 'bg-red-500/30 text-red-400'
                  : 'text-claude-muted hover:bg-claude-border hover:text-claude-text'
              }`}
            >
              <MicIcon active={speechRecording} />
              {speechRecording && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              )}
            </button>
          )}
          <HeaderBtn title="Open embedded browser for debugging" onClick={() => void window.electronAPI.browserView?.toggle()}>
            <BrowserIcon />
          </HeaderBtn>
          <HeaderBtn title="Close pane" onClick={() => closeSession(sessionId)} danger>
            <svg width="8" height="8" viewBox="0 0 8 8">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </HeaderBtn>
        </div>
      </div>

      {/* 语音识别临时文本提示条 */}
      {speechRecording && (
        <div className="flex items-center gap-1.5 border-b border-red-900/40 bg-red-950/20 px-2 py-0.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="truncate font-mono text-[10px] text-red-300">
            {speechInterim || '正在录音…'}
          </span>
          <button
            onClick={toggleSpeech}
            className="ml-auto shrink-0 text-[9px] text-red-400 hover:text-red-300"
          >
            停止
          </button>
        </div>
      )}
      {/* 语音识别错误提示条 */}
      {speechError && (
        <div className="flex items-center gap-1.5 border-b border-amber-900/40 bg-amber-950/20 px-2 py-0.5">
          <span className="truncate text-[10px] text-amber-300">{speechError}</span>
          <button
            onClick={() => setSpeechError('')}
            className="ml-auto shrink-0 text-[9px] text-amber-500 hover:text-amber-300"
          >
            ✕
          </button>
        </div>
      )}

      {splitMode != null && splitMode !== 'split-worktree' && (
        <SplitWorkdirDialog
          open
          candidates={candidates}
          mode={splitMode}
          currentWorkdir={sess?.workdir}
          onPick={(workdir) => {
            void createSession(workdir, splitMode, sessionId).catch((e) =>
              console.warn('[TerminalPaneHeader] 分屏创建会话失败', e)
            )
            setSplitMode(null)
          }}
          onPickShell={(workdir) => {
            // [2026-05-06] 空控制台：不启动 Claude Code
            void createSession(workdir, splitMode, sessionId, undefined, undefined, true).catch((e) =>
              console.warn('[TerminalPaneHeader] 分屏创建空控制台失败', e)
            )
            setSplitMode(null)
          }}
          onPickOther={async () => {
            const dir = await window.electronAPI.openDirDialog()
            if (dir) {
              try {
                await createSession(dir, splitMode, sessionId)
              } catch (e) {
                console.warn('[TerminalPaneHeader] 分屏创建会话失败', e)
              }
            }
            setSplitMode(null)
          }}
          onOpenTextFile={async () => {
            setSplitMode(null)
            const path = await window.electronAPI.openTextFileDialog()
            if (path) void openTextEditor(path)
          }}
          onClose={() => setSplitMode(null)}
        />
      )}

      {showWorktreeDialog && sess?.workdir && (
        <WorktreeDialog
          open
          repoPath={sess.workdir}
          onClose={() => setShowWorktreeDialog(false)}
          onCreate={handleWorktreeCreate}
        />
      )}
    </>
  )
}

function HeaderBtn({
  onClick,
  title,
  danger,
  warning,
  accent,
  children
}: {
  onClick: () => void
  title: string
  danger?: boolean
  warning?: boolean
  /** [2026-05-06] 外嵌 Beta 开启时淡化提示当前为会话视图 */
  accent?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-600/20 hover:text-red-500'
          : warning
            ? 'text-amber-400 hover:bg-amber-600/20 hover:text-amber-500 animate-pulse'
            : accent
              ? 'text-amber-400/95 ring-1 ring-amber-500/35 bg-amber-500/12 hover:bg-amber-500/22 hover:text-amber-300'
              : 'text-claude-muted hover:bg-claude-border/60 hover:text-claude-text'
      }`}
    >
      {children}
    </button>
  )
}
