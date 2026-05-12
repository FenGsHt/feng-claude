const OFFICE_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const
export type OfficeFileType = 'docx' | 'xlsx' | 'pptx'

export function isOfficeFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return OFFICE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function getOfficeFileType(filename: string): OfficeFileType | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.pptx')) return 'pptx'
  return null
}
