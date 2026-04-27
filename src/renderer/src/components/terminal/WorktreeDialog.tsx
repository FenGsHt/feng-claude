import React, { useEffect, useState, useCallback } from 'react'

interface Props {
  open: boolean
  repoPath: string
  onClose: () => void
  onCreate: (worktreePath: string, branch: string) => void
}

export function WorktreeDialog({ open, repoPath, onClose, onCreate }: Props): React.ReactElement | null {
  const [branches, setBranches] = useState<Array<{ name: string; isCurrent: boolean; isRemote: boolean }>>([])
  const [currentBranch, setCurrentBranch] = useState('')
  const [worktrees, setWorktrees] = useState<Array<{ path: string; branch: string; commit: string; isMain: boolean }>>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mergeLoading, setMergeLoading] = useState<string | null>(null) // 正在合并的分支名

  // 加载分支和 worktree 信息
  const loadData = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError('')
    try {
      const branchResult = await window.electronAPI.git.branchList(repoPath)
      setBranches(branchResult.branches)
      setCurrentBranch(branchResult.currentBranch)
      if (!selectedBranch && branchResult.currentBranch) {
        setSelectedBranch(branchResult.currentBranch)
      }

      const wtResult = await window.electronAPI.git.worktreeList(repoPath)
      setWorktrees(wtResult.worktrees)
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [repoPath, selectedBranch])

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
      const branchToUse = createNewBranch ? newBranchName : selectedBranch
      if (!branchToUse) {
        setError('请选择或输入分支名称')
        setLoading(false)
        return
      }

      const result = await window.electronAPI.git.worktreeCreate({
        mainRepoPath: repoPath,
        branchName: branchToUse,
        createBranch: createNewBranch,
        baseBranch: createNewBranch ? selectedBranch : undefined,
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

  // 已存在的 worktree 分支
  const existingWorktreeBranches = worktrees.map(wt => wt.branch)

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
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMerge(wt.branch)
                      }}
                      disabled={mergeLoading === wt.branch}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 shrink-0"
                      title={`合并 ${wt.branch} 到 ${currentBranch}`}
                    >
                      {mergeLoading === wt.branch ? '合并中...' : '合并'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 选择已有分支 */}
          <div className="space-y-1">
            <label className="text-[11px] text-claude-muted block">选择分支：</label>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value)
                setCreateNewBranch(false)
              }}
              disabled={loading}
              className="w-full text-[11px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface text-claude-text outline-none focus:border-amber-500/50"
            >
              {branches.filter(b => !b.isRemote && !existingWorktreeBranches.includes(b.name)).map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} {b.isCurrent ? '(当前)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 创建新分支 */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={createNewBranch}
                onChange={(e) => setCreateNewBranch(e.target.checked)}
                className="w-3 h-3 rounded border-claude-border"
              />
              <label className="text-[11px] text-claude-muted">创建新分支</label>
            </div>
            {createNewBranch && (
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="新分支名称 (如: feat/new-feature)"
                disabled={loading}
                className="w-full text-[11px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface text-claude-text outline-none focus:border-amber-500/50 font-mono"
              />
            )}
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