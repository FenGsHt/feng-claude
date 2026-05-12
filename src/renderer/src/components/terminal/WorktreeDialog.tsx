import React, { useEffect, useState, useCallback } from 'react'

interface Props {
  open: boolean
  repoPath: string
  onClose: () => void
  onCreate: (worktreePath: string, branch: string) => void
}

export function WorktreeDialog({ open, repoPath, onClose, onCreate }: Props): React.ReactElement | null {
  const [currentBranch, setCurrentBranch] = useState('')
  const [mainRepoPath, setMainRepoPath] = useState('')
  const [worktrees, setWorktrees] = useState<Array<{ path: string; branch: string; commit: string; isMain: boolean }>>([])
  const [unmergedCounts, setUnmergedCounts] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newBranchName, setNewBranchName] = useState('')
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mergeLoading, setMergeLoading] = useState<string | null>(null)
  const [updateLoading, setUpdateLoading] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; branch: string } | null>(null)

  // 加载 worktree 信息
  const loadData = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError('')
    try {
      const wtResult = await window.electronAPI.git.worktreeList(repoPath)
      setWorktrees(wtResult.worktrees)
      // 用主仓库路径（worktrees[0]），避免从 worktree 子目录创建时找不到 ref
      const resolvedMainPath = wtResult.mainPath || repoPath
      setMainRepoPath(resolvedMainPath)

      const branchResult = await window.electronAPI.git.branchList(resolvedMainPath)
      setCurrentBranch(branchResult.currentBranch)

      // 已在 worktree 中使用的分支（不能再次挂载）
      const inUse = new Set(wtResult.worktrees.map(wt => wt.branch))
      const available = branchResult.branches
        .filter((b: { name: string; isCurrent: boolean; isRemote: boolean }) =>
          !b.isRemote && !b.isCurrent && !inUse.has(b.name)
        )
        .map((b: { name: string }) => b.name)
      setAvailableBranches(available)
      if (available.length > 0 && !available.includes(selectedBranch)) {
        setSelectedBranch(available[0])
      }

      // 检查每个 worktree 分支的未合并提交数
      const counts: Record<string, number> = {}
      for (const wt of wtResult.worktrees.filter(w => !w.isMain)) {
        const result = await window.electronAPI.git.unmergedCommits({
          repoPath,
          branch: wt.branch,
        })
        counts[wt.branch] = result.count
      }
      setUnmergedCounts(counts)
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [repoPath])

  useEffect(() => {
    if (open) {
      void loadData()
    }
  }, [open, loadData])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleCreate = async (): void => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'new') {
        if (!newBranchName.trim()) {
          setError('请输入分支名称')
          setLoading(false)
          return
        }
        const result = await window.electronAPI.git.worktreeCreate({
          mainRepoPath: mainRepoPath || repoPath,
          branchName: newBranchName.trim(),
          createBranch: true,
          baseBranch: currentBranch,
        })
        if (result.error) { setError(result.error); setLoading(false); return }
        onCreate(result.worktreePath, result.branch)
        onClose()
      } else {
        if (!selectedBranch) {
          setError('请选择分支')
          setLoading(false)
          return
        }
        const result = await window.electronAPI.git.worktreeCreate({
          mainRepoPath: mainRepoPath || repoPath,
          branchName: selectedBranch,
          createBranch: false,
        })
        if (result.error) { setError(result.error); setLoading(false); return }
        onCreate(result.worktreePath, result.branch)
        onClose()
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const handleMerge = async (branch: string): void => {
    setMergeLoading(branch)
    setError('')
    try {
      const result = await window.electronAPI.git.mergeBranch({
        repoPath,
        branch,
      })
      if (!result.success) {
        setError(`合并 ${branch} 失败: ${result.error}`)
      } else {
        await loadData()
      }
    } catch (e) {
      setError(String(e))
    }
    setMergeLoading(null)
  }

  /* [2026-05-11] 更新 worktree：从当前分支拉取最新代码 */
  const handleUpdate = async (worktreePath: string, branch: string): Promise<void> => {
    setUpdateLoading(branch)
    setError('')
    try {
      const result = await window.electronAPI.git.updateWorktree({
        worktreePath,
        sourceBranch: currentBranch,
      })
      if (!result.success) {
        setError(`更新 ${branch} 失败: ${result.error}`)
      } else {
        await loadData()
      }
    } catch (e) {
      setError(String(e))
    }
    setUpdateLoading(null)
  }

  const handleDelete = (worktreePath: string, branch: string): void => {
    setConfirmDelete({ path: worktreePath, branch })
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmDelete) return
    const { path: worktreePath, branch } = confirmDelete
    setConfirmDelete(null)
    setDeleteLoading(branch)
    setError('')
    try {
      const result = await window.electronAPI.git.worktreeRemove({
        repoPath,
        worktreePath,
        force: true,
      })
      if (!result.success) {
        setError(`删除 ${branch} worktree 失败: ${result.error}`)
        setDeleteLoading(null)
        return
      }

      const branchResult = await window.electronAPI.git.branchDelete({ repoPath, branch, force: true })
      if (!branchResult.success) {
        setError(`worktree 已删除，但分支 ${branch} 删除失败: ${branchResult.error}`)
      }

      await loadData()
    } catch (e) {
      setError(String(e))
    }
    setDeleteLoading(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[min(480px,80vh)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-claude-border bg-claude-bg shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-claude-border px-4 py-3">
          <h2 className="text-sm font-medium text-claude-text">分屏 Worktree</h2>
          <p className="mt-1 text-[11px] text-claude-muted">创建新的 git worktree 并在独立会话中打开</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-3 px-4 space-y-3">
          {/* 当前分支信息 */}
          <div className="text-[11px] text-claude-muted">
            当前分支：<span className="text-amber-400 font-mono">{currentBranch}</span>
          </div>

          {/* 已存在的 worktree */}
          {worktrees.length > 1 && (
            <div className="space-y-1">
              <div className="text-[11px] text-claude-muted">已存在的 Worktree：</div>
              <div className="flex flex-col gap-1">
                {worktrees.filter(wt => !wt.isMain).map(wt => (
                  <div key={wt.path} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono flex-1 truncate">
                        {wt.branch}
                        {unmergedCounts[wt.branch] > 0 && (
                          <span className="ml-1 text-amber-400">({unmergedCounts[wt.branch]} 未合并)</span>
                        )}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreate(wt.path, wt.branch); onClose() }}
                        className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                      >
                        打开
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleUpdate(wt.path, wt.branch) }}
                        disabled={updateLoading === wt.branch}
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          unmergedCounts[wt.branch] > 0
                            ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                            : 'bg-slate-700/30 text-slate-400 hover:bg-slate-700/50'
                        } disabled:opacity-50`}
                      >
                        {updateLoading === wt.branch ? '更新中...' : '更新'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMerge(wt.branch) }}
                        disabled={mergeLoading === wt.branch || unmergedCounts[wt.branch] === 0}
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          unmergedCounts[wt.branch] > 0
                            ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                            : 'bg-slate-700/30 text-slate-500'
                        } disabled:opacity-50`}
                      >
                        {mergeLoading === wt.branch ? '合并中...' : '合并'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(wt.path, wt.branch) }}
                        disabled={deleteLoading === wt.branch}
                        className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                      >
                        {deleteLoading === wt.branch ? '删除中...' : '删除'}
                      </button>
                    </div>
                    {/* 内联确认行 */}
                    {confirmDelete?.branch === wt.branch && (
                      <div className="flex items-center gap-2 rounded border border-red-800/50 bg-red-950/30 px-2 py-1">
                        <span className="text-[10px] text-red-300 flex-1">确定删除？将同时删除目录和分支。</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void handleConfirmDelete() }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/40 text-red-300 hover:bg-red-600/60 shrink-0"
                        >
                          确认
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 hover:bg-slate-700 shrink-0"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 模式切换 */}
          <div className="flex rounded border border-claude-border overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`flex-1 py-1 ${mode === 'new' ? 'bg-amber-600/20 text-amber-300' : 'text-claude-muted hover:text-claude-text'}`}
            >
              新建分支
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              disabled={availableBranches.length === 0}
              className={`flex-1 py-1 border-l border-claude-border disabled:opacity-40 ${mode === 'existing' ? 'bg-amber-600/20 text-amber-300' : 'text-claude-muted hover:text-claude-text'}`}
              title={availableBranches.length === 0 ? '没有可挂载的本地分支' : undefined}
            >
              已有分支
            </button>
          </div>

          {/* 新建分支输入 */}
          {mode === 'new' && (
            <div className="space-y-1">
              <label className="text-[11px] text-claude-muted block">新分支名称：</label>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                placeholder="如: feat/new-feature"
                disabled={loading}
                autoFocus
                className="w-full text-[11px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface text-claude-text outline-none focus:border-amber-500/50 font-mono"
              />
            </div>
          )}

          {/* 已有分支选择 */}
          {mode === 'existing' && (
            <div className="space-y-1">
              <label className="text-[11px] text-claude-muted block">选择本地分支：</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={loading}
                className="w-full text-[11px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface text-claude-text outline-none focus:border-amber-500/50 font-mono"
              >
                {availableBranches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="text-[11px] text-red-400 bg-red-900/20 px-2 py-1 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-claude-border px-4 py-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 rounded border border-amber-600/50 bg-amber-600/20 py-2 text-xs font-medium text-amber-300 hover:bg-amber-600/30 disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建 Worktree'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-claude-border px-4 py-2 text-xs text-claude-muted hover:text-claude-text"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
