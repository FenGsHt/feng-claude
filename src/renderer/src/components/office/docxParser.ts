import mammoth from 'mammoth'

export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const html = result.value

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
  let index = 0
  return html.replace(/<(p|h[1-6]|table|li|blockquote)([^>]*)>/gi, (match, tag, attrs) => {
    index++
    const path = `/body/${tag.toLowerCase()}[${index}]`
    return `<${tag}${attrs} data-office-path="${path}">`
  })
}
