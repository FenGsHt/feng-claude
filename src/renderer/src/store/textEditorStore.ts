import { create } from 'zustand'

interface TextEditorState {
  visible: boolean
  filePath: string | null
  content: string
  isDirty: boolean
  width: number
  open: (filePath: string, content: string) => void
  close: () => void
  setContent: (content: string) => void
  setWidth: (w: number) => void
  markSaved: () => void
}

export const useTextEditorStore = create<TextEditorState>((set) => ({
  visible: false,
  filePath: null,
  content: '',
  isDirty: false,
  width: 520,
  open: (filePath, content) => set({ visible: true, filePath, content, isDirty: false }),
  close: () => set({ visible: false, isDirty: false }),
  setContent: (content) => set({ content, isDirty: true }),
  setWidth: (width) => set({ width }),
  markSaved: () => set({ isDirty: false }),
}))
