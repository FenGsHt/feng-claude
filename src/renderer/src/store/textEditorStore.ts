import { create } from 'zustand'

export type SplitDirection = 'horizontal' | 'vertical'
export type EditorMode = 'text' | 'image'

interface TextEditorState {
  visible: boolean
  filePath: string | null
  content: string
  isDirty: boolean
  mode: EditorMode
  splitSize: number          // editor pane width (horizontal) or height (vertical) in px
  splitDirection: SplitDirection
  open: (filePath: string, content: string) => void
  openImage: (filePath: string) => void
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
  mode: 'text',
  splitSize: 500,
  splitDirection: 'horizontal',
  open: (filePath, content) => set({ visible: true, filePath, content, isDirty: false, mode: 'text' }),
  openImage: (filePath) => set({ visible: true, filePath, content: '', isDirty: false, mode: 'image' }),
  close: () => set({ visible: false, isDirty: false }),
  setContent: (content) => set({ content, isDirty: true }),
  setSplitSize: (splitSize) => set({ splitSize }),
  setSplitDirection: (splitDirection) => set({ splitDirection }),
  markSaved: () => set({ isDirty: false }),
}))
