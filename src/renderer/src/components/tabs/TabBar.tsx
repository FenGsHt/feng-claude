import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import type { Session } from '../../types/session'
import type { ClaudeSettings, ApiProfile, TelegramBotPreset, TelegramChannelSessionConfig } from '../../types/settings'
import { OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE } from '../../types/settings'
import { matchSessionToPresetId, presetToSessionConfig } from '../../lib/telegramBotPresets'
import { useI18n } from '../../i18n'
import { TelegramSetupGuideDialog } from '../terminal/TelegramSetupGuideDialog'
import { navigateToSettingsTab } from '../sidebar/Sidebar'
import { collectLeafSessionIds } from '../../lib/paneLayout'

/** Status dot color for a session */
function statusColor(status: Session['status']): string {
  switch (status) {
    case 'running': return 'bg-amber-400'
    case 'waiting_input': return 'bg-green-400'
    case 'error': return 'bg-red-400'
    default: return 'bg-claude-muted/50'
  }
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-50">
      <path
        d="M1 3C1 2.45 1.45 2 2 2H4.5L5.5 3.5H10C10.55 3.5 11 3.95 11 4.5V9C11 9.55 10.55 10 10 10H2C1.45 10 1 9.55 1 9V3Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** [2026-04-28] Profile dropdown using portal to escape overflow clipping */
function ProfileDropdown({
  profiles,
  currentProfileId,
  onSelect,
  onClose,
  anchorRect
}: {
  profiles: ApiProfile[]
  currentProfileId: string | undefined
  onSelect: (profileId: string) => void
  onClose: () => void
  anchorRect: { top: number; right: number }
}): React.ReactElement | null {
  // Close on click outside - use setTimeout to avoid immediate close from same click
  useEffect(() => {
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        // Check if click is outside the dropdown
        const target = e.target as HTMLElement
        if (!target.closest('.profile-dropdown-menu')) {
          onClose()
        }
      }
      document.addEventListener('click', handleClick)
      // Store handler for cleanup
      return () => document.removeEventListener('click', handleClick)
    }, 0)
    return () => clearTimeout(timer)
  }, [onClose])

  // Prepend the virtual official profile entry
  const allEntries: { id: string; name: string; model: string }[] = [
    { id: OFFICIAL_PROFILE_ID, name: OFFICIAL_PROFILE.name, model: '' },
    ...profiles.map(p => ({ id: p.id, name: p.name, model: p.model }))
  ]

  return (
    <div
      className="profile-dropdown-menu bg-claude-surface2 border border-claude-border rounded-md shadow-xl min-w-[120px] py-1"
      style={{
        position: 'fixed',
        top: anchorRect.top + 28,
        right: anchorRect.right,
        zIndex: 9999
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {allEntries.map((p, idx) => (
        <button
          key={p.id}
          onClick={() => { onSelect(p.id); onClose() }}
          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
            currentProfileId === p.id
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-claude-text hover:bg-claude-border'
          } ${idx === 0 ? 'rounded-t-md' : ''} ${idx === allEntries.length - 1 ? 'rounded-b-md' : ''}`}
        >
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{p.name}</span>
            {p.model && <span className="text-[9px] text-claude-muted">{p.model}</span>}
          </div>
          {currentProfileId === p.id && (
            <span className="ml-2 text-[10px] opacity-60 shrink-0">●</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** [2026-05-08] 与 ProfileDropdown 同款 portal：标签栏切换 Telegram（Token 仅在设置；此处仅说明） */
function TelegramPresetDropdown({
  presets,
  sessionTelegram,
  onSelectNone,
  onSelectPreset,
  onSetupGuide,
  onClose,
  anchorRect,
  labels
}: {
  presets: TelegramBotPreset[]
  sessionTelegram?: TelegramChannelSessionConfig
  onSelectNone: () => void
  onSelectPreset: (presetId: string) => void
  onSetupGuide: () => void
  onClose: () => void
  anchorRect: { top: number; right: number }
  labels: {
    none: string
    setupGuide: string
    openSettings: string
    emptyPresets: string
  }
}): React.ReactElement | null {
  useEffect(() => {
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.telegram-preset-dropdown-menu')) {
          onClose()
        }
      }
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }, 0)
    return () => clearTimeout(timer)
  }, [onClose])

  const matchedId = matchSessionToPresetId(
    sessionTelegram?.enabled ? sessionTelegram : undefined,
    presets
  )
  const noneActive = !sessionTelegram?.enabled

  return (
    <div
      className="telegram-preset-dropdown-menu bg-claude-surface2 border border-claude-border rounded-md shadow-xl min-w-[168px] max-w-[260px] py-1"
      style={{
        position: 'fixed',
        top: anchorRect.top + 28,
        right: anchorRect.right,
        zIndex: 9999
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onSelectNone()
          onClose()
        }}
        className={`w-full text-left px-3 py-1.5 text-xs transition-colors rounded-t-md ${
          noneActive ? 'text-amber-400 bg-amber-500/10' : 'text-claude-text hover:bg-claude-border'
        }`}
      >
        <span className="font-medium">{labels.none}</span>
        {noneActive ? <span className="ml-2 text-[10px] opacity-60">●</span> : null}
      </button>

      {presets.map((p, idx) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onSelectPreset(p.id)
            onClose()
          }}
          className={`w-full flex items-start justify-between gap-2 text-left px-3 py-1.5 text-xs transition-colors ${
            !noneActive && matchedId === p.id
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-claude-text hover:bg-claude-border'
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="font-medium truncate">{p.name}</span>
            <span className="truncate font-mono text-[9px] text-claude-muted">{p.stateDirId}</span>
          </div>
          {!noneActive && matchedId === p.id ? (
            <span className="shrink-0 pt-0.5 text-[10px] opacity-60">●</span>
          ) : null}
        </button>
      ))}

      {presets.length === 0 ? (
        <p className="px-3 py-1.5 text-[9px] leading-snug text-claude-muted border-t border-claude-border/80">
          {labels.emptyPresets}
        </p>
      ) : null}

      <div className="border-t border-claude-border/80 mt-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            navigateToSettingsTab()
            onClose()
          }}
          className="w-full text-left px-3 py-1.5 text-[11px] text-claude-muted hover:bg-claude-border hover:text-claude-text transition-colors"
        >
          {labels.openSettings}
        </button>
        <button
          type="button"
          onClick={() => {
            onSetupGuide()
            onClose()
          }}
          className="w-full text-left px-3 py-1.5 text-xs text-claude-text hover:bg-claude-border rounded-b-md transition-colors"
        >
          {labels.setupGuide}
        </button>
      </div>
    </div>
  )
}

function telegramTabBadgeLabel(sess: Session, presets: TelegramBotPreset[], noneLabel: string, customLabel: string): string {
  const tc = sess.telegramChannel
  if (!tc?.enabled) return noneLabel
  const mid = matchSessionToPresetId(tc, presets)
  if (mid) {
    return presets.find((p) => p.id === mid)?.name ?? 'TG'
  }
  const tok = tc.botToken?.trim()
  if (tok) {
    if (tok.length <= 12) return tok
    return `${tok.slice(0, 4)}…${tok.slice(-4)}`
  }
  return customLabel
}

export function TabBar(): React.ReactElement {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    closeSession,
    restartSession,
    updateSessionTelegramChannel
  } = useSessionStore()
  const layoutRoot = useSessionStore((s) => s.layoutRoot)
  const parkedLayouts = useSessionStore((s) => s.parkedLayouts)

  // [2026-06-16] 分屏组在 tab 栏只显示一个「主 tab」（组内第一个 leaf）；隐藏副窗格，
  // active 状态映射到所属组的主 tab。
  const { hiddenSecondary, primaryOf } = useMemo(() => {
    const hidden = new Set<string>()
    const primary: Record<string, string> = {}
    const groups = [layoutRoot, ...parkedLayouts].filter((g): g is NonNullable<typeof g> => !!g)
    for (const g of groups) {
      const leaves = collectLeafSessionIds(g)
      if (leaves.length <= 1) continue
      const head = leaves[0]
      for (const id of leaves) {
        primary[id] = head
        if (id !== head) hidden.add(id)
      }
    }
    return { hiddenSecondary: hidden, primaryOf: primary }
  }, [layoutRoot, parkedLayouts])

  const tabSessions = sessions.filter((s) => !hiddenSecondary.has(s.id))
  const activePrimary = (activeSessionId && primaryOf[activeSessionId]) || activeSessionId
  const scrollRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [telegramPresets, setTelegramPresets] = useState<TelegramBotPreset[]>([])
  const [dropdownAnchor, setDropdownAnchor] = useState<{ sessionId: string; rect: { top: number; right: number } } | null>(null)
  const [telegramDropdownAnchor, setTelegramDropdownAnchor] = useState<{
    sessionId: string
    rect: { top: number; right: number }
  } | null>(null)
  /** [2026-05-08] 安装/配对说明弹窗；[2026-05-09] 记录打开时标签 id 以填入 stateDir */
  const [showTelegramSetupGuide, setShowTelegramSetupGuide] = useState(false)
  const [telegramGuideSessionId, setTelegramGuideSessionId] = useState<string | null>(null)
  const badgeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const telegramBadgeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  /* [2026-05-09] 安装说明灰框路径：优先会话 stateDirId；[2026-05-08] 不再要求 tc.enabled，否则退回 <STATE_DIR> 模板时 Claude 常仍读默认 telegram */
  const telegramGuideResolvedDir = useMemo((): string | null => {
    if (!telegramGuideSessionId) return null
    const sess = sessions.find((s) => s.id === telegramGuideSessionId)
    const fromSession = sess?.telegramChannel?.stateDirId?.trim()
    if (fromSession) return fromSession
    const g = settings?.telegramChannel
    const fromGlobal =
      g?.defaultStateDirId?.trim() || telegramPresets[0]?.stateDirId?.trim() || ''
    return fromGlobal || 'telegram'
  }, [telegramGuideSessionId, sessions, settings?.telegramChannel, telegramPresets])

  // Load settings to get profiles — re-fetch on broadcast changes
  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      setSettings(s)
      setTelegramPresets(s.telegramChannel?.botPresets ?? [])
    })
    return window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then((s) => {
        setSettings(s)
        setTelegramPresets(s.telegramChannel?.botPresets ?? [])
      })
    })
  }, [])

  /* [2026-05-08] 设置里关闭「启用 Telegram Channel」后收起标签栏 Telegram 下拉 */
  useEffect(() => {
    if (settings && settings.telegramChannel?.enabled !== true) {
      setTelegramDropdownAnchor(null)
    }
  }, [settings?.telegramChannel?.enabled, settings])

  const handleNewTab = async () => {
    const dir = await window.electronAPI.openDirDialog()
    if (!dir) return
    try {
      await createSession(dir, 'fullscreen')
    } catch (e) {
      console.warn('[TabBar] 创建会话失败', e)
    }
  }

  // Get profile name for a session
  const getProfileName = (sess: Session): string => {
    // [2026-06-11] 优先用启动时快照，避免设置里改名/换模型后改动已运行 session 的徽章
    if (sess.profileName) return sess.profileName
    if (!settings) return ''
    // [2026-04-28] If session has no profileId, show active profile name
    const profileId = sess.profileId ?? settings.activeProfileId
    if (profileId === OFFICIAL_PROFILE_ID) return OFFICIAL_PROFILE.name
    const profile = settings.profiles.find(p => p.id === profileId)
    return profile?.name ?? ''
  }

  // Handle profile switch for a session - restart with new profile
  const handleProfileSwitch = (sessionId: string, profileId: string) => {
    setDropdownAnchor(null)
    // [2026-04-28] Restart session with new profile to apply the API config
    void restartSession(sessionId, profileId)
  }

  // Open dropdown for a session's badge
  const handleBadgeClick = (sessionId: string) => {
    const badgeEl = badgeRefs.current.get(sessionId)
    if (!badgeEl) return
    const rect = badgeEl.getBoundingClientRect()
    setTelegramDropdownAnchor(null)
    setDropdownAnchor({ sessionId, rect: { top: rect.top, right: window.innerWidth - rect.right } })
  }

  const handleTelegramBadgeClick = (sessionId: string): void => {
    const el = telegramBadgeRefs.current.get(sessionId)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownAnchor(null)
    setTelegramDropdownAnchor({
      sessionId,
      rect: { top: rect.top, right: window.innerWidth - rect.right }
    })
  }

  /* [2026-05-08] 原仅用 TabBar 内存里的 telegramPresets + updateSession 后立即 restart；
   * 若设置页刚保存或 IPC 稍慢，预设 Token/stateDir 可能与磁盘不一致，第二个预设配对读错 ~/.claude/channels/<id>。
   * 现从 electron-store 拉最新预设，并把 cfg 显式传入 restartSession，保证 PTY 环境与所选预设一致。 */
  const handleTelegramPresetSwitch = (sessionId: string, presetId: string): void => {
    void (async () => {
      try {
        const settings = await window.electronAPI.settings.get()
        const presets = settings.telegramChannel?.botPresets ?? []
        const p = presets.find((x) => x.id === presetId)
        if (!p) return
        const cfg = presetToSessionConfig(p)
        updateSessionTelegramChannel(sessionId, cfg)
        await restartSession(sessionId, undefined, cfg)
      } catch (e) {
        console.warn('[TabBar] telegram preset switch failed', e)
      }
    })()
  }

  const handleTelegramClear = (sessionId: string): void => {
    const cleared = { enabled: false as const }
    updateSessionTelegramChannel(sessionId, cleared)
    void restartSession(sessionId, undefined, cleared)
  }

  // 切换 session 时将激活 tab 滚入可视区
  useEffect(() => {
    if (!activeSessionId || !scrollRef.current) return
    const activeTab = scrollRef.current.querySelector('.tab-active') as HTMLElement | null
    activeTab?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeSessionId])

  // Scroll tabs with mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="flex items-stretch h-9 bg-claude-surface border-b border-claude-border shrink-0 min-w-0">
      {/* Scrollable tabs area */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex flex-1 items-stretch overflow-x-auto min-w-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabSessions.map((sess) => {
          const isActive = sess.id === activePrimary
          const profileName = getProfileName(sess)
          return (
            <div
              key={sess.id}
              title={sess.workdir}
              onClick={() => setActiveSession(sess.id)}
              className={`tab-item ${isActive ? 'tab-active' : ''} relative flex items-center gap-1.5 px-3 h-full min-w-[80px] max-w-[260px] cursor-pointer border-r border-claude-border shrink-0 group select-none ${
                isActive
                  ? 'bg-claude-bg text-claude-text'
                  : 'bg-claude-surface text-claude-muted hover:text-claude-text hover:bg-claude-bg/60'
              }`}
            >
              {/* Status indicator */}
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${
                  isActive && sess.status === 'running'
                    ? 'bg-amber-400 animate-pulse'
                    : statusColor(sess.status)
                }`}
              />

              {/* Folder icon */}
              <FolderIcon />

              {/* Title */}
              <span className="text-[12px] truncate flex-1 leading-none font-medium">
                {sess.title}
              </span>

              {/* Profile badge - click to open dropdown */}
              {settings && settings.profiles.length > 0 && (
                <button
                  ref={(el) => {
                    if (el) badgeRefs.current.set(sess.id, el)
                    else badgeRefs.current.delete(sess.id)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBadgeClick(sess.id)
                  }}
                  className={`shrink-0 text-[9px] px-1 py-0.5 rounded transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      : 'bg-claude-border text-claude-muted hover:bg-claude-border/80'
                  }`}
                  title={t.tabs.switchProfile}
                >
                  {profileName || 'Default'}
                </button>
              )}

              {/* [2026-05-08] 仅全局启用 Telegram Channel 时显示药丸；否则不占位 */}
              {settings?.telegramChannel?.enabled === true ? (
                <button
                  ref={(el) => {
                    if (el) telegramBadgeRefs.current.set(sess.id, el)
                    else telegramBadgeRefs.current.delete(sess.id)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTelegramBadgeClick(sess.id)
                  }}
                  className={`shrink-0 max-w-[76px] truncate text-[9px] px-1 py-0.5 rounded transition-colors ${
                    isActive
                      ? sess.telegramChannel?.enabled
                        ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                        : 'bg-claude-border/90 text-claude-muted hover:bg-claude-border'
                      : sess.telegramChannel?.enabled
                        ? 'bg-sky-900/30 text-sky-400/85 hover:bg-sky-900/45'
                        : 'bg-claude-border text-claude-muted hover:bg-claude-border/80'
                  }`}
                  title={t.tabs.telegramPresetSwitch}
                >
                  {telegramTabBadgeLabel(sess, telegramPresets, t.tabs.telegramChannelNone, t.tabs.telegramChannelCustom)}
                </button>
              ) : null}

              {/* Restart button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void restartSession(sess.id)
                }}
                aria-label="Restart session"
                title={t.tabs.restartSession}
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all text-claude-muted hover:text-amber-400 hover:bg-claude-border ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M8.5 5A3.5 3.5 0 1 1 5 1.5c.94 0 1.8.37 2.43.97" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M7.5 1v2H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeSession(sess.id)
                }}
                aria-label="Close tab"
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all text-claude-muted hover:text-claude-text hover:bg-claude-border ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* New tab button */}
      <button
        onClick={handleNewTab}
        aria-label={t.tabs.newSession}
        title={t.tabs.newSession}
        className="flex items-center justify-center w-9 shrink-0 text-claude-muted hover:text-claude-text hover:bg-claude-bg/60 transition-colors border-l border-claude-border"
      >
        <svg width="13" height="13" viewBox="0 0 13 13">
          <line x1="6.5" y1="1" x2="6.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Profile dropdown portal */}
      {dropdownAnchor && settings && (
        <ProfileDropdown
          profiles={settings.profiles}
          currentProfileId={sessions.find(s => s.id === dropdownAnchor.sessionId)?.profileId ?? settings.activeProfileId}
          onSelect={(profileId) => handleProfileSwitch(dropdownAnchor.sessionId, profileId)}
          onClose={() => setDropdownAnchor(null)}
          anchorRect={dropdownAnchor.rect}
        />
      )}

      {telegramDropdownAnchor && settings?.telegramChannel?.enabled === true && (
        <TelegramPresetDropdown
          presets={telegramPresets}
          sessionTelegram={sessions.find((s) => s.id === telegramDropdownAnchor.sessionId)?.telegramChannel}
          onSelectNone={() => handleTelegramClear(telegramDropdownAnchor.sessionId)}
          onSelectPreset={(presetId) => handleTelegramPresetSwitch(telegramDropdownAnchor.sessionId, presetId)}
          onSetupGuide={() => {
            const sid = telegramDropdownAnchor?.sessionId ?? activeSessionId ?? null
            setTelegramGuideSessionId(sid)
            setShowTelegramSetupGuide(true)
          }}
          onClose={() => setTelegramDropdownAnchor(null)}
          anchorRect={telegramDropdownAnchor.rect}
          labels={{
            none: t.tabs.telegramChannelNone,
            setupGuide: t.tabs.telegramChannelSetupGuide,
            openSettings: t.tabs.telegramChannelOpenSettings,
            emptyPresets: t.tabs.telegramChannelEmptyPresets
          }}
        />
      )}

      <TelegramSetupGuideDialog
        open={showTelegramSetupGuide}
        onClose={() => {
          setShowTelegramSetupGuide(false)
          setTelegramGuideSessionId(null)
        }}
        resolvedStateDirId={telegramGuideResolvedDir}
      />
    </div>
  )
}
