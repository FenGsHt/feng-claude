/** [2026-05-12] Office preview right panel state */
import { create } from 'zustand'

interface OfficePreviewPanelState {
  visible: boolean
  filePath: string | null
  width: number
  open: (filePath: string) => void
  close: () => void
  setWidth: (w: number) => void
}

export const useOfficePreviewPanelStore = create<OfficePreviewPanelState>((set) => ({
  visible: false,
  filePath: null,
  width: 640,
  open: (filePath) => set({ visible: true, filePath }),
  close: () => set({ visible: false }),
  setWidth: (width) => set({ width }),
}))
