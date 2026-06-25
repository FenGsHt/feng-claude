import { useEffect, useRef } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { workspaceToPersisted } from '../lib/workspaceSerialize'
import { savePersistedWorkspace } from '../lib/workspaceIpc'

const DEBOUNCE_MS = 450

/** 会话 / 分屏 / 激活 tab 变更后防抖写入磁盘；卸载与 pagehide 时再刷一次 */
export function useWorkspacePersistence(enabled: boolean): void {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!enabled) return

    const flush = (): void => {
      const s = useSessionStore.getState()
      const pw = workspaceToPersisted(s.sessions, s.layoutRoot, s.activeSessionId, s.parkedLayouts)
      void savePersistedWorkspace(pw)
    }

    const unsub = useSessionStore.subscribe(() => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, DEBOUNCE_MS)
    })

    const onHide = (): void => flush()

    window.addEventListener('pagehide', onHide)

    return () => {
      clearTimeout(timerRef.current)
      unsub()
      window.removeEventListener('pagehide', onHide)
      flush()
    }
  }, [enabled])
}
