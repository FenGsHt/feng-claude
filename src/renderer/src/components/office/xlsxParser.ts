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
