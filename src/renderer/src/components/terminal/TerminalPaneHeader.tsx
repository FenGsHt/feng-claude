import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useTokenUsageStore } from '../../store/tokenUsageStore'
import type { CreateSessionMode } from '../../types/paneLayout'
import { getSplitWorkdirCandidates } from '../../lib/recentWorkdirs'
import { SplitWorkdirDialog } from './SplitWorkdirDialog'
import { WorktreeDialog } from './WorktreeDialog'
import { fmtTokens } from '../../lib/formatTokens'

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

export function TerminalPaneHeader({ sessionId, focused }: Props): React.ReactElement {
  const sess = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId))
  const createSession = useSessionStore((s) => s.createSession)
  const closeSession = useSessionStore((s) => s.closeSession)
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

  const candidates = useMemo(
    () => getSplitWorkdirCandidates(history, sessions),
    [history, sessions]
  )

  // 检查是否是 git 仓库以及 worktree 状态
  const checkGitStatus = useCallback(async () => {
    if (!sess?.workdir) return
    try {
      const repoResult = await window.electronAPI.git?.isRepo(sess.workdir)
      if (!repoResult) {
        setIsGitRepo(false)
        return
      }
      setIsGitRepo(repoResult.isRepo)
      if (repoResult.isRepo) {
        const wtResult = await window.electronAPI.git?.worktreeList(sess.workdir)
        if (wtResult) {
          setWorktrees(wtResult.worktrees)

          // 检查每个 worktree 分支是否有未合并的提交
          const unmerged: UnmergedInfo[] = []
          for (const wt of wtResult.worktrees.filter(w => !w.isMain)) {
            const result = await window.electronAPI.git?.unmergedCommits({
              repoPath: sess.workdir,
              branch: wt.branch,
            })
            if (result && result.count > 0) {
              unmerged.push({ branch: wt.branch, count: result.count })
            }
          }
          setUnmergedInfo(unmerged)
          // 如果有未合并的提交，显示合并提醒
          setShowMergeReminder(unmerged.length > 0)
        }
      }
    } catch (e) {
      console.warn('[TerminalPaneHeader] git check failed:', e)
      setIsGitRepo(false)
    }
  }, [sess?.workdir])

  useEffect(() => {
    void checkGitStatus()
  }, [checkGitStatus])

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
      if (dir) await createSession(dir, mode, sessionId)
      return
    }
    setSplitMode(mode)
  }

  const handleWorktreeCreate = async (worktreePath: string, branch: string): void => {
    // 在 worktree 路径创建新会话
    await createSession(worktreePath, 'split-right', sessionId)
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
          <HeaderBtn title="Close pane" onClick={() => closeSession(sessionId)} danger>
            <svg width="8" height="8" viewBox="0 0 8 8">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </HeaderBtn>
        </div>
      </div>

      {splitMode != null && splitMode !== 'split-worktree' && (
        <SplitWorkdirDialog
          open
          candidates={candidates}
          mode={splitMode}
          currentWorkdir={sess?.workdir}
          onPick={(workdir) => {
            void createSession(workdir, splitMode, sessionId)
            setSplitMode(null)
          }}
          onPickOther={async () => {
            const dir = await window.electronAPI.openDirDialog()
            if (dir) await createSession(dir, splitMode, sessionId)
            setSplitMode(null)
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
  children
}: {
  onClick: () => void
  title: string
  danger?: boolean
  warning?: boolean
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
            : 'text-claude-muted hover:bg-claude-border/60 hover:text-claude-text'
      }`}
    >
      {children}
    </button>
  )
}
