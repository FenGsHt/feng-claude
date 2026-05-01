import React, { useEffect, useState, useCallback } from 'react'
import type { McpEntry, McpServerConfig, McpServerType } from '../../types/ipc'
import { useI18n } from '../../i18n'

// ── Add / Edit form ──────────────────────────────────────────────────────────

interface FormState {
  name: string
  type: McpServerType
  command: string
  args: string        // space-separated
  url: string
  envRaw: string      // KEY=VALUE lines
}

const EMPTY_FORM: FormState = { name: '', type: 'stdio', command: '', args: '', url: '', envRaw: '' }

function parseEnv(raw: string): Record<string, string> | undefined {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return undefined
  const env: Record<string, string> = {}
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    env[line.slice(0, eq).trim()] = line.slice(eq + 1)
  }
  return Object.keys(env).length ? env : undefined
}

function formToConfig(f: FormState): McpServerConfig {
  if (f.type === 'stdio') {
    const args = f.args.trim() ? f.args.trim().split(/\s+/) : undefined
    return { type: 'stdio', command: f.command.trim(), args, env: parseEnv(f.envRaw) }
  }
  if (f.type === 'streamable-http') {
    // Claude Code spec: streamable-http uses "transport" field, not "type"
    return { transport: 'streamable-http', url: f.url.trim(), env: parseEnv(f.envRaw) }
  }
  return { type: 'sse', url: f.url.trim(), env: parseEnv(f.envRaw) }
}

function entryToForm(e: McpEntry): FormState {
  return {
    name: e.name,
    type: e.type,
    command: e.command ?? '',
    args: e.args?.join(' ') ?? '',
    url: e.url ?? '',
    envRaw: e.env ? Object.entries(e.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  }
}

function McpForm({
  initial,
  editingName,
  onSave,
  onCancel
}: {
  initial?: FormState
  editingName?: string
  onSave: (name: string, cfg: McpServerConfig) => void
  onCancel: () => void
}): React.ReactElement {
  const [form, setForm] = useState<FormState>(initial ?? EMPTY_FORM)
  const [error, setError] = useState('')
  const { t } = useI18n()
  const { lang } = useI18n()

  const set = (patch: Partial<FormState>): void => setForm((f) => ({ ...f, ...patch }))

  // Helper: get visual-agent env var from current form envRaw
  const getVaEnv = (key: string): string => {
    const lines = form.envRaw.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1)
    }
    return ''
  }
  const setVaEnv = (key: string, value: string): void => {
    const lines = form.envRaw.split('\n').map(l => l.trim()).filter(Boolean)
    const idx = lines.findIndex(l => l.indexOf('=') > 0 && l.slice(0, l.indexOf('=')).trim() === key)
    if (value) {
      const entry = `${key}=${value}`
      if (idx >= 0) lines[idx] = entry
      else lines.push(entry)
    } else if (idx >= 0) {
      lines.splice(idx, 1)
    }
    set({ envRaw: lines.join('\n') })
  }

  function submit(): void {
    const name = form.name.trim()
    if (!name) { setError('名称不能为空'); return }
    if (!/^[\w.-]+$/.test(name)) { setError('名称只允许字母、数字、- 和 _'); return }
    if (form.type === 'stdio' && !form.command.trim()) { setError('Command 不能为空'); return }
    if ((form.type === 'sse' || form.type === 'streamable-http') && !form.url.trim()) { setError('URL 不能为空'); return }
    onSave(name, formToConfig(form))
  }

  const inputCls = 'w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text outline-none focus:border-amber-500/60 font-mono placeholder-claude-border'

  return (
    <div className="mx-2 my-2 rounded-lg border border-claude-border bg-claude-bg/50 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-claude-text mb-1">
        {editingName ? `${t.mcp.editServer} ${editingName}` : t.mcp.addServer}
      </p>

      {/* Name */}
      {!editingName && (
        <div>
          <label className="text-[10px] text-claude-muted mb-0.5 block">{t.mcp.serverName}</label>
          <input className={inputCls} placeholder="my-server" value={form.name}
            onChange={(e) => { set({ name: e.target.value }); setError('') }} />
        </div>
      )}

      {/* Type */}
      <div className="flex gap-3 flex-wrap">
        {(['stdio', 'sse', 'streamable-http'] as const).map((tp) => (
          <label key={tp} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" checked={form.type === tp} onChange={() => set({ type: tp })}
              className="accent-amber-500" />
            <span className="text-[11px] text-claude-text uppercase font-mono">{tp}</span>
          </label>
        ))}
      </div>

      {/* stdio fields */}
      {form.type === 'stdio' ? (
        <>
          <div>
            <label className="text-[10px] text-claude-muted mb-0.5 block">Command</label>
            <input className={inputCls} placeholder="npx" value={form.command}
              onChange={(e) => { set({ command: e.target.value }); setError('') }} />
          </div>
          <div>
            <label className="text-[10px] text-claude-muted mb-0.5 block">{t.mcp.args}</label>
            <input className={inputCls} placeholder="-y @modelcontextprotocol/server-filesystem /path"
              value={form.args} onChange={(e) => set({ args: e.target.value })} />
          </div>
        </>
      ) : (
        <div>
          <label className="text-[10px] text-claude-muted mb-0.5 block">
            URL
            {form.type === 'streamable-http' && (
              <span className="ml-1 text-claude-muted/60">(streamable-http)</span>
            )}
          </label>
          <input
            className={inputCls}
            placeholder={form.type === 'streamable-http' ? 'http://127.0.0.1:12306/mcp' : 'http://localhost:3000/sse'}
            value={form.url}
            onChange={(e) => { set({ url: e.target.value }); setError('') }}
          />
        </div>
      )}

      {/* Env vars */}
      {editingName === 'visual-agent' ? (
        <>
          <div className="border-t border-amber-500/30 pt-2 mt-2">
            <p className="text-[9px] text-claude-muted mb-1.5">
              {lang === 'zh' ? '配置 API 信息，通过环境变量传递给 visual-agent MCP' : 'Configure API info, passed to visual-agent MCP via environment variables'}
            </p>
            <div className="space-y-1.5">
              <div>
                <label className="text-[9px] text-claude-muted block mb-0.5">VISUAL_AGENT_AUTH_TOKEN</label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="sk-ant-..."
                  value={getVaEnv('VISUAL_AGENT_AUTH_TOKEN')}
                  onChange={(e) => setVaEnv('VISUAL_AGENT_AUTH_TOKEN', e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] text-claude-muted block mb-0.5">VISUAL_AGENT_BASE_URL</label>
                <input
                  className={inputCls}
                  placeholder="https://api.anthropic.com"
                  value={getVaEnv('VISUAL_AGENT_BASE_URL')}
                  onChange={(e) => setVaEnv('VISUAL_AGENT_BASE_URL', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[9px] text-claude-muted block mb-0.5">{lang === 'zh' ? '模型' : 'Model'}</label>
                  <input
                    className={inputCls}
                    placeholder="claude-sonnet-4-6"
                    value={getVaEnv('VISUAL_AGENT_MODEL')}
                    onChange={(e) => setVaEnv('VISUAL_AGENT_MODEL', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] text-claude-muted block mb-0.5">{lang === 'zh' ? '格式' : 'Format'}</label>
                  <select
                    className={inputCls}
                    value={getVaEnv('VISUAL_AGENT_FORMAT') || 'anthropic'}
                    onChange={(e) => setVaEnv('VISUAL_AGENT_FORMAT', e.target.value)}
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-1.5">
              <span className={`text-[9px] ${getVaEnv('VISUAL_AGENT_AUTH_TOKEN') ? 'text-green-400' : 'text-red-400'}`}>
                {getVaEnv('VISUAL_AGENT_AUTH_TOKEN')
                  ? (lang === 'zh' ? '已配置 ✓' : 'Configured ✓')
                  : (lang === 'zh' ? '未配置 — 请设置 API Token' : 'Not configured — please set API Token')}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className="text-[10px] text-claude-muted mb-0.5 block">{t.mcp.envVars}</label>
          <textarea className={`${inputCls} resize-none h-14`} placeholder="GITHUB_TOKEN=ghp_xxx"
            value={form.envRaw} onChange={(e) => set({ envRaw: e.target.value })} />
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={submit}
          className="flex-1 py-1 text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30 transition-colors font-medium">
          {t.common.save}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1 text-[11px] text-claude-muted hover:text-claude-text border border-claude-border rounded transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

// ── Server row ───────────────────────────────────────────────────────────────

function McpRow({
  entry,
  onToggle,
  onEdit,
  onRemove
}: {
  entry: McpEntry
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { t } = useI18n()

  const preview =
    entry.type === 'stdio'
      ? [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ')
      : (entry.url ?? '')   // sse / streamable-http both show URL

  return (
    <div className="border-b" style={{ borderBottomColor: 'var(--claude-border-subtle)' }}>
      <div className="px-3 py-2 hover:bg-claude-bg/30 group">
        <div className="flex items-center gap-2">
          {/* Expand arrow */}
          <button onClick={() => setExpanded((v) => !v)}
            className={`shrink-0 text-[9px] text-claude-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-claude-text">{entry.name}</span>
              <span className={`text-[9px] px-1 rounded font-mono border ${
                entry.type === 'stdio'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : entry.type === 'streamable-http'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
              }`}>
                {entry.type.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-claude-muted mt-0.5 truncate font-mono">{preview}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} title={t.common.edit}
              className="w-5 h-5 flex items-center justify-center text-claude-muted hover:text-amber-400 rounded transition-colors">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={() => { if (confirmDelete) onRemove(); else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000) } }}
              title={confirmDelete ? t.common.confirmDelete : t.common.delete}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${confirmDelete ? 'text-red-400' : 'text-claude-muted hover:text-red-400'}`}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 3h8M4 3V2h3v1M4.5 5v3.5M6.5 5v3.5M2.5 3l.5 6h5l.5-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Toggle */}
          <button onClick={onToggle} title={entry.isEnabled ? t.common.disable : t.common.enable}
            className={`shrink-0 relative w-8 h-4 rounded-full transition-colors ${entry.isEnabled ? 'bg-amber-500' : 'bg-claude-border'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${entry.isEnabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 bg-claude-bg/20 text-[10px] font-mono space-y-1">
          {entry.type === 'stdio' && (
            <>
              <div className="text-claude-muted">command: <span className="text-claude-text">{entry.command}</span></div>
              {entry.args?.length ? (
                <div className="text-claude-muted">args: <span className="text-claude-text">{JSON.stringify(entry.args)}</span></div>
              ) : null}
            </>
          )}
          {(entry.type === 'sse' || entry.type === 'streamable-http') && (
            <div className="text-claude-muted">url: <span className="text-claude-text">{entry.url}</span></div>
          )}
          {entry.env && Object.keys(entry.env).length > 0 && (
            <div className="text-claude-muted">
              env: {Object.entries(entry.env).map(([k]) => (
                <span key={k} className="ml-1 px-1 bg-claude-border/40 rounded text-claude-text">{k}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function McpPanel(): React.ReactElement {
  const [servers, setServers] = useState<McpEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<McpEntry | null>(null)
  const { t } = useI18n()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.mcp.list()
      setServers(list)
    } catch (e) {
      console.error('[McpPanel] list failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const handleAdd = async (name: string, cfg: McpServerConfig): Promise<void> => {
    await window.electronAPI.mcp.add(name, cfg)
    setAdding(false)
    await reload()
  }

  const handleUpdate = async (name: string, cfg: McpServerConfig): Promise<void> => {
    await window.electronAPI.mcp.update(name, cfg)
    setEditing(null)
    await reload()
  }

  const handleRemove = async (name: string): Promise<void> => {
    await window.electronAPI.mcp.remove(name)
    await reload()
  }

  const handleToggle = async (entry: McpEntry): Promise<void> => {
    await window.electronAPI.mcp.setEnabled(entry.name, !entry.isEnabled)
    setServers((prev) => prev.map((s) => s.name === entry.name ? { ...s, isEnabled: !s.isEnabled } : s))
  }

  const enabledCount = servers.filter((s) => s.isEnabled).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-claude-border shrink-0">
        <span className="text-[10px] text-claude-muted">
          {servers.length > 0
            ? t.mcp.enabledCount.replace('{enabled}', String(enabledCount)).replace('{total}', String(servers.length))
            : t.mcp.noServersEmpty}
        </span>
        <button
          onClick={() => { setAdding(true); setEditing(null) }}
          className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {t.mcp.addServer}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <McpForm onSave={handleAdd} onCancel={() => setAdding(false)} />
      )}

      {/* Edit form */}
      {editing && (
        <McpForm
          initial={entryToForm(editing)}
          editingName={editing.name}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-claude-muted text-xs">{t.common.loading}</div>
        ) : servers.length === 0 && !adding ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-claude-muted">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="opacity-30">
              <rect x="3" y="7" width="22" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 11h4M8 15h8M16 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <p className="text-xs">{t.mcp.noServers}</p>
            <button onClick={() => setAdding(true)} className="text-[11px] text-amber-400 hover:underline">
              {t.mcp.addFirst}
            </button>
          </div>
        ) : (
          servers.map((entry) => (
            <McpRow
              key={entry.name}
              entry={entry}
              onToggle={() => void handleToggle(entry)}
              onEdit={() => { setEditing(entry); setAdding(false) }}
              onRemove={() => void handleRemove(entry.name)}
            />
          ))
        )}
      </div>

      <div className="shrink-0 px-3 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center">
        {t.mcp.footerHint}
      </div>
    </div>
  )
}

      