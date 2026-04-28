/**
 * TestRunnerPanel - 独立测试运行面板
 *
 * 自动检测测试框架，运行测试并展示结果。
 */
import React, { useEffect, useCallback } from 'react'
import { useTestStore } from '../../store/testStore'
import { useSessionStore } from '../../store/sessionStore'
import { useI18n } from '../../i18n'
import type { TestFrameworkInfo, TestResultItem, TestSummary } from '../../types/ipc'

export function TestRunnerPanel(): React.ReactElement {
  const { framework, detecting, running, outputBuffer, results, summary, status,
          setFramework, setDetecting, setRunning, setSessionId, appendOutput, clearOutput,
          setSummary, setStatus, reset } = useTestStore()
  const { sessions, activeSessionId } = useSessionStore()
  const { t } = useI18n()

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const workdir = activeSession?.workdir ?? ''

  // IPC 事件订阅
  useEffect(() => {
    const unsubOutput = window.electronAPI.onTestOutput((payload) => {
      if (payload.sessionId === useTestStore.getState().sessionId) {
        appendOutput(payload.data)
      }
    })
    const unsubStatus = window.electronAPI.onTestStatus((payload) => {
      if (payload.sessionId === useTestStore.getState().sessionId) {
        setStatus(payload.status)
        setRunning(payload.status === 'running')
        if (payload.summary) {
          setSummary(payload.summary)
        }
        if (payload.status !== 'running') {
          setSessionId(null)
        }
      }
    })
    return () => {
      unsubOutput()
      unsubStatus()
    }
  }, [appendOutput, setStatus, setRunning, setSummary, setSessionId])

  // 自动检测框架
  useEffect(() => {
    if (workdir && !framework && !detecting) {
      setDetecting(true)
      window.electronAPI.test.detectFramework(workdir).then((fw) => {
        setFramework(fw)
        setDetecting(false)
      })
    }
  }, [workdir, framework, detecting, setFramework, setDetecting])

  // 运行测试
  const handleRun = useCallback(async () => {
    if (!workdir || !framework || framework.name === 'none') return

    const sessionId = crypto.randomUUID()
    clearOutput()
    setSessionId(sessionId)
    setRunning(true)
    setStatus('running')

    await window.electronAPI.test.run(sessionId, workdir, framework)
  }, [workdir, framework, clearOutput, setSessionId, setRunning, setStatus])

  // 取消测试
  const handleCancel = useCallback(async () => {
    const sid = useTestStore.getState().sessionId
    if (sid) {
      await window.electronAPI.test.cancel(sid)
      setRunning(false)
      setSessionId(null)
      setStatus('cancelled')
    }
  }, [setRunning, setSessionId, setStatus])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-1.5 shrink-0 border-b border-claude-border/50">
        {/* Framework indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-700/50">
          <FrameworkIcon name={framework?.name ?? 'none'} />
          <span className="text-[10px] text-slate-400">
            {detecting ? t.test.detecting : framework?.name ?? t.test.noFramework}
          </span>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running || !framework || framework.name === 'none'}
          className="flex-1 text-[10px] py-1 rounded bg-green-600/20 hover:bg-green-600/40 border border-green-600/40 text-green-400 disabled:opacity-40 disabled:hover:bg-green-600/20 transition-colors"
        >
          {running ? t.test.running : t.test.runTests}
        </button>

        {/* Cancel button */}
        {running && (
          <button
            onClick={handleCancel}
            className="text-[10px] px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 text-red-400 transition-colors"
          >
            {t.test.cancel}
          </button>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto py-1">
        {status === 'running' && outputBuffer && !results.length ? (
          // 运行中显示输出
          <pre className="px-2 text-[9px] text-claude-muted font-mono whitespace-pre-wrap">
            {outputBuffer.slice(-2000)}
          </pre>
        ) : results.length === 0 ? (
          // 空状态
          <div className="flex flex-col items-center justify-center py-8 text-claude-muted text-xs gap-1">
            <span>{t.test.noResults}</span>
            {framework && framework.name !== 'none' && (
              <span className="text-[9px] text-claude-border">
                点击"运行测试"开始
              </span>
            )}
          </div>
        ) : (
          // 测试结果列表
          results.map((result, i) => (
            <TestResultRow key={i} result={result} />
          ))
        )}
      </div>

      {/* Summary footer */}
      {summary && (
        <div className="shrink-0 px-2 py-1.5 border-t border-claude-border bg-slate-800/30">
          <TestSummaryBar summary={summary} />
        </div>
      )}
    </div>
  )
}

// 框架图标
function FrameworkIcon({ name }: { name: string }): React.ReactElement {
  if (name === 'vitest') {
    return <span className="text-[10px] text-yellow-400">⚡</span>
  }
  if (name === 'jest') {
    return <span className="text-[10px] text-red-400">🃏</span>
  }
  if (name === 'playwright') {
    return <span className="text-[10px] text-green-400">🎭</span>
  }
  if (name === 'mocha') {
    return <span className="text-[10px] text-brown-400">☕</span>
  }
  return <span className="text-[10px] text-slate-400">○</span>
}

// 测试结果行
function TestResultRow({ result }: { result: TestResultItem }): React.ReactElement {
  const statusColor = result.status === 'passed' ? 'text-green-400' : result.status === 'failed' ? 'text-red-400' : 'text-amber-400'
  const statusIcon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○'

  return (
    <div className="px-2 py-1 text-[10px] border-b border-claude-border/30 hover:bg-claude-bg/30">
      <div className="flex items-center gap-1.5">
        <span className={`${statusColor} shrink-0`}>{statusIcon}</span>
        <span className="text-claude-text truncate">{result.name}</span>
        <span className="text-claude-muted/60 ml-auto font-mono">{result.duration}ms</span>
      </div>
      {result.error && (
        <div className="mt-0.5 text-[9px] text-red-400/80 pl-4 truncate">
          {result.error}
        </div>
      )}
    </div>
  )
}

// 测试汇总条
function TestSummaryBar({ summary }: { summary: TestSummary }): React.ReactElement {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-3">
      {/* Pass/Fail counts */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-green-400">✓ {summary.passed}</span>
        <span className="text-[10px] text-red-400">✗ {summary.failed}</span>
        {summary.skipped > 0 && (
          <span className="text-[10px] text-amber-400">○ {summary.skipped}</span>
        )}
      </div>

      {/* Total */}
      <span className="text-[9px] text-claude-muted">
        {t.test.totalTests}: {summary.total}
      </span>

      {/* Duration */}
      <span className="text-[9px] text-claude-muted">
        {t.test.duration}: {(summary.duration / 1000).toFixed(1)}s
      </span>

      {/* Coverage */}
      {summary.coverage && (
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-claude-muted">{t.test.coverage}</span>
          <span className="text-[10px] text-amber-400 font-mono">
            {summary.coverage.lines.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  )
}