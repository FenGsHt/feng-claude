import { create } from 'zustand'
import type { ThemeMode } from '../types/settings'

export type { ThemeMode }

interface ThemeStore {
  theme: ThemeMode
  _hydrated: boolean
  setTheme: (theme: ThemeMode) => void
  hydrate: () => Promise<void>
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  theme: 'auto',
  _hydrated: false,

  hydrate: async () => {
    try {
      const settings = await window.electronAPI.settings.get()
      const saved = settings?.theme as ThemeMode | undefined
      if (saved === 'dark' || saved === 'light' || saved === 'auto') {
        set({ theme: saved, _hydrated: true })
      } else {
        set({ _hydrated: true })
      }
    } catch {
      set({ _hydrated: true })
    }
  },

  setTheme: (theme) => {
    set({ theme })
    // Persist immediately to electron-store (don't rely on SettingsPanel save button)
    window.electronAPI.settings.get()
      .then((s) => window.electronAPI.settings.set({ ...(s ?? {}), theme } as import('../types/settings').ClaudeSettings))
      .catch((e: unknown) => console.warn('[theme] save failed:', e))
  },
}))
