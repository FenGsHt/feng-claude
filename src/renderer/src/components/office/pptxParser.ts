import JSZip from 'jszip'

export async function parsePptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)

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
