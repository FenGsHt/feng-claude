import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { SkillEntry } from '../../types/ipc'
import { useI18n } from '../../i18n'

// ── Markdown viewer (lightweight) ────────────────────────────────────────────

function MarkdownPreview({ content }: { content: string }): React.ReactElement {
  // Very simple render: headings, bold, inline-code, paragraphs
  const lines = content.split('\n')
  const elements: React.ReactElement[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-[11px] font-semibold text-claude-text mt-2 mb-0.5">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-[12px] font-bold text-amber-400 mt-3 mb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-[13px] font-bold text-claude-text mt-1 mb-1">{line.slice(2)}</h1>)
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="border-claude-border my-1" />)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-[10px] text-claude-muted">
          <span className="text-amber-500 mt-0.5">•</span>
          <span>{line.slice(2)}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
    } else {
      elements.push(
        <p key={i} className="text-[10px] text-claude-muted leading-relaxed">
          {line}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

// ── Content modal ─────────────────────────────────────────────────────────────

function ContentModal({
  skill,
  content,
  onClose,
  onEdit
}: {
  skill: SkillEntry
  content: string
  onClose: () => void
  onEdit: () => void
}): React.ReactElement {
  const { t } = useI18n()
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative z-10 w-[480px] max-w-[92vw] max-h-[80vh] bg-claude-surface border border-claude-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-claude-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-claude-text">/{skill.name}</span>
              {skill.isFolder && (
                <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{t.skills.folderBadge}</span>
              )}
            </div>
            {skill.description && (
              <p className="text-[10px] text-claude-muted truncate mt-0.5">{skill.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit}
              className="text-[10px] px-2 py-1 rounded text-claude-muted hover:text-amber-400 hover:bg-claude-border transition-colors">
              {t.common.edit}
            </button>
            <button onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors">
              <svg width="9" height="9" viewBox="0 0 9 9">
                <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <MarkdownPreview content={content} />
        </div>
      </div>
    </div>
  )
}

// ── Editor modal ──────────────────────────────────────────────────────────────

function EditorModal({
  skill,
  initialContent,
  initialName,
  onSave,
  onClose
}: {
  skill?: SkillEntry
  initialContent: string
  initialName?: string
  onSave: (name: string, content: string, isFolder: boolean) => void
  onClose: () => void
}): React.ReactElement {
  const [name, setName] = useState(initialName ?? '')
  const [content, setContent] = useState(initialContent)
  const [error, setError] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const { t } = useI18n()

  useEffect(() => { taRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function submit(): void {
    const n = name.trim()
    if (!n) { setError('名称不能为空'); return }
    if (!/^[\w-]+$/.test(n)) { setError('只允许字母、数字、- 和 _'); return }
    onSave(n, content, skill?.isFolder ?? false)
  }

  const inputCls = 'w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text outline-none focus:border-amber-500/60 font-mono placeholder-claude-border'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative z-10 w-[520px] max-w-[94vw] max-h-[85vh] bg-claude-surface border border-claude-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-claude-border shrink-0">
          <span className="text-[13px] font-semibold text-claude-text flex-1">
            {skill ? `${t.skills.editSkill} /${skill.name}` : t.skills.newSkill}
          </span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors">
            <svg width="9" height="9" viewBox="0 0 9 9">
              <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Name */}
          {!skill && (
            <div>
              <label className="text-[10px] text-claude-muted mb-0.5 block">{t.skills.skillName}</label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-claude-muted font-mono">/</span>
                <input className={inputCls} placeholder="my-skill" value={name}
                  onChange={(e) => { setName(e.target.value); setError('') }} />
              </div>
              {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
            </div>
          )}

          {/* Content */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] text-claude-muted">{t.skills.content}</label>
              <span className="text-[9px] text-claude-border">{content.length} {t.skills.chars}</span>
            </div>
            <textarea
              ref={taRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-64 bg-claude-bg border border-claude-border rounded px-2 py-1.5 text-[11px] text-claude-text outline-none focus:border-amber-500/60 font-mono resize-none placeholder-claude-border leading-relaxed"
              placeholder={`# My Skill\n\nDescribe what this skill does and how Claude should use it.\n\n## Instructions\n\n- Step 1\n- Step 2`}
            />
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-claude-border shrink-0">
          <button onClick={submit}
            className="flex-1 py-1.5 text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30 transition-colors font-medium">
            {t.common.save}
          </button>
          <button onClick={onClose}
            className="px-4 py-1.5 text-[11px] text-claude-muted hover:text-claude-text border border-claude-border rounded transition-colors">
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skill row ─────────────────────────────────────────────────────────────────

function SkillRow({
  skill,
  onView,
  onEdit,
  onDelete
}: {
  skill: SkillEntry
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { t } = useI18n()

  return (
    <div
      className="px-3 py-2.5 border-b hover:bg-claude-bg/30 group cursor-pointer"
      style={{ borderBottomColor: 'var(--claude-border-subtle)' }}
      onClick={onView}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-amber-400 font-mono">/{skill.name}</span>
            {skill.isFolder && (
              <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {t.skills.folderBadge}
              </span>
            )}
            {skill.source === 'extra' && (
              <span className="text-[9px] px-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                extra
              </span>
            )}
          </div>
          {skill.title && skill.title !== skill.name && (
            <p className="text-[11px] text-claude-text leading-snug mt-0.5">{skill.title}</p>
          )}
          {skill.description && (
            <p className="text-[10px] text-claude-muted leading-snug mt-0.5 line-clamp-2">
              {skill.description}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={(e) => e.stopPropagation()}>
          <button onClick={onEdit} title={t.common.edit}
            className="w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-amber-400 hover:bg-claude-border transition-colors">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            title={confirmDelete ? t.common.confirmDelete : t.common.delete}
            onClick={() => {
              if (confirmDelete) onDelete()
              else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000) }
            }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              confirmDelete ? 'text-red-400 bg-red-500/10' : 'text-claude-muted hover:text-red-400 hover:bg-claude-border'
            }`}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 3h8M4 3V2h3v1M4.5 5v3.5M6.5 5v3.5M2.5 3l.5 6h5l.5-6"
                stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

const NEW_SKILL_TEMPLATE = `# Skill Name

Brief description of what this skill does.

## When to use

Describe the trigger conditions — when Claude should apply this skill.

## Instructions

- Step 1
- Step 2
- Step 3

## Gotchas

- Known pitfall or edge case
`

export function SkillsPanel(): React.ReactElement {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<{ skill: SkillEntry; content: string } | null>(null)
  const [editing, setEditing] = useState<{ skill?: SkillEntry; content: string } | null>(null)
  const { t } = useI18n()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.skills.list()
      setSkills(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const openView = useCallback(async (skill: SkillEntry) => {
    const content = await window.electronAPI.skills.get(skill.name, skill.source)
    setViewing({ skill, content })
  }, [])

  const openEdit = useCallback(async (skill: SkillEntry) => {
    const content = await window.electronAPI.skills.get(skill.name, skill.source)
    setViewing(null)
    setEditing({ skill, content })
  }, [])

  const handleSave = useCallback(async (name: string, content: string, isFolder: boolean) => {
    await window.electronAPI.skills.save(name, content, isFolder)
    setEditing(null)
    await reload()
  }, [reload])

  const handleDelete = useCallback(async (skill: SkillEntry) => {
    await window.electronAPI.skills.delete(skill.name, skill.isFolder)
    await reload()
  }, [reload])

  const filtered = query.trim()
    ? skills.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-1.5 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.skills.searchPlaceholder}
          className="flex-1 bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60 font-mono"
        />
        <button
          onClick={() => setEditing({ content: NEW_SKILL_TEMPLATE })}
          title={t.skills.newSkill}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-claude-muted hover:text-amber-400 hover:bg-claude-border transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI.skills.openDir()}
          title={t.common.openFolder}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1.5 3C1.5 2.45 1.95 2 2.5 2H5l1 1.5H10.5C11.05 1.5 11.5 3.95 11.5 4.5V9.5C11.5 10.05 11.05 10.5 10.5 10.5H2.5C1.95 10.5 1.5 10.05 1.5 9.5V3Z"
              stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={() => void reload()}
          title="刷新"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 6a4.5 4.5 0 0 1 7.8-2.8M10.5 6a4.5 4.5 0 0 1-7.8 2.8"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M9.3 1.5v1.8H7.5M2.7 10.5V8.7h1.8"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-claude-muted text-xs">{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-claude-muted">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="opacity-30">
              <path d="M5 6h18M5 10h12M5 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="20" cy="20" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M17.5 20h5M20 17.5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <p className="text-xs">{query ? t.skills.noMatch : t.skills.emptyDir}</p>
            {!query && (
              <button onClick={() => setEditing({ content: NEW_SKILL_TEMPLATE })}
                className="text-[11px] text-amber-400 hover:underline">
                {t.skills.createFirst}
              </button>
            )}
          </div>
        ) : (
          filtered.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              onView={() => void openView(skill)}
              onEdit={() => void openEdit(skill)}
              onDelete={() => void handleDelete(skill)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center">
        {skills.length > 0 ? t.skills.footerSkillCount.replace('{count}', String(skills.length)) : ''}
        {skills.some(s => s.source === 'extra') ? (
          <span>~/.claude/commands/ + extra dir</span>
        ) : (
          <span>~/.claude/commands/</span>
        )}
      </div>

      {/* View modal */}
      {viewing && (
        <ContentModal
          skill={viewing.skill}
          content={viewing.content}
          onClose={() => setViewing(null)}
          onEdit={() => void openEdit(viewing.skill)}
        />
      )}

      {/* Edit / create modal */}
      {editing && (
        <EditorModal
          skill={editing.skill}
          initialContent={editing.content}
          initialName={editing.skill?.name}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
