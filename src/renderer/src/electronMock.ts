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
      writeClipboardText: (_text: string) => {},
      createSession: async (workdir: string, _resume?: boolean, profileId?: string, _shellOnly?: boolean) => ({
        ok: true as const,
        sessionId: 'mock-session-' + Math.random().toString(36).slice(2),
        pid: 0,
        workdir: workdir || '.',
        scrollback: undefined as string | undefined,
        profileId
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
      onSettingsChanged: listener,
      onSpeechToggle: listener,
      onElementPicked: listener,
      settings: {
        get: async () => ({ ...DEFAULT_SETTINGS }),
        set: async () => ({ success: true })
      },
      detectShells: async () => ({
        shells: [
          { name: 'cmd.exe', path: 'cmd.exe' },
          { name: 'PowerShell 5', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
          { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
        ],
        tmuxAvailable: false,
      }),
      profiles: {
        add: async () => ({ success: true }),
        update: async () => ({ success: true }),
        delete: async () => ({ success: true }),
        setActive: async () => ({ success: true }),
        getActive: async () => ({ profile: { ...DEFAULT_SETTINGS.profiles[0]! } }),
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
      getVersion: async () => '0.0.0',
      openDevTools: noop,
      showNotification: (_title: string, _body: string) => {},
      tokenData: {
        get: async () => null,
        set: async () => {}
      },
      skills: {
        list: async () => [],
        get: async () => '',
        save: async () => ({ success: true }),
        delete: async () => ({ success: true }),
        openDir: async () => {}
      },
      pet: {
        ask: async () => ({ text: '（浏览器预览模式，无法调用 API）' })
      },
      contentBank: {
        generate: async () => ({ items: [] })
      },
      browserView: {
        toggle: async () => ({ visible: false }),
        navigate: async () => ({ success: false, url: '' }),
        onBrowserNavAction: listener,
        onBrowserNavNavigate: listener,
        onBrowserNavSetRatio: listener,
        onBrowserViewStateChanged: listener,
        setToolsPanelWidth: (_width: number) => {}
      },
      git: {
        isRepo: async () => ({ isRepo: true }),
        branchList: async () => ({ branches: [{ name: 'main', isCurrent: true, isRemote: false }], currentBranch: 'main' }),
        worktreeList: async () => ({ worktrees: [{ path: '/mock', branch: 'main', commit: 'abc123', isMain: true }], mainPath: '/mock' }),
        worktreeCreate: async () => ({ worktreePath: '/mock-worktree', branch: 'feat/test' }),
        worktreeRemove: async () => ({ success: true }),
        mergeBranch: async () => ({ success: true }),
        unmergedCommits: async () => ({ count: 0, commits: [] })
      },
      onUpdateStatus: listener,
      onUpdateProgress: listener,
      checkForUpdates: async () => ({ success: true }),
      downloadUpdate: async () => ({ success: true }),
      installUpdate: async () => ({ success: true }),
      onTerminalCopy: (_cb: () => void) => () => {}
    }
  }
}
