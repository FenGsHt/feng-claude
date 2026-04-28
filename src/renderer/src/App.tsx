import React, { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { UpdateNotification } from './components/sidebar/UpdateNotification'
import { OnboardingOverlay, isOnboardingComplete } from './components/onboarding/OnboardingOverlay'
import { navigateToSettingsTab } from './components/sidebar/Sidebar'
import { usePty } from './hooks/usePty'
import { useWorkspacePersistence } from './hooks/useWorkspacePersistence'
import { useSessionStore } from './store/sessionStore'
import { parsePersistedWorkspace } from './lib/workspaceSerialize'
import { loadPersistedWorkspace } from './lib/workspaceIpc'

export default function App(): React.ReactElement {
  usePty()

  const [bootstrapped, setBootstrapped] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)

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

  useWorkspacePersistence(bootstrapped)

  const handleOnboardingComplete = (provider: 'anthropic' | 'third-party') => {
    setShowOnboarding(false)
    // Navigate to settings tab after onboarding
    setTimeout(() => navigateToSettingsTab(), 100)
  }

  if (!bootstrapped) {
    return <div className="h-full w-full bg-[#1a1a1a]" />
  }

  return (
    <>
      <AppShell />
      <UpdateNotification />
      {showOnboarding && onboardingReady && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} />
      )}
    </>
  )
}
