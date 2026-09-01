/**
 * Resolve an OS-backed File to its absolute path.
 * Electron 43 replaced the legacy File.path augmentation with webUtils.getPathForFile.
 * Keep the old property as a fallback so development builds on older Electron still work.
 */
export function getElectronFilePath(file: File): string {
  try {
    const path = window.electronAPI.getPathForFile?.(file)
    if (path) return path
  } catch {
    // Browser-created files and older Electron builds may not have a native path.
  }
  return (file as File & { path?: string }).path ?? ''
}
