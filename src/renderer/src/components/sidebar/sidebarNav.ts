/**
 * [2026-05-12] Sidebar tab navigation helpers — shared between Sidebar and other components.
 * Extracted to avoid circular dependency between Sidebar and FileTree.
 */

type Tab = 'files' | 'history' | 'commands' | 'settings' | 'stats' | 'plugins' | 'guide' | 'mcp' | 'skills' | 'pet' | 'test' | 'devlog' | 'office'

let setActiveTab: ((tab: Tab) => void) | null = null

export function registerSidebarTabSwitcher(fn: (tab: Tab) => void): void {
  setActiveTab = fn
}

export function navigateToSettingsTab(): void { setActiveTab?.('settings') }
export function navigateToPetTab(): void { setActiveTab?.('pet') }
export function navigateToDevLogTab(): void { setActiveTab?.('devlog') }
export function navigateToFilesTab(): void { setActiveTab?.('files') }

/** [2026-05-12] Office 预览改为右侧面板，不再切 tab。直接调用全局 open 函数。 */
export function openOfficePreview(filePath: string): void {
  const fn = (window as any).__officePreviewOpen
  if (typeof fn === 'function') fn(filePath)
}
