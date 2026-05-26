/**
 * [2026-05-12] Sidebar tab navigation helpers — shared between Sidebar and other components.
 * Extracted to avoid circular dependency between Sidebar and FileTree.
 */

import { useOfficePreviewPanelStore } from '../../store/officePreviewPanelStore'
import { useTextEditorStore } from '../../store/textEditorStore'

type Tab = 'files' | 'history' | 'commands' | 'settings' | 'stats' | 'plugins' | 'guide' | 'mcp' | 'skills' | 'pet' | 'devlog'

let setActiveTab: ((tab: Tab) => void) | null = null

export function registerSidebarTabSwitcher(fn: (tab: Tab) => void): void {
  setActiveTab = fn
}

export function navigateToSettingsTab(): void { setActiveTab?.('settings') }
export function navigateToPetTab(): void { setActiveTab?.('pet') }
export function navigateToDevLogTab(): void { setActiveTab?.('devlog') }
export function navigateToFilesTab(): void { setActiveTab?.('files') }

/** [2026-05-12] Office 预览右侧面板。直接通过 store 打开。 */
export function openOfficePreview(filePath: string): void {
  useOfficePreviewPanelStore.getState().open(filePath)
}

/** [2026-05-26] 图片预览面板。通过 IPC 读成 base64 data URL，绕过 CSP 限制。 */
export async function openImagePreview(filePath: string): Promise<void> {
  const result = await window.electronAPI.readFileAsDataUrl(filePath)
  useTextEditorStore.getState().openImage(filePath, result.success && result.dataUrl ? result.dataUrl : '')
}

/** [2026-05-25] 文本编辑器右侧面板。读取文件内容后打开。 */
export async function openTextEditor(filePath: string): Promise<void> {
  const result = await window.electronAPI.readTextFile(filePath)
  if (result.success && result.content !== undefined) {
    useTextEditorStore.getState().open(filePath, result.content)
  } else {
    // Open with empty content on read error, still show the panel
    useTextEditorStore.getState().open(filePath, result.error ? `// 无法读取文件: ${result.error}` : '')
  }
}
