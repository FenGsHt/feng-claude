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
  const [newBranchName, setNewBranchName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mergeLoading, setMergeLoading] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

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

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      onCreate(result.worktreePath, result.branch)
      onClose()
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
        // 合并成功，刷新数据
        await loadData()
      }
    } catch (e) {
      setError(String(e))
    }
    setMergeLoading(null)
  }

  const handleDelete = async (worktreePath: string, branch: string): void => {
    // 确认删除
    if (!confirm(`确定要删除吗？\n\n分支: ${branch}\n路径: ${worktreePath}\n\n将同时删除 worktree 目录和分支，此操作不可撤销。`)) {
      return
    }
    setDeleteLoading(branch)
    setError('')
    try {
      // 1. 删除 worktree
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

      // 2. 删除分支
      const branchResult = await window.electronAPI.git.branchDelete({ repoPath, branch, force: true })
      if (!branchResult.success) {
        setError(`worktree 已删除，但分支 ${branch} 删除失败: ${branchResult.error}`)
        // 不 return，继续刷新列表
      }

      // 删除成功，刷新数据
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
                  <div key={wt.path} className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono flex-1 truncate">
                      {wt.branch}
                      {unmergedCounts[wt.branch] > 0 && (
                        <span className="ml-1 text-amber-400">({unmergedCounts[wt.branch]} 未合并)</span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCreate(wt.path, wt.branch)
                        onClose()
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                      title={`打开 ${wt.branch} 的 worktree 会话`}
                    >
                      打开
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMerge(wt.branch)
                      }}
                      disabled={mergeLoading === wt.branch || unmergedCounts[wt.branch] === 0}
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        unmergedCounts[wt.branch] > 0
                          ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                          : 'bg-slate-700/30 text-slate-500'
                      } disabled:opacity-50`}
                      title={unmergedCounts[wt.branch] > 0 ? `合并 ${wt.branch} 到 ${currentBranch}` : '无未合并提交'}
                    >
                      {mergeLoading === wt.branch ? '合并中...' : '合并'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(wt.path, wt.branch)
                      }}
                      disabled={deleteLoading === wt.branch}
                      className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                      title={`删除 ${wt.branch} 的 worktree`}
                    >
                      {deleteLoading === wt.branch ? '删除中...' : '删除'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 新分支名称 */}
          <div className="space-y-1">
            <label className="text-[11px] text-claude-muted block">新分支名称：</label>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="如: feat/new-feature"
              disabled={loading}
              className="w-full text-[11px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface text-claude-text outline-none focus:border-amber-500/50 font-mono"
            />
          </div>

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