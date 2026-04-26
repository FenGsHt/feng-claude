/**
 * Mock electronAPI for browser preview (not used in actual Electron runtime).
 * Injected only when window.electronAPI is not defined.
 */
import { DEFAULT_SETTINGS } from './types/settings'
import type { PersistedWorkspace } from './types/workspace'
import { WORKSPACE_BROWSER_LS_KEY } from './types/workspace'

export function injectMockElectronAPI(): void {
  if (typeof window !== 'undefined' && !window.electronAPI) {
    const noop = () => {}
    const listener = (_cb: unknown) => () => {}

    ;(window as any).electronAPI = {
      readClipboardTextSync: () => '',
      createSession: async (_workdir: string) => ({
        sessionId: 'mock-session-' + Math.random().toString(36).slice(2),
        pid: 0
      }),
      closeSession: async () => ({ success: true }),
      sendInput: noop,
      resizePty: noop,
      onPtyOutput: listener,
      onPtyStatus: listener,
      openDirDialog: async () => '/mock/workdir',
      resolveWorkdirMany: async (paths: string[]) => paths.map((p) => p),
      readFileTree: async () => [
        {
          name: 'src',
          path: '/mock/src',
          type: 'directory',
          children: [
            { name: 'main.tsx', path: '/mock/src/main.tsx', type: 'file' },
            { name: 'App.tsx', path: '/mock/src/App.tsx', type: 'file' }
          ]
        },
        { name: 'package.json', path: '/mock/package.json', type: 'file' },
        { name: 'README.md', path: '/mock/README.md', type: 'file' }
      ],
      history: {
        list: async () => [],
        save: async () => {},
        delete: async () => {},
        get: async () => undefined
      },
      onTokenUsageUpdate: listener,
      settings: {
        get: async () => ({ ...DEFAULT_SETTINGS }),
        set: async () => ({ success: true })
      },
      workspace: {
        save: async (w: PersistedWorkspace | null) => {
          if (typeof localStorage !== 'undefined') {
            if (w) localStorage.setItem(WORKSPACE_BROWSER_LS_KEY, JSON.stringify(w))
            else localStorage.removeItem(WORKSPACE_BROWSER_LS_KEY)
          }
          return { success: true }
        },
        load: async () => {
          if (typeof localStorage === 'undefined') return null
          const raw = localStorage.getItem(WORKSPACE_BROWSER_LS_KEY)
          if (!raw) return null
          try {
            return JSON.parse(raw) as unknown
          } catch {
            return null
          }
        }
      },
      appMinimize: noop,
      appMaximize: noop,
      appClose: noop,
      tokenData: {
        get: async () => null,
        set: async () => {}
      }
    }
  }
}
