/**
 * TestPanel - 测试验收面板
 *
 * 包含两种模式：
 * 1. 独立模式：后台运行测试子进程，解析结果展示
 * 2. AI 模式：通过 Skill 让 AI 参与测试分析
 */
import React, { useState } from 'react'
import { TestRunnerPanel } from './TestRunnerPanel'
import { TestAiPanel } from './TestAiPanel'
import { useI18n } from '../../i18n'

type SubTab = 'runner' | 'ai'

export function TestPanel(): React.ReactElement {
  const [subTab, setSubTab] = useState<SubTab>('runner')
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex shrink-0 border-b border-claude-border">
        {(['runner', 'ai'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex-1 text-[10.5px] py-1.5 font-medium transition-colors ${
              subTab === tab
                ? 'text-amber-400 border-b-2 border-amber-500 -mb-px'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {tab === 'runner' ? t.test.runnerMode : t.test.aiMode}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'runner' ? <TestRunnerPanel /> : <TestAiPanel />}
    </div>
  )
}