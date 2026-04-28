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
          await useSessionStore.getState().createSession('.', 'fullscreen')
        }
      } catch {
        if (!cancelled && useSessionStore.getState().sessions.length === 0) {
          await useSessionStore.getState().createSession('.', 'fullscreen')
        }
      } finally {
        if (!cancelled) {
          setBootstrapped(true)
          // Show onboarding only after bootstrapped and if not complete
          setShowOnboarding(!isOnboardingComplete())
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
