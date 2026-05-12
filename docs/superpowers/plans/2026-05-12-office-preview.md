# Office File Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight in-app preview for .docx, .xlsx, .pptx files in a sidebar panel with element selection that injects paths into the terminal.

**Architecture:** Pure JS libraries (mammoth, SheetJS, jszip) parse Office files in the renderer process. Main process reads files via IPC. HTML rendered in iframe srcdoc. Element selection injects XPath/cell-ref paths into the terminal input.

**Tech Stack:** mammoth (docx), xlsx/SheetJS (xlsx), jszip (pptx), React, Zustand, Electron IPC

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/office/officeFileDetector.ts` | Detect Office file extensions |
| `src/renderer/src/components/office/docxParser.ts` | Parse .docx → HTML via mammoth |
| `src/renderer/src/components/office/xlsxParser.ts` | Parse .xlsx → HTML table via SheetJS |
| `src/renderer/src/components/office/pptxParser.ts` | Parse .pptx → slides HTML via jszip |
| `src/renderer/src/components/office/elementSelector.ts` | Generate iframe-injected JS for element selection |
| `src/renderer/src/components/office/OfficePreviewPanel.tsx` | Main sidebar panel component |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/src/types/ipc.ts` | Add `OFFICE_PREVIEW_OPEN` constant and types |
| `src/preload/index.ts` | Expose `openOfficePreview` method |
| `src/main/ipcHandlers.ts` | Register handler for reading Office files |
| `src/renderer/src/i18n/zh.ts` | Add `office` sidebar label |
| `src/renderer/src/i18n/en.ts` | Add `office` sidebar label |
| `src/renderer/src/components/sidebar/Sidebar.tsx` | Add office tab and panel |
| `src/renderer/src/components/sidebar/FileTree.tsx` | Double-click opens preview for Office files |
| `src/renderer/src/components/terminal/TerminalDropZone.tsx` | Drop opens preview for Office files |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install mammoth, xlsx, and jszip**

```bash
cd E:\git3\feng1
npm install mammoth xlsx jszip
npm install -D @types/mammoth
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('mammoth'); require('xlsx'); require('jszip'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add mammoth, xlsx, jszip for Office file preview"
```

---

### Task 2: Office File Detector Utility

**Files:**
- Create: `src/renderer/src/components/office/officeFileDetector.ts`

- [ ] **Step 1: Create the detector utility**

```typescript
// src/renderer/src/components/office/officeFileDetector.ts

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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/officeFileDetector.ts
git commit -m "feat(office): add file type detector utility"
```

---

### Task 3: IPC Channel and Preload Bridge

**Files:**
- Modify: `src/renderer/src/types/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipcHandlers.ts`

- [ ] **Step 1: Add IPC constant and types to ipc.ts**

Add to the `IPC` object in `src/renderer/src/types/ipc.ts`:

```typescript
OFFICE_PREVIEW_OPEN: 'office:preview:open',
```

Add interfaces at the bottom of the file:

```typescript
export interface OfficePreviewOpenPayload {
  filePath: string
}

export interface OfficePreviewOpenResult {
  success: boolean
  buffer?: ArrayBuffer
  error?: string
}
```

- [ ] **Step 2: Expose method in preload**

Add to `src/preload/index.ts` inside the `electronAPI` object:

```typescript
openOfficePreview: (filePath: string): Promise<OfficePreviewOpenResult> =>
  ipcRenderer.invoke(IPC.OFFICE_PREVIEW_OPEN, { filePath }),
```

Import `OfficePreviewOpenResult` from the ipc types file.

- [ ] **Step 3: Register IPC handler in main process**

Add handler in `src/main/ipcHandlers.ts`:

```typescript
import { promises as fs } from 'fs'
import path from 'path'

ipcMain.handle(IPC.OFFICE_PREVIEW_OPEN, async (_event, payload: { filePath: string }) => {
  try {
    const ext = path.extname(payload.filePath).toLowerCase()
    if (!['.docx', '.xlsx', '.pptx'].includes(ext)) {
      return { success: false, error: 'Not an Office file' }
    }
    const buffer = await fs.readFile(payload.filePath)
    return { success: true, buffer: buffer.buffer }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/types/ipc.ts src/preload/index.ts src/main/ipcHandlers.ts
git commit -m "feat(office): add IPC channel for Office file preview"
```

---

### Task 4: i18n Labels

**Files:**
- Modify: `src/renderer/src/i18n/zh.ts`
- Modify: `src/renderer/src/i18n/en.ts`

- [ ] **Step 1: Add sidebar.office to zh.ts**

In the `sidebar` object of `src/renderer/src/i18n/zh.ts`, add:

```typescript
office: 'Office',
```

- [ ] **Step 2: Add sidebar.office to en.ts**

In the `sidebar` object of `src/renderer/src/i18n/en.ts`, add:

```typescript
office: 'Office',
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/zh.ts src/renderer/src/i18n/en.ts
git commit -m "feat(office): add i18n labels for Office sidebar tab"
```

---

### Task 5: docx Parser

**Files:**
- Create: `src/renderer/src/components/office/docxParser.ts`

- [ ] **Step 1: Create the docx parser**

```typescript
// src/renderer/src/components/office/docxParser.ts
import mammoth from 'mammoth'

export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const html = result.value

  // Wrap in a styled container
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    padding: 16px;
    margin: 0;
    word-wrap: break-word;
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; }
  img { max-width: 100%; height: auto; }
  h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
  p { margin: 0.5em 0; }
  ul, ol { padding-left: 2em; }
  [data-office-path] { cursor: pointer; transition: outline 0.15s; }
  [data-office-path]:hover { outline: 2px solid #3b82f6; outline-offset: 2px; }
  [data-office-path].selected { outline: 2px solid #f97316; outline-offset: 2px; }
  #path-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e293b; color: #f1f5f9;
    padding: 6px 12px; font-size: 12px; font-family: monospace;
    display: none; z-index: 9999;
  }
</style>
</head>
<body>
${addPathAttributes(html)}
<div id="path-bar"></div>
</body>
</html>`
}

function addPathAttributes(html: string): string {
  // Add data-office-path to block elements for selection
  // This is a simple heuristic: tag each <p>, <h1>-<h6>, <table>, <li>, <blockquote>
  let index = 0
  return html.replace(/<(p|h[1-6]|table|li|blockquote)([^>]*)>/gi, (match, tag, attrs) => {
    index++
    const path = `/body/${tag.toLowerCase()}[${index}]`
    return `<${tag}${attrs} data-office-path="${path}">`
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/docxParser.ts
git commit -m "feat(office): add docx parser with mammoth"
```

---

### Task 6: xlsx Parser

**Files:**
- Create: `src/renderer/src/components/office/xlsxParser.ts`

- [ ] **Step 1: Create the xlsx parser**

```typescript
// src/renderer/src/components/office/xlsxParser.ts
import * as XLSX from 'xlsx'

export interface XlsxParseResult {
  html: string
  sheetNames: string[]
}

export function parseXlsx(buffer: ArrayBuffer): XlsxParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetNames = workbook.SheetNames

  const sheetsHtml = sheetNames.map((name, i) => {
    const sheet = workbook.Sheets[name]
    const json = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, { header: 1, defval: '' })
    return renderSheet(name, json, i === 0)
  })

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    margin: 0; padding: 0;
    color: #1a1a1a;
  }
  .sheet-tabs {
    display: flex; gap: 0; border-bottom: 2px solid #e2e8f0;
    background: #f8fafc; padding: 0 8px;
    position: sticky; top: 0; z-index: 10;
  }
  .sheet-tab {
    padding: 8px 16px; cursor: pointer; border: none;
    background: transparent; font-size: 13px;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .sheet-tab.active {
    background: white; border-bottom-color: #3b82f6;
    font-weight: 600;
  }
  .sheet-content { display: none; overflow: auto; }
  .sheet-content.active { display: block; }
  table {
    border-collapse: collapse; width: max-content; min-width: 100%;
  }
  td, th {
    border: 1px solid #e2e8f0; padding: 4px 8px;
    text-align: left; white-space: nowrap;
    max-width: 300px; overflow: hidden; text-overflow: ellipsis;
  }
  th { background: #f1f5f9; font-weight: 600; position: sticky; top: 0; }
  tr:hover td { background: #f0f9ff; }
  td[data-cell]:hover { outline: 2px solid #3b82f6; outline-offset: -2px; cursor: pointer; }
  td[data-cell].selected { outline: 2px solid #f97316; outline-offset: -2px; }
  #path-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e293b; color: #f1f5f9;
    padding: 6px 12px; font-size: 12px; font-family: monospace;
    display: none; z-index: 9999;
  }
</style>
</head>
<body>
<div class="sheet-tabs">
${sheetNames.map((name, i) => `<button class="sheet-tab${i === 0 ? ' active' : ''}" onclick="showSheet(${i})">${escapeHtml(name)}</button>`).join('\n')}
</div>
${sheetsHtml.join('\n')}
<div id="path-bar"></div>
<script>
function showSheet(idx) {
  document.querySelectorAll('.sheet-tab').forEach((t, i) => t.classList.toggle('active', i === idx))
  document.querySelectorAll('.sheet-content').forEach((c, i) => c.classList.toggle('active', i === idx))
}
</script>
</body>
</html>`

  return { html, sheetNames }
}

function renderSheet(name: string, data: (string | number | boolean | null)[][], isActive: boolean): string {
  if (data.length === 0) return `<div class="sheet-content${isActive ? ' active' : ''}"><p style="padding:16px;color:#888;">Empty sheet</p></div>`

  const rows = data.map((row, rowIdx) => {
    const cells = row.map((cell, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const path = `${name}/${cellRef}`
      const value = cell == null ? '' : escapeHtml(String(cell))
      if (rowIdx === 0) {
        return `<th>${value}</th>`
      }
      return `<td data-cell="${path}">${value}</td>`
    })
    return `<tr>${cells.join('')}</tr>`
  })

  return `<div class="sheet-content${isActive ? ' active' : ''}"><table>${rows.join('\n')}</table></div>`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/xlsxParser.ts
git commit -m "feat(office): add xlsx parser with SheetJS"
```

---

### Task 7: pptx Parser

**Files:**
- Create: `src/renderer/src/components/office/pptxParser.ts`

- [ ] **Step 1: Create the pptx parser**

```typescript
// src/renderer/src/components/office/pptxParser.ts
import JSZip from 'jszip'

export async function parsePptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

  // Get slide file list
  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)![1])
      const numB = parseInt(b.match(/slide(\d+)\.xml/)![1])
      return numA - numB
    })

  const slides: string[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i])!.async('string')
    const slideHtml = await parseSlideXml(xml, zip, i + 1)
    slides.push(slideHtml)
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0; padding: 16px; background: #f1f5f9;
    color: #1a1a1a;
  }
  .slide {
    position: relative; width: 100%;
    aspect-ratio: 16 / 9;
    background: white; margin-bottom: 16px;
    border: 1px solid #e2e8f0; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    overflow: hidden;
  }
  .slide-number {
    position: absolute; top: 8px; right: 8px;
    background: rgba(0,0,0,0.5); color: white;
    padding: 2px 8px; border-radius: 4px;
    font-size: 11px; z-index: 10;
  }
  .shape {
    position: absolute;
    cursor: pointer;
    transition: outline 0.15s;
  }
  .shape:hover { outline: 2px solid #3b82f6; outline-offset: 2px; }
  .shape.selected { outline: 2px solid #f97316; outline-offset: 2px; }
  .shape-text { padding: 4px 8px; font-size: 14px; line-height: 1.4; }
  #path-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e293b; color: #f1f5f9;
    padding: 6px 12px; font-size: 12px; font-family: monospace;
    display: none; z-index: 9999;
  }
</style>
</head>
<body>
${slides.join('\n')}
<div id="path-bar"></div>
</body>
</html>`
}

async function parseSlideXml(xml: string, _zip: JSZip, slideNum: number): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const spTree = doc.querySelector('spTree')
  if (!spTree) return `<div class="slide"><span class="slide-number">${slideNum}</span></div>`

  const shapes: string[] = []
  const spElements = spTree.querySelectorAll('sp')

  spElements.forEach((sp, idx) => {
    const off = sp.querySelector('off')
    const ext = sp.querySelector('ext')
    if (!off || !ext) return

    const x = parseInt(off.getAttribute('x') || '0') / 914400 * 96
    const y = parseInt(off.getAttribute('y') || '0') / 914400 * 96
    const w = parseInt(ext.getAttribute('cx') || '0') / 914400 * 96
    const h = parseInt(ext.getAttribute('cy') || '0') / 914400 * 96

    // Extract text
    const txBody = sp.querySelector('txBody')
    let text = ''
    if (txBody) {
      const paragraphs = txBody.querySelectorAll('p')
      text = Array.from(paragraphs)
        .map((p) => {
          const runs = p.querySelectorAll('r t')
          return Array.from(runs).map((t) => t.textContent || '').join('')
        })
        .join('<br>')
    }

    const path = `/slide[${slideNum}]/shape[${idx + 1}]`
    shapes.push(
      `<div class="shape" data-office-path="${path}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
        `<div class="shape-text">${text}</div>` +
      `</div>`
    )
  })

  return `<div class="slide"><span class="slide-number">${slideNum}</span>${shapes.join('\n')}</div>`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/pptxParser.ts
git commit -m "feat(office): add pptx parser with jszip"
```

---

### Task 8: Element Selector (iframe injection script)

**Files:**
- Create: `src/renderer/src/components/office/elementSelector.ts`

- [ ] **Step 1: Create the element selector script generator**

```typescript
// src/renderer/src/components/office/elementSelector.ts

/**
 * Returns JS code to be injected into the iframe's srcdoc.
 * Handles hover highlighting, click selection, and path reporting via postMessage.
 */
export function getElementSelectorScript(): string {
  return `
(function() {
  let selectedEl = null;
  const pathBar = document.getElementById('path-bar');

  document.addEventListener('mouseover', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '2px solid #3b82f6';
      el.style.outlineOffset = '2px';
    }
  });

  document.addEventListener('mouseout', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });

  document.addEventListener('click', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (!el) return;

    // Deselect previous
    if (selectedEl) {
      selectedEl.classList.remove('selected');
      selectedEl.style.outline = '';
      selectedEl.style.outlineOffset = '';
    }

    // Select new
    selectedEl = el;
    el.classList.add('selected');
    el.style.outline = '2px solid #f97316';
    el.style.outlineOffset = '2px';

    const path = el.getAttribute('data-office-path');
    if (path && pathBar) {
      pathBar.textContent = path;
      pathBar.style.display = 'block';
    }

    // Report to parent window
    window.parent.postMessage({ type: 'office-element-selected', path: path }, '*');
  });
})();
`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/elementSelector.ts
git commit -m "feat(office): add element selector script for iframe injection"
```

---

### Task 9: OfficePreviewPanel Component

**Files:**
- Create: `src/renderer/src/components/office/OfficePreviewPanel.tsx`

- [ ] **Step 1: Create the panel component**

```typescript
// src/renderer/src/components/office/OfficePreviewPanel.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { getOfficeFileType, OfficeFileType } from './officeFileDetector'
import { parseDocx } from './docxParser'
import { parseXlsx } from './xlsxParser'
import { parsePptx } from './pptxParser'
import { getElementSelectorScript } from './elementSelector'

interface PreviewState {
  filePath: string
  fileName: string
  fileType: OfficeFileType
  html: string
  loading: boolean
  error: string | null
}

// Module-level cache
const htmlCache = new Map<string, string>()

export function OfficePreviewPanel(): React.ReactElement {
  const [state, setState] = useState<PreviewState | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Listen for element selection from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'office-element-selected' && e.data.path) {
        setSelectedPath(e.data.path)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const openFile = useCallback(async (filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath
    const fileType = getOfficeFileType(fileName)
    if (!fileType) return

    // Check cache
    const cached = htmlCache.get(filePath)
    if (cached) {
      setState({ filePath, fileName, fileType, html: cached, loading: false, error: null })
      return
    }

    setState({ filePath, fileName, fileType, html: '', loading: true, error: null })

    try {
      const result = await window.electronAPI.openOfficePreview(filePath)
      if (!result.success || !result.buffer) {
        setState((prev) => prev ? { ...prev, loading: false, error: result.error || 'Failed to open file' } : null)
        return
      }

      let html: string
      switch (fileType) {
        case 'docx':
          html = await parseDocx(result.buffer)
          break
        case 'xlsx': {
          const xlsxResult = parseXlsx(result.buffer)
          html = xlsxResult.html
          break
        }
        case 'pptx':
          html = await parsePptx(result.buffer)
          break
        default:
          html = '<p>Unsupported format</p>'
      }

      htmlCache.set(filePath, html)
      setState({ filePath, fileName, fileType, html, loading: false, error: null })
    } catch (err: any) {
      setState((prev) => prev ? { ...prev, loading: false, error: err.message } : null)
    }
  }, [])

  // Expose openFile globally for FileTree and DropZone to call
  useEffect(() => {
    ;(window as any).__officePreviewOpen = openFile
    return () => { delete (window as any).__officePreviewOpen }
  }, [openFile])

  const injectScript = useCallback((html: string): string => {
    const script = getElementSelectorScript()
    // Inject script before closing </body>
    return html.replace('</body>', `<script>${script}</script></body>`)
  }, [])

  if (!state) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
        <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="text-sm">Double-click or drop an Office file to preview</p>
      </div>
    )
  }

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-400">Loading {state.fileName}...</div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-red-400">
        <p className="text-sm">Error: {state.error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-claude-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileTypeIcon type={state.fileType} />
          <span className="truncate text-sm font-medium" title={state.filePath}>
            {state.fileName}
          </span>
        </div>
      </div>
      {selectedPath && (
        <div className="shrink-0 border-b border-claude-border bg-gray-800 px-3 py-1 text-xs text-gray-300 font-mono">
          {selectedPath}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={injectScript(state.html)}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="Office Preview"
        />
      </div>
    </div>
  )
}

function FileTypeIcon({ type }: { type: OfficeFileType }): React.ReactElement {
  const colors: Record<OfficeFileType, string> = {
    docx: '#2b579a',
    xlsx: '#217346',
    pptx: '#d24726',
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
      style={{ backgroundColor: colors[type] }}
    >
      {type.charAt(0).toUpperCase()}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/office/OfficePreviewPanel.tsx
git commit -m "feat(office): add OfficePreviewPanel component with iframe rendering"
```

---

### Task 10: Register Sidebar Tab

**Files:**
- Modify: `src/renderer/src/components/sidebar/Sidebar.tsx`

- [ ] **Step 1: Add 'office' to the Tab type**

Find the `Tab` type union and add `'office'`:

```typescript
type Tab = 'files' | 'history' | 'commands' | 'stats' | 'plugins' | 'skills' | 'mcp' | 'pet' | 'test' | 'devlog' | 'guide' | 'settings' | 'office'
```

- [ ] **Step 2: Add TABS entry**

Add to the TABS array (after the existing entries, before settings):

```typescript
{ id: 'office', label: t.sidebar.office, icon: <OfficeIcon /> },
```

Create the icon component (add near the other icon definitions):

```typescript
function OfficeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}
```

- [ ] **Step 3: Add conditional render**

Add `OfficePreviewPanel` import and add to the render chain:

```typescript
import { OfficePreviewPanel } from './office/OfficePreviewPanel'
```

In the panel render ternary chain, add before the final fallback:

```typescript
: activeTab === 'office' ? <OfficePreviewPanel />
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/sidebar/Sidebar.tsx
git commit -m "feat(office): register Office tab in sidebar"
```

---

### Task 11: FileTree Double-Click Integration

**Files:**
- Modify: `src/renderer/src/components/sidebar/FileTree.tsx`

- [ ] **Step 1: Import the detector**

Add import at the top of FileTree.tsx:

```typescript
import { isOfficeFile } from './office/officeFileDetector'
```

- [ ] **Step 2: Modify double-click handler**

Find the `handleDoubleClick` function. Before the existing `insertRef` call, add an Office file check:

```typescript
if (isOfficeFile(node.name)) {
  // Open Office preview instead of injecting @ref
  const openPreview = (window as any).__officePreviewOpen
  if (openPreview) {
    openPreview(node.path)
    return
  }
}
```

This should go early in the function, before the existing ref injection logic.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/sidebar/FileTree.tsx
git commit -m "feat(office): double-click Office files opens preview"
```

---

### Task 12: TerminalDropZone Integration

**Files:**
- Modify: `src/renderer/src/components/terminal/TerminalDropZone.tsx`

- [ ] **Step 1: Import the detector**

Add import at the top:

```typescript
import { isOfficeFile } from '../sidebar/office/officeFileDetector'
```

- [ ] **Step 2: Modify drop handler**

In the `handleDrop` function, add an early check for Office files before the existing path formatting logic. For both OS file drops and internal file drops, check if any path is an Office file:

```typescript
// After extracting paths, before formatting @ref:
if (paths.length === 1 && isOfficeFile(paths[0])) {
  const openPreview = (window as any).__officePreviewOpen
  if (openPreview) {
    openPreview(paths[0])
    return
  }
}
```

Add this check in both the OS file drop branch and the internal file drag branch, before the `formatFileRefForClaudeCode` call.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/terminal/TerminalDropZone.tsx
git commit -m "feat(office): drop Office files opens preview"
```

---

### Task 13: End-to-End Test

**Files:**
- No new files — manual testing

- [ ] **Step 1: Start dev server**

```bash
cd E:\git3\feng1
npm run dev
```

- [ ] **Step 2: Test docx preview**

1. Open the Office tab in sidebar
2. Double-click a .docx file in the file tree
3. Verify: HTML renders in iframe, hover highlights elements, click selects and shows path

- [ ] **Step 3: Test xlsx preview**

1. Double-click a .xlsx file
2. Verify: table renders with sheet tabs, cell click shows `Sheet1/A1` path
3. Switch between sheet tabs

- [ ] **Step 4: Test pptx preview**

1. Double-click a .pptx file
2. Verify: slides render with shapes, click shows `/slide[1]/shape[1]` path

- [ ] **Step 5: Test drag-drop**

1. Drag a .docx file from file tree to terminal area
2. Verify: opens in Office preview instead of injecting @ref

- [ ] **Step 6: Test element path injection**

1. Click an element in the preview
2. Verify the path bar shows at the bottom of the preview
3. (Future: verify path can be injected into terminal)

- [ ] **Step 7: Commit all changes**

```bash
git add -A
git commit -m "feat: Office file preview (docx/xlsx/pptx) with element selection"
```
