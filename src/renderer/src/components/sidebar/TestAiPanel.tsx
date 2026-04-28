/**
 * TestAiPanel - AI 测试分析面板
 *
 * 通过 Skill 命令让 AI 参与测试分析和修复。
 */
import React, { useCallback } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { useI18n } from '../../i18n'

export function TestAiPanel(): React.ReactElement {
  const { sessions, activeSessionId } = useSessionStore()
  const { t } = useI18n()

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const workdir = activeSession?.workdir ?? ''

  // 发送 AI 分析命令到主终端
  const handleAskAi = useCallback(() => {
    if (!activeSessionId) return

    // 通过 sendInput 发送 Skill 命令到终端
    const command = '/test-run\n'
    window.electronAPI.sendInput(activeSessionId, command)
  }, [activeSessionId])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Description */}
      <div className="px-2 pt-2 pb-1.5 shrink-0 border-b border-claude-border/50">
        <p className="text-[10px] text-claude-muted leading-relaxed">
          AI 模式会发送命令到 Claude Code 终端，让 Claude：
        </p>
        <ul className="mt-1 text-[9px] text-claude-muted/70 space-y-0.5 pl-3">
          <li>• 检测项目测试框架</li>
          <li>• 运行测试并分析失败原因</li>
          <li>• 提供修复建议并自动修复</li>
        </ul>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-2">
        {/* Ask AI button */}
        <button
          onClick={handleAskAi}
          disabled={!activeSessionId}
          className="w-full text-[11px] py-2 rounded bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 text-amber-400 disabled:opacity-40 disabled:hover:bg-amber-600/20 transition-colors"
        >
          {t.test.askAi}
        </button>

        {/* Hint */}
        <p className="mt-2 text-[9px] text-claude-border text-center">
          点击后会在主终端发送 /test-run 命令
        </p>

        {/* Workdir info */}
        {workdir && (
          <p className="mt-1 text-[9px] text-claude-muted/60 font-mono truncate max-w-full">
            当前目录: {workdir.split(/[/\\]/).pop()}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-2 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center">
        AI 分析结果将显示在主终端
      </div>
    </div>
  )
}