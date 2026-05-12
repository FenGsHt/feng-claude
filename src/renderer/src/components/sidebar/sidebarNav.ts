/**
 * [2026-05-12] Sidebar tab navigation helpers — shared between Sidebar and other components.
 * Extracted to avoid circular dependency between Sidebar and FileTree.
 */

import { useOfficePreviewPanelStore } from '../../store/officePreviewPanelStore'

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
