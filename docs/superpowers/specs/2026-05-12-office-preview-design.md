# Office File Preview — Design Spec

## Overview

Add lightweight in-app preview for .docx, .xlsx, .pptx files using pure JavaScript libraries (no external binary dependency). Renders as a sidebar panel with element selection that injects paths into the terminal.

## Goals

- Preview Word, Excel, PowerPoint files within the app
- Pure JS parsing — no dependency on officecli binary
- Element selection with path injection into terminal (compatible with officecli path conventions)
- Lightweight, fast (< 1.5s for typical files)

## Architecture

```
User Action (double-click / drag-drop)
        ↓
   Renderer detects Office file extension
        ↓
   IPC: OFFICE_PREVIEW_OPEN { filePath }
        ↓
   Main process reads file → returns ArrayBuffer
        ↓
   Renderer parses with JS library:
     .docx → mammoth.js → HTML
     .xlsx → SheetJS → HTML table
     .pptx → jszip + XML → slides HTML
        ↓
   iframe srcdoc renders HTML
        ↓
   Injected JS handles element selection → path → terminal input
```

## Libraries

| Format | Library | Purpose |
|--------|---------|---------|
| .docx  | mammoth | docx → clean HTML |
| .xlsx  | xlsx (SheetJS) | parse spreadsheet → HTML table |
| .pptx  | jszip + manual XML | unzip pptx, parse slide XML → HTML |

## New Files

### Main Process

**`src/main/officePreview.ts`**
- IPC handler for `OFFICE_PREVIEW_OPEN`
- Reads file from disk using `fs.promises.readFile`
- Returns `ArrayBuffer` to renderer
- Validates file extension before reading

### Renderer — Parsers

**`src/renderer/src/components/office/docxParser.ts`**
- Uses `mammoth.convertToHtml({ buffer })`
- Returns HTML string
- Handles images as base64 inline

**`src/renderer/src/components/office/xlsxParser.ts`**
- Uses `XLSX.read(buffer, { type: 'array' })`
- Generates tabbed HTML: one tab per sheet
- Renders each sheet as `<table>` with proper colspan/rowspan for merged cells
- For sheets with > 1000 rows, render only visible rows in the iframe using scroll-based virtualization (simple approach: render first 100 rows, append more on scroll)

**`src/renderer/src/components/office/pptxParser.ts`**
- Uses `JSZip.loadAsync(buffer)` to unzip
- Parses `ppt/slides/slide*.xml` for slide content
- Parses `ppt/slideLayouts/` for layout info
- Extracts text boxes, basic shapes, images
- Renders each slide as a fixed-aspect-ratio div (16:9)
- Does NOT support animations/transitions (preview only)

### Renderer — Components

**`src/renderer/src/components/office/OfficePreviewPanel.tsx`**
- Main sidebar panel component
- Manages state: current file, parsed HTML, loading, error
- Contains iframe with srcdoc
- Shows file type icon, filename, sheet tabs (Excel), slide navigation (PPT)
- Caches parsed results in memory (same file won't re-parse)

**`src/renderer/src/components/office/ElementSelector.ts`**
- Injected into iframe via script tag in srcdoc
- Mouse hover: blue border highlight
- Click: orange border selection
- Calculates path:
  - Word: XPath like `/body/p[3]`, `/body/table[1]/tr[2]/td[1]`
  - Excel: cell reference like `Sheet1/B5`
  - PPT: path like `/slide[2]/shape[1]`
- Sends selected path to parent window via `postMessage`
- Shows path in a floating bar at bottom of preview

### Renderer — Utilities

**`src/renderer/src/components/office/officeFileDetector.ts`**
- `isOfficeFile(filename: string): boolean`
- `getOfficeFileType(filename: string): 'docx' | 'xlsx' | 'pptx' | null`

## Modified Files

### `src/renderer/src/types/ipc.ts`
- Add `OFFICE_PREVIEW_OPEN = 'office:preview:open'`

### `src/preload/index.ts`
- Expose `openOfficePreview(filePath: string): Promise<ArrayBuffer>`

### `src/renderer/src/components/sidebar/Sidebar.tsx`
- Add `'office'` to `Tab` type union
- Add `TabConfig` entry with document icon
- Add conditional render for `OfficePreviewPanel`

### `src/renderer/src/components/sidebar/FileTree.tsx`
- Double-click handler: detect Office files → `openOfficePreview()` instead of `sendInput('@path')`

### `src/renderer/src/components/terminal/TerminalDropZone.tsx`
- Drop handler: detect Office files → `openOfficePreview()` instead of `@ref` injection

## Element Selection — Path Formats

| Format | Path Pattern | Example |
|--------|-------------|---------|
| Word paragraph | `/body/p[N]` | `/body/p[3]` |
| Word table cell | `/body/table[N]/tr[R]/td[C]` | `/body/table[1]/tr[2]/td[1]` |
| Word heading | `/body/h[N]` | `/body/h[1]` |
| Excel cell | `SheetName/CellRef` | `Sheet1/B5` |
| PPT slide shape | `/slide[N]/shape[M]` | `/slide[2]/shape[1]` |

These paths are compatible with officecli conventions, so users can construct commands like:
```
officecli set file.docx /body/p[3] --text "new content"
```

## Data Flow

```
┌─────────────┐   IPC:OFFICE_PREVIEW_OPEN    ┌─────────────┐
│   Renderer   │ ──────────────────────────→  │    Main     │
│              │ ←──────────────────────────  │             │
│  OfficePanel │    fileBuffer (ArrayBuffer)  │  readFile() │
│      ↓       │                              └─────────────┘
│  Parser (JS) │
│      ↓       │
│  iframe srcdoc│
│      ↓       │
│  ElementSel  │
│      ↓       │
│  sendInput() │ → useSessionStore.sendInput() → Terminal PTY
└─────────────┘
```

## Performance

| Stage | Estimated Time | Notes |
|-------|---------------|-------|
| File read | < 50ms | Local file, usually few MB |
| docx parse (mammoth) | 100-500ms | Fast for typical documents |
| xlsx parse (SheetJS) | 50-200ms | Very fast |
| pptx parse (jszip+XML) | 200ms-1s | Depends on slide count |
| iframe render | 100-300ms | HTML injection |
| Element selection | Instant | Click event handler |

**Total**: 0.5–1.5s for first open. Cached re-renders are instant.

### Optimizations

- In-memory cache: parsed HTML stored per file path, invalidated on file change
- Excel: only render active sheet tab, lazy-load others
- PPT: batch render for > 50 slides (render visible + adjacent slides)
- Large Excel: virtual scrolling for > 1000 rows

## Error Handling

- Invalid/corrupted file: show error message in preview panel with file name
- Unsupported features (PPT animations, Excel macros): gracefully skip, show note
- File not found: show error, offer to remove from recent list
- Library load failure: show error with retry button

## Testing

- Unit tests for each parser (docxParser, xlsxParser, pptxParser) with sample files
- Integration test: open each format, verify HTML output
- Element selection test: click elements, verify path calculation
- Performance test: measure parse time for various file sizes
