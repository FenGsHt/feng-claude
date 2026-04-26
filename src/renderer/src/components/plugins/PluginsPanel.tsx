import React, { useEffect, useState, useMemo } from 'react'
import type { PluginEntry } from '../../types/ipc'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

const PLUGIN_ZH: Record<string, string> = {
  'frontend-design': '生成独特的生产级前端界面，避免 AI 审美疲劳，注重大胆排版与高冲击力动效',
  'code-review': '多专家视角自动化代码审查，覆盖安全、性能、可维护性等维度',
  'code-simplifier': '识别并简化过度复杂的代码，提升可读性与可维护性',
  'feature-dev': '结构化功能开发工作流，从需求分析到实现、测试全流程引导',
  'ralph-loop': 'Ralph Wiggum 迭代技术：通过自我参照循环实现持续改进',
  'typescript-lsp': 'Claude Code 内置 TypeScript/JavaScript 语言服务器，提供代码补全与诊断',
  'commit-commands': '简化 Git 提交流程，提供 /commit、/push 等快捷命令',
  'security-guidance': '实时安全最佳实践指导，帮助识别和修复常见漏洞',
  'github': '集成 GitHub PR、Issue 管理，支持代码审查与发布操作',
  'superpowers': '增强 Claude 的推理能力，提供更深入的分析与解题策略',
  'context7': '集成 Context7，为代码库提供精准的上下文感知文档检索',
  'playwright': '自动化浏览器测试，生成和运行 Playwright 端到端测试',
  'agent-sdk-dev': 'Claude Agent SDK 开发辅助，加速构建多智能体工作流',
  'claude-code-setup': '项目初始化向导，自动配置 CLAUDE.md 与开发环境',
  'claude-md-management': 'CLAUDE.md 文件管理，保持项目记忆文件整洁有序',
  'pr-review-toolkit': 'Pull Request 审查工具集，自动生成审查意见与变更摘要',
  'feature-dev': '结构化功能开发工作流，从需求到上线全流程覆盖',
  'hookify': '可视化管理 Claude Code hooks，简化钩子配置与调试',
  'skill-creator': '快速创建自定义技能（Skill），扩展 Claude 的专属能力',
  'mcp-server-dev': 'MCP 服务器开发辅助，加速构建 Model Context Protocol 服务',
  'learning-output-style': '教学式输出风格，附带详细解释与学习引导',
  'explanatory-output-style': '解释型输出风格，为每个操作提供清晰的原因说明',
  'rust-analyzer-lsp': 'Rust 语言服务器集成，提供类型检查、补全与重构支持',
  'gopls-lsp': 'Go 语言官方 LSP 集成，提供补全、诊断与跳转功能',
  'pyright-lsp': 'Python 静态类型检查器 Pyright 集成',
  'clangd-lsp': 'C/C++ Clangd 语言服务器集成',
  'ruby-lsp': 'Ruby 语言服务器集成',
  'swift-lsp': 'Swift 语言服务器集成',
  'kotlin-lsp': 'Kotlin 语言服务器集成',
  'csharp-lsp': 'C# 语言服务器集成',
  'jdtls-lsp': 'Java 语言服务器集成',
  'lua-lsp': 'Lua 语言服务器集成',
  'php-lsp': 'PHP 语言服务器集成',
  'claude-hud': '终端状态栏实时显示上下文用量、活跃工具、Git 信息等 HUD 信息',
  'math-olympiad': '数学竞赛解题辅助，提供严格的数学推导与证明',
  'playground': '实验性功能测试场，用于探索新特性',
  'plugin-dev': '插件开发辅助工具，帮助构建和调试 Claude Code 插件',
}

const MARKETPLACE_LABELS: Record<string, string> = {
  'claude-plugins-official': '官方市场',
  'claude-hud': 'Claude HUD',
  'custom': '自定义'
}

function marketplaceLabel(id: string): string {
  return MARKETPLACE_LABELS[id] ?? id
}

export function PluginsPanel(): React.ReactElement {
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'all' | 'enabled'>('all')

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.electronAPI.plugins?.list()
      setPlugins(list ?? [])
    } catch (e) {
      console.error('[PluginsPanel] failed to load plugins:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const filtered = useMemo(() => {
    let list = tab === 'enabled' ? plugins.filter((p) => p.isEnabled) : plugins
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [plugins, query, tab])

  const handleToggle = async (plugin: PluginEntry): Promise<void> => {
    setToggling((s) => new Set(s).add(plugin.id))
    try {
      await window.electronAPI.plugins.setEnabled(plugin.id, !plugin.isEnabled)
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, isEnabled: !p.isEnabled } : p))
      )
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(plugin.id); return n })
    }
  }

  const enabledCount = plugins.filter((p) => p.isEnabled).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-claude-border shrink-0">
        {(['all', 'enabled'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t
                ? 'text-amber-400 border-b-2 border-amber-400 -mb-px'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {t === 'all' ? '市场' : `已启用 ${enabledCount > 0 ? `(${enabledCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索插件..."
          className="w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60 font-mono"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {tab === 'enabled' ? '未启用任何插件' : '无匹配插件'}
          </div>
        ) : (
          filtered.map((plugin) => (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              toggling={toggling.has(plugin.id)}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-3 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center leading-snug">
        开关立即生效，新会话重启后加载插件
      </div>
    </div>
  )
}

function PluginRow({
  plugin,
  toggling,
  onToggle
}: {
  plugin: PluginEntry
  toggling: boolean
  onToggle: (p: PluginEntry) => void
}): React.ReactElement {
  return (
    <div className="px-3 py-2.5 border-b border-claude-border/50 hover:bg-claude-bg/40 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-claude-text">{plugin.name}</span>
            {plugin.isInstalled && (
              <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-400 border border-green-500/20">
                已安装
              </span>
            )}
            {plugin.installCount > 0 && (
              <span className="text-[9px] text-claude-muted ml-auto">
                ↓ {formatCount(plugin.installCount)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-claude-muted mt-0.5 leading-snug line-clamp-2">
            {PLUGIN_ZH[plugin.name] ?? plugin.description || '暂无描述'}
          </p>
          <p className="text-[9px] text-claude-border mt-0.5">{marketplaceLabel(plugin.marketplace)}</p>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(plugin)}
          disabled={toggling}
          title={plugin.isEnabled ? '点击禁用' : '点击启用'}
          className={`shrink-0 mt-0.5 relative w-8 h-4 rounded-full transition-colors ${
            toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${plugin.isEnabled ? 'bg-amber-500' : 'bg-claude-border'}`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${
              plugin.isEnabled ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
