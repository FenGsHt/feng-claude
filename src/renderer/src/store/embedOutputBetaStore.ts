import { create } from 'zustand'

/** [2026-05-06] usePty 需同步知晓是否外嵌 Beta（无需等终端面板挂载） */
interface State {
  enabled: boolean
  setEnabled: (v: boolean) => void
}

export const useEmbedOutputBetaStore = create<State>((set) => ({
  enabled: false,
  setEnabled: (v) => set({ enabled: v })
}))
