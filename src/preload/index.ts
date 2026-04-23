import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../renderer/src/types/ipc'
import type { PtyOutputPayload, PtyStatusPayload, SessionCreateResult } from '../renderer/src/types/ipc'
import type { FileTreeNode } from '../renderer/src/types/fs'
import type { HistoryRecord } from '../renderer/src/types/session'

const electronAPI = {
  // Session
  createSession: (workdir: string): Promise<SessionCreateResult> =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, { workdir }),

  closeSession: (sessionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SESSION_CLOSE, { sessionId }),

  // PTY
  sendInput: (sessionId: string, data: string): void =>
    ipcRenderer.send(IPC.PTY_INPUT, { sessionId, data }),

  resizePty: (sessionId: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.PTY_RESIZE, { sessionId, cols, rows }),

  onPtyOutput: (callback: (payload: PtyOutputPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyOutputPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_OUTPUT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_OUTPUT, handler)
  },

  onPtyStatus: (callback: (payload: PtyStatusPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: PtyStatusPayload): void =>
      callback(payload)
    ipcRenderer.on(IPC.PTY_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_STATUS, handler)
  },

  // Working directory
  openDirDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC.WORKDIR_OPEN_DIALOG),

  // File system
  readFileTree: (dirPath: string, depth?: number): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke(IPC.FS_READ_TREE, { dirPath, depth }),

  // History
  history: {
    list: (): Promise<HistoryRecord[]> => ipcRenderer.invoke(IPC.HISTORY_LIST),
    save: (record: HistoryRecord): Promise<void> =>
      ipcRenderer.invoke(IPC.HISTORY_SAVE, { record }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.HISTORY_DELETE, { id }),
    get: (id: string): Promise<HistoryRecord | undefined> =>
      ipcRenderer.invoke(IPC.HISTORY_GET, { id })
  },

  // Window controls
  appMinimize: (): void => ipcRenderer.send(IPC.APP_MINIMIZE),
  appMaximize: (): void => ipcRenderer.send(IPC.APP_MAXIMIZE),
  appClose: (): void => ipcRenderer.send(IPC.APP_CLOSE)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
