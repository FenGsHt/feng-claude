import React, { useState, useEffect, useCallback } from 'react'
import { GUIDE_SECTIONS } from './guideData'
import type { Tip, Section } from './guideData'
import { useI18n } from '../../i18n'

const STORAGE_KEY = 'claude-guide-learned'

function loadLearned(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveLearned(s: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
}

// ── Modal ────────────────────────────────────────────────────────────────────

function TipModal({
  tip,
  sectionTitle,
  sectionEmoji,
  isLearned,
  onToggleLearned,
  onClose
}: {
  tip: Tip
  sectionTitle: string
  sectionEmoji: string
  isLearned: boolean
  onToggleLearned: () => void
  onClose: () => void
}): React.ReactElement {
  const { t } = useI18n()
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Card */}
      <div className="relative z-10 w-[380px] max-w-[90vw] bg-claude-surface border border-claude-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-claude-border/60">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] text-claude-muted">
                {sectionEmoji} {sectionTitle}
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-claude-text leading-snug">
              {tip.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-claude-muted hover:text-claude-text hover:bg-claude-border transition-colors mt-0.5"
          >
            <svg width="9" height="9" viewBox="0 0 9 9">
              <line x1="1" y1="1" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="1" x2="1" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Brief */}
        <div className="px-4 pt-3">
          <p className="text-[11px] font-medium text-amber-400/90 leading-snug mb-2">
            {tip.brief}
          </p>
        </div>

        {/* Detail */}
        <div className="px-4 pb-4">
          <p className="text-[12px] text-claude-muted leading-relaxed">
            {tip.detail}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-claude-border/60 bg-claude-bg/30">
          <button
            onClick={onToggleLearned}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
              isLearned
                ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/10'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
            }`}
          >
            {isLearned ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t.guide.learnedButton}
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M5.5 3v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
                {t.guide.markLearned}
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="text-[11px] text-claude-muted hover:text-claude-text transition-colors px-2 py-1"
          >
            {t.guide.close}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  learned,
  onOpenTip
}: {
  section: Section
  learned: Set<string>
  onOpenTip: (tip: Tip, section: Section) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const learnedCount = section.tips.filter((t) => learned.has(t.id)).length

  return (
    <div className="border-b border-claude-border/60 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-claude-bg/30 transition-colors"
      >
        <span className="text-[13px]">{section.emoji}</span>
        <span className="flex-1 text-[11px] font-semibold text-claude-text">{section.title}</span>
        {learnedCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
            {learnedCount}/{section.tips.length}
          </span>
        )}
        <span className={`text-[9px] text-claude-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>

      {open && (
        <div className="pb-1">
          {section.tips.map((tip) => {
            const isLearned = learned.has(tip.id)
            return (
              <button
                key={tip.id}
                onClick={() => onOpenTip(tip, section)}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-claude-bg/30 transition-colors group"
              >
                {/* Learned check or bullet */}
                <span className="shrink-0 mt-0.5 w-3.5 h-3.5 flex items-center justify-center">
                  {isLearned ? (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="6.5" cy="6.5" r="5.5" fill="rgba(34,197,94,0.15)" stroke="rgb(74,222,128)" strokeWidth="1"/>
                      <path d="M3.5 6.5l2 2 4-4" stroke="rgb(74,222,128)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-claude-border group-hover:bg-amber-500/60 transition-colors" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-claude-text group-hover:text-amber-400 transition-colors leading-snug">
                    {tip.title}
                  </div>
                  <div className="text-[10px] text-claude-muted leading-snug mt-0.5 truncate">
                    {tip.brief}
                  </div>
                </div>
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="none"
                  className="shrink-0 mt-1 opacity-0 group-hover:opacity-40 transition-opacity"
                >
                  <path d="M1 4h6M4 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function GuidePanel(): React.ReactElement {
  const [learned, setLearned] = useState<Set<string>>(loadLearned)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ tip: Tip; section: Section } | null>(null)
  const { t } = useI18n()

  const toggleLearned = useCallback((id: string) => {
    setLearned((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveLearned(next)
      return next
    })
  }, [])

  const openTip = useCallback((tip: Tip, section: Section) => {
    setModal({ tip, section })
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  const totalLearned = learned.size
  const totalTips = GUIDE_SECTIONS.reduce((n, s) => n + s.tips.length, 0)

  // Filter sections by search
  const filtered = search.trim()
    ? GUIDE_SECTIONS.map((s) => ({
        ...s,
        tips: s.tips.filter(
          (tip) =>
            tip.title.toLowerCase().includes(search.toLowerCase()) ||
            tip.brief.toLowerCase().includes(search.toLowerCase()) ||
            tip.detail.toLowerCase().includes(search.toLowerCase())
        )
      })).filter((s) => s.tips.length > 0)
    : GUIDE_SECTIONS

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search + progress */}
      <div className="px-2 pt-2 pb-1.5 shrink-0 space-y-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.guide.searchPlaceholder}
          className="w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60 font-mono"
        />
        {totalLearned > 0 && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-1 rounded-full bg-claude-border overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500/70 transition-all duration-500"
                style={{ width: `${(totalLearned / totalTips) * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-claude-muted shrink-0">
              {t.guide.progress.replace('{learned}', String(totalLearned)).replace('{total}', String(totalTips))}
            </span>
          </div>
        )}
      </div>

      {/* Sections or flat search results */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-claude-muted text-xs">
            {t.guide.noResults}
          </div>
        ) : search.trim() ? (
          // Flat list when searching
          <div>
            {filtered.flatMap((s) =>
              s.tips.map((tip) => {
                const isLearned = learned.has(tip.id)
                return (
                  <button
                    key={tip.id}
                    onClick={() => openTip(tip, s)}
                    className="w-full text-left px-3 py-2 flex items-start gap-2 border-b border-claude-border/40 hover:bg-claude-bg/30 transition-colors group"
                  >
                    <span className="shrink-0 mt-0.5 w-3.5 h-3.5 flex items-center justify-center">
                      {isLearned ? (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <circle cx="6.5" cy="6.5" r="5.5" fill="rgba(34,197,94,0.15)" stroke="rgb(74,222,128)" strokeWidth="1"/>
                          <path d="M3.5 6.5l2 2 4-4" stroke="rgb(74,222,128)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span className="text-[10px]">{s.emoji}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-claude-text group-hover:text-amber-400 transition-colors leading-snug">
                        {tip.title}
                      </div>
                      <div className="text-[10px] text-claude-muted leading-snug mt-0.5 truncate">
                        {tip.brief}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          filtered.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              learned={learned}
              onOpenTip={openTip}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center">
        {totalTips}{t.guide.footer}
      </div>

      {/* Modal */}
      {modal && (
        <TipModal
          tip={modal.tip}
          sectionTitle={modal.section.title}
          sectionEmoji={modal.section.emoji}
          isLearned={learned.has(modal.tip.id)}
          onToggleLearned={() => toggleLearned(modal.tip.id)}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
