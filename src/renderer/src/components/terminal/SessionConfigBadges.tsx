import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import type { Session } from '../../types/session'
import type { ClaudeSettings, ApiProfile, TelegramBotPreset, TelegramChannelSessionConfig } from '../../types/settings'
import { OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE } from '../../types/settings'
import { matchSessionToPresetId, presetToSessionConfig } from '../../lib/telegramBotPresets'
import { useI18n } from '../../i18n'
import { TelegramSetupGuideDialog } from './TelegramSetupGuideDialog'
import { navigateToSettingsTab } from '../sidebar/Sidebar'

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
  useEffect(() => {
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.profile-dropdown-menu')) onClose()
      }
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }, 0)
    return () => clearTimeout(timer)
  }, [onClose])

  const allEntries: { id: string; name: string; model: string }[] = [
    { id: OFFICIAL_PROFILE_ID, name: OFFICIAL_PROFILE.name, model: '' },
    ...profiles.map(p => ({ id: p.id, name: p.name, model: p.model }))
  ]

  return (
    <div
      className="profile-dropdown-menu bg-claude-surface2 border border-claude-border rounded-md shadow-xl min-w-[120px] py-1"
      style={{ position: 'fixed', top: anchorRect.top + 24, right: anchorRect.right, zIndex: 9999 }}
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

/** [2026-05-08] 与 ProfileDropdown 同款 portal：切换 Telegram 预设（Token 仅在设置；此处仅说明） */
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
  labels: { none: string; setupGuide: string; openSettings: string; emptyPresets: string }
}): React.ReactElement | null {
  useEffect(() => {
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.telegram-preset-dropdown-menu')) onClose()
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
      style={{ position: 'fixed', top: anchorRect.top + 24, right: anchorRect.right, zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onSelectNone(); onClose() }}
        className={`w-full text-left px-3 py-1.5 text-xs transition-colors rounded-t-md ${
          noneActive ? 'text-amber-400 bg-amber-500/10' : 'text-claude-text hover:bg-claude-border'
        }`}
      >
        <span className="font-medium">{labels.none}</span>
        {noneActive ? <span className="ml-2 text-[10px] opacity-60">●</span> : null}
      </button>

      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => { onSelectPreset(p.id); onClose() }}
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
          onClick={() => { navigateToSettingsTab(); onClose() }}
          className="w-full text-left px-3 py-1.5 text-[11px] text-claude-muted hover:bg-claude-border hover:text-claude-text transition-colors"
        >
          {labels.openSettings}
        </button>
        <button
          type="button"
          onClick={() => { onSetupGuide(); onClose() }}
          className="w-full text-left px-3 py-1.5 text-xs text-claude-text hover:bg-claude-border rounded-b-md transition-colors"
        >
          {labels.setupGuide}
        </button>
      </div>
    </div>
  )
}

function telegramBadgeLabel(sess: Session, presets: TelegramBotPreset[], noneLabel: string, customLabel: string): string {
  const tc = sess.telegramChannel
  if (!tc?.enabled) return noneLabel
  const mid = matchSessionToPresetId(tc, presets)
  if (mid) return presets.find((p) => p.id === mid)?.name ?? 'TG'
  const tok = tc.botToken?.trim()
  if (tok) return tok.length <= 12 ? tok : `${tok.slice(0, 4)}…${tok.slice(-4)}`
  return customLabel
}

/**
 * [2026-06-22] 会话「配置切换 + Telegram 频道」徽章。
 * 原本内嵌在 TabBar 的每个 tab 里，导致 tab 过宽；现抽成独立组件放到 PaneHeader 标题右侧，
 * 按所在 pane 的 sessionId 作用。分屏时各 pane header 各显示各自会话的配置。
 */
export function SessionConfigBadges({ sessionId, focused }: { sessionId: string; focused: boolean }): React.ReactElement | null {
  const { t } = useI18n()
  const sess = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId))
  const restartSession = useSessionStore((s) => s.restartSession)
  const updateSessionTelegramChannel = useSessionStore((s) => s.updateSessionTelegramChannel)

  const [settings, setSettings] = useState<ClaudeSettings | null>(null)
  const [telegramPresets, setTelegramPresets] = useState<TelegramBotPreset[]>([])
  const [profileAnchor, setProfileAnchor] = useState<{ top: number; right: number } | null>(null)
  const [telegramAnchor, setTelegramAnchor] = useState<{ top: number; right: number } | null>(null)
  const [showTelegramSetupGuide, setShowTelegramSetupGuide] = useState(false)
  const profileBadgeRef = useRef<HTMLButtonElement | null>(null)
  const telegramBadgeRef = useRef<HTMLButtonElement | null>(null)

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

  /* [2026-05-08] 设置里关闭「启用 Telegram Channel」后收起下拉 */
  useEffect(() => {
    if (settings && settings.telegramChannel?.enabled !== true) setTelegramAnchor(null)
  }, [settings?.telegramChannel?.enabled, settings])

  const telegramGuideResolvedDir = useMemo((): string => {
    const fromSession = sess?.telegramChannel?.stateDirId?.trim()
    if (fromSession) return fromSession
    const g = settings?.telegramChannel
    const fromGlobal = g?.defaultStateDirId?.trim() || telegramPresets[0]?.stateDirId?.trim() || ''
    return fromGlobal || 'telegram'
  }, [sess?.telegramChannel, settings?.telegramChannel, telegramPresets])

  if (!sess) return null

  const getProfileName = (): string => {
    // [2026-06-11] 优先用启动时快照，避免设置里改名/换模型后改动已运行 session 的徽章
    if (sess.profileName) return sess.profileName
    if (!settings) return ''
    const profileId = sess.profileId ?? settings.activeProfileId
    if (profileId === OFFICIAL_PROFILE_ID) return OFFICIAL_PROFILE.name
    return settings.profiles.find((p) => p.id === profileId)?.name ?? ''
  }

  const openProfileDropdown = (): void => {
    const el = profileBadgeRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setTelegramAnchor(null)
    setProfileAnchor({ top: rect.top, right: window.innerWidth - rect.right })
  }

  const openTelegramDropdown = (): void => {
    const el = telegramBadgeRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setProfileAnchor(null)
    setTelegramAnchor({ top: rect.top, right: window.innerWidth - rect.right })
  }

  const handleProfileSwitch = (profileId: string): void => {
    setProfileAnchor(null)
    void restartSession(sessionId, profileId)
  }

  /* [2026-05-08] 从 electron-store 拉最新预设并显式传入 restartSession，保证 PTY 环境与所选预设一致 */
  const handleTelegramPresetSwitch = (presetId: string): void => {
    void (async () => {
      try {
        const s = await window.electronAPI.settings.get()
        const p = (s.telegramChannel?.botPresets ?? []).find((x) => x.id === presetId)
        if (!p) return
        const cfg = presetToSessionConfig(p)
        updateSessionTelegramChannel(sessionId, cfg)
        await restartSession(sessionId, undefined, cfg)
      } catch (e) {
        console.warn('[SessionConfigBadges] telegram preset switch failed', e)
      }
    })()
  }

  const handleTelegramClear = (): void => {
    const cleared = { enabled: false as const }
    updateSessionTelegramChannel(sessionId, cleared)
    void restartSession(sessionId, undefined, cleared)
  }

  const hasProfiles = !!settings && settings.profiles.length > 0
  const telegramEnabled = settings?.telegramChannel?.enabled === true
  if (!hasProfiles && !telegramEnabled) return null

  const profileName = getProfileName()

  return (
    <>
      {hasProfiles && (
        <button
          ref={profileBadgeRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openProfileDropdown() }}
          className={`shrink-0 max-w-[88px] truncate text-[9px] px-1 py-0.5 rounded transition-colors ${
            focused
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-claude-border text-claude-muted hover:bg-claude-border/80'
          }`}
          title={t.tabs.switchProfile}
        >
          {profileName || 'Default'}
        </button>
      )}

      {telegramEnabled && (
        <button
          ref={telegramBadgeRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openTelegramDropdown() }}
          className={`shrink-0 max-w-[72px] truncate text-[9px] px-1 py-0.5 rounded transition-colors ${
            focused
              ? sess.telegramChannel?.enabled
                ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                : 'bg-claude-border/90 text-claude-muted hover:bg-claude-border'
              : sess.telegramChannel?.enabled
                ? 'bg-sky-900/30 text-sky-400/85 hover:bg-sky-900/45'
                : 'bg-claude-border text-claude-muted hover:bg-claude-border/80'
          }`}
          title={t.tabs.telegramPresetSwitch}
        >
          {telegramBadgeLabel(sess, telegramPresets, t.tabs.telegramChannelNone, t.tabs.telegramChannelCustom)}
        </button>
      )}

      {profileAnchor && settings && (
        <ProfileDropdown
          profiles={settings.profiles}
          currentProfileId={sess.profileId ?? settings.activeProfileId}
          onSelect={handleProfileSwitch}
          onClose={() => setProfileAnchor(null)}
          anchorRect={profileAnchor}
        />
      )}

      {telegramAnchor && telegramEnabled && (
        <TelegramPresetDropdown
          presets={telegramPresets}
          sessionTelegram={sess.telegramChannel}
          onSelectNone={handleTelegramClear}
          onSelectPreset={handleTelegramPresetSwitch}
          onSetupGuide={() => setShowTelegramSetupGuide(true)}
          onClose={() => setTelegramAnchor(null)}
          anchorRect={telegramAnchor}
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
        onClose={() => setShowTelegramSetupGuide(false)}
        resolvedStateDirId={telegramGuideResolvedDir}
      />
    </>
  )
}
