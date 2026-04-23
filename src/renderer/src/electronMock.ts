/**
 * Mock electronAPI for browser preview (not used in actual Electron runtime).
 * Injected only when window.electronAPI is not defined.
 */
import { DEFAULT_SETTINGS } from './types/settings'

export function injectMockElectronAPI(): void {
  if (typeof window !== 'undefined' && !window.electronAPI) {
    const noop = () => {}
    const listener = (_cb: unknown) => () => {}

    ;(window as any).electronAPI = {
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
      settings: {
        get: async () => ({ ...DEFAULT_SETTINGS }),
        set: async () => ({ success: true })
      },
      appMinimize: noop,
      appMaximize: noop,
      appClose: noop
    }
  }
}
