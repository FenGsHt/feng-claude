import React, { useEffect, useState, useMemo } from 'react'
import type { PluginEntry } from '../../types/ipc'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
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
      const list = await window.electronAPI.plugins.list()
      setPlugins(list)
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
            {plugin.description || '暂无描述'}
          </p>
          <p className="text-[9px] text-claude-border mt-0.5 font-mono">{plugin.marketplace}</p>
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
