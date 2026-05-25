import { create } from 'zustand'

export type SplitDirection = 'horizontal' | 'vertical'

interface TextEditorState {
  visible: boolean
  filePath: string | null
  content: string
  isDirty: boolean
  splitSize: number          // editor pane width (horizontal) or height (vertical) in px
  splitDirection: SplitDirection
  open: (filePath: string, content: string) => void
  close: () => void
  setContent: (content: string) => void
  setSplitSize: (size: number) => void
  setSplitDirection: (dir: SplitDirection) => void
  markSaved: () => void
}

export const useTextEditorStore = create<TextEditorState>((set) => ({
  visible: false,
  filePath: null,
  content: '',
  isDirty: false,
  splitSize: 500,
  splitDirection: 'horizontal',
  open: (filePath, content) => set({ visible: true, filePath, content, isDirty: false }),
  close: () => set({ visible: false, isDirty: false }),
  setContent: (content) => set({ content, isDirty: true }),
  setSplitSize: (splitSize) => set({ splitSize }),
  setSplitDirection: (splitDirection) => set({ splitDirection }),
  markSaved: () => set({ isDirty: false }),
}))
