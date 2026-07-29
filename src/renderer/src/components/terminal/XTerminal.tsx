import React from 'react'
import 'xterm/css/xterm.css'
import { useXTerminal } from './terminalRuntime'

interface Props {
  sessionId: string
  active: boolean
}

// [2026-07-28] 保持此模块只导出 React 组件，避免 Vite Fast Refresh 因混合导出反复失效。
export function XTerminal(props: Props): React.ReactElement {
  const view = useXTerminal(props)

  return (
    <div
      ref={view.containerRef}
      className={view.className}
      style={view.style}
      onContextMenu={view.onContextMenu}
    />
  )
}
