import React, { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { UpdateNotification } from './components/sidebar/UpdateNotification'
import { OnboardingOverlay, isOnboardingComplete } from './components/onboarding/OnboardingOverlay'
import { WhatsNewDialog } from './components/layout/WhatsNewDialog'
import { navigateToSettingsTab } from './components/sidebar/Sidebar'
import { usePty } from './hooks/usePty'
import { useTriggerScheduler } from './hooks/useTriggerScheduler'
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence'
import { useTheme } from './hooks/useTheme'
import { useSessionStore } from './store/sessionStore'
import { parsePersistedWorkspace } from './lib/workspaceSerialize'
import { loadPersistedWorkspace } from './lib/workspaceIpc'
import { fallbackWhatsNewCopy, getWhatsNewCopy } from './lib/whatsNewCatalog'

export default function App(): React.ReactElement {
  useTheme()
  usePty()
  useTriggerScheduler()

  const [bootstrapped, setBootstrapped] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)
  /** [2026-05-08] 非 null 时展示新版本介绍弹窗 */
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await loadPersistedWorkspace()
        const pw = parsePersistedWorkspace(raw)
        if (cancelled) return
        if (pw && pw.sessionWorkdirs.length > 0) {
          await useSessionStore.getState().restoreWorkspace(pw)
        } else if (useSessionStore.getState().sessions.length === 0) {
          // [2026-04-30] 无工作区快照时仍用 resume，重新打开应用后 /resume 恢复该目录上次 Claude 对话
          await useSessionStore.getState().createSession('.', 'fullscreen', undefined, true)
        }
      } catch {
        if (!cancelled && useSessionStore.getState().sessions.length === 0) {
          /* [2026-04-23] fallback 若再失败不应把 rejection 抛出 effect（此前 createSession throw 会导致此处二次 uncaught） */
          try {
            await useSessionStore.getState().createSession('.', 'fullscreen', undefined, true)
          } catch (e) {
            console.warn('[App] bootstrap fallback createSession failed', e)
          }
        }
      } finally {
        if (!cancelled) {
          setBootstrapped(true)
          // Show onboarding only if: localStorage flag not set AND no configured API profiles
          let shouldOnboard = !isOnboardingComplete()
          if (shouldOnboard) {
            try {
              const settings = await window.electronAPI.settings.get()
              // If any profile already has an authToken configured, skip onboarding
              const hasConfiguredProfile = settings?.profiles?.some(
                (p: { authToken?: string }) => p.authToken && p.authToken.trim().length > 0
              )
              if (hasConfiguredProfile) {
                localStorage.setItem('claude-gui-onboarding-complete', 'true')
                shouldOnboard = false
              }
            } catch {
              // If settings can't be loaded, fall back to original behavior
            }
          }
          setShowOnboarding(shouldOnboard)
          setOnboardingReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* [2026-05-08] 首次进入新版本：引导结束后再查，避免与首次配置遮罩叠在一起 */
  useEffect(() => {
    if (!bootstrapped || !onboardingReady || showOnboarding) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await window.electronAPI.whatsNew.shouldShow()
        if (cancelled || !r?.show) return
        setWhatsNewVersion(r.version)
      } catch (e) {
        console.warn('[App] whatsNew.shouldShow failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bootstrapped, onboardingReady, showOnboarding])

  useWorkspacePersistence(bootstrapped)

  const handleOnboardingComplete = (provider: 'anthropic' | 'third-party') => {
    setShowOnboarding(false)
    // Navigate to settings tab after onboarding
    setTimeout(() => navigateToSettingsTab(), 100)
  }

  const handleWhatsNewDismiss = (): void => {
    const v = whatsNewVersion
    if (!v) return
    void window.electronAPI.whatsNew.markSeen(v).finally(() => {
      setWhatsNewVersion(null)
    })
  }

  if (!bootstrapped) {
    return <div className="h-full w-full bg-claude-surface2" />
  }

  return (
    <>
      <AppShell />
      <UpdateNotification />
      {showOnboarding && onboardingReady && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
      {whatsNewVersion !== null && (
        <WhatsNewDialog
          open
          version={whatsNewVersion}
          copy={getWhatsNewCopy(whatsNewVersion) ?? fallbackWhatsNewCopy(whatsNewVersion)}
          onDismiss={handleWhatsNewDismiss}
        />
      )}
    </>
  )
}
