import { useEffect, useState } from 'react'
import { useEmbedOutputBetaStore } from '../store/embedOutputBetaStore'

/**
 * [2026-05-06] 外嵌 Beta 开关；与设置保存同步，未开时终端区不增加面板
 * [2026-05-06] 同步 zustand，供 usePty 在无终端面板时已知是否外嵌
 */
export function useEmbedClaudeOutputBeta(): boolean {
  const [on, setOn] = useState(false)

  useEffect(() => {
    void window.electronAPI.settings.get().then((s) => {
      const v = s.embedClaudeOutputBeta === true
      setOn(v)
      useEmbedOutputBetaStore.getState().setEnabled(v)
    })
    const off = window.electronAPI.onSettingsChanged(() => {
      void window.electronAPI.settings.get().then((s) => {
        const v = s.embedClaudeOutputBeta === true
        setOn(v)
        useEmbedOutputBetaStore.getState().setEnabled(v)
      })
    })
    return off
  }, [])

  return on
}
