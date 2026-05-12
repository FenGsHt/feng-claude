import JSZip from 'jszip'

/** PPTX 幻灯片标准尺寸（EMU → px，96 DPI） */
const EMU_TO_PX = 96 / 914400
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

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
    slides.push(
      `<div class="slide-container"><div class="slide"><div class="slide-inner">${slideHtml}</div></div></div>`
    )
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
  .slide-container {
    margin-bottom: 16px;
    border: 1px solid #e2e8f0; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    background: white;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }
  .slide {
    position: relative;
    width: 100%; height: 100%;
    overflow: hidden;
  }
  .slide-inner {
    position: absolute;
    width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px;
    transform-origin: top left;
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
  .shape-text { padding: 4px 8px; font-size: 14px; line-height: 1.4; overflow: hidden; }
  .pic {
    position: absolute; object-fit: contain;
  }
  .slide-bg {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
  }
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
<script>
function scaleSlides() {
  document.querySelectorAll('.slide-container').forEach(function(container) {
    var slideInner = container.querySelector('.slide-inner');
    if (!slideInner) return;
    var cw = container.clientWidth;
    var ch = container.clientHeight;
    var scale = Math.min(cw / ${SLIDE_WIDTH}, ch / ${SLIDE_HEIGHT});
    slideInner.style.transform = 'scale(' + scale + ')';
  });
}
scaleSlides();
window.addEventListener('resize', scaleSlides);
new ResizeObserver(scaleSlides).observe(document.body);
</script>
</body>
</html>`
}

async function parseSlideXml(xml: string, zip: JSZip, slideNum: number): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const csld = doc.querySelector('cSld')
  let inner = `<span class="slide-number">${slideNum}</span>`

  // Parse slide background (slide → layout → master)
  const slideBg = csld?.querySelector('bg')
  if (slideBg) {
    const bgStyle = await parseBgFillStyle(slideBg, zip, slideNum)
    if (bgStyle) {
      inner = `<div class="slide-bg" style="${bgStyle}"></div>` + inner
    }
  }

  if (!csld) return inner

  const spTree = csld.querySelector('spTree')

  const shapes: string[] = []

  // Parse shapes (sp)
  spTree.querySelectorAll('sp').forEach((sp, idx) => {
    const off = sp.querySelector('off')
    const ext = sp.querySelector('ext')
    if (!off || !ext) return

    const x = parseInt(off.getAttribute('x') || '0') * EMU_TO_PX
    const y = parseInt(off.getAttribute('y') || '0') * EMU_TO_PX
    const w = Math.max(20, parseInt(ext.getAttribute('cx') || '0') * EMU_TO_PX)
    const h = Math.max(20, parseInt(ext.getAttribute('cy') || '0') * EMU_TO_PX)

    const txBody = sp.querySelector('txBody')
    let text = ''
    if (txBody) {
      const paragraphs = txBody.querySelectorAll('p')
      text = Array.from(paragraphs)
        .map((p) => {
          const runs = p.querySelectorAll('r t')
          return Array.from(runs).map((t) => t.textContent || '').join('')
        })
        .filter(Boolean)
        .join('<br>')
    }

    const path = `Slide ${slideNum} / Shape ${idx + 1}`
    shapes.push(
      `<div class="shape" data-office-path="${path}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
        (text ? `<div class="shape-text">${text}</div>` : '') +
      `</div>`
    )
  })

  // Parse pictures (pic)
  spTree.querySelectorAll('pic').forEach((pic, idx) => {
    const off = pic.querySelector('off')
    const ext = pic.querySelector('ext')
    if (!off || !ext) return

    const x = parseInt(off.getAttribute('x') || '0') * EMU_TO_PX
    const y = parseInt(off.getAttribute('y') || '0') * EMU_TO_PX
    const w = parseInt(ext.getAttribute('cx') || '0') * EMU_TO_PX
    const h = parseInt(ext.getAttribute('cy') || '0') * EMU_TO_PX

    // Try to get the image data
    const blip = pic.querySelector('blip')
    const embedId = blip?.getAttribute('r:embed') || blip?.getAttribute('embed') || ''
    if (embedId) {
      const relFile = `ppt/slides/_rels/slide${slideNum}.xml.rels`
      shapes.push(
        `<div class="pic" data-office-path="Slide ${slideNum} / Image ${idx + 1}" ` +
        `style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;">` +
        `[Image]</div>`
      )
    }
  })

  return inner + shapes.join('\n')
}

/**
 * Parse background fill from <p:bg> → <p:bgPr>.
 * Supports: solid color, gradient (2-stop), picture fill.
 */
async function parseBgFillStyle(bg: Element, zip: JSZip, slideNum: number): Promise<string | null> {
  const bgPr = bg.querySelector('bgPr')
  if (!bgPr) return null

  // solidFill
  const solid = bgPr.querySelector('solidFill')
  if (solid) {
    const color = resolveColor(solid)
    if (color) return `background-color: ${color};`
  }

  // gradFill (2-stop linear)
  const grad = bgPr.querySelector('gradFill')
  if (grad) {
    const stops: { pos: number; color: string }[] = []
    grad.querySelectorAll('gs').forEach((gs) => {
      const pos = parseInt(gs.getAttribute('pos') || '0')
      const color = resolveColor(gs)
      if (color) stops.push({ pos, color })
    })
    if (stops.length >= 2) {
      const angle = getGradAngle(grad)
      return `background: linear-gradient(${angle}deg, ${stops.map(s => `${s.color} ${s.pos / 1000}%`).join(', ')});`
    }
  }

  // blipFill (picture fill)
  const blipFill = bgPr.querySelector('blipFill')
  if (blipFill) {
    const blip = blipFill.querySelector('blip')
    const embedId = blip?.getAttribute('r:embed') || blip?.getAttribute('embed') || ''
    if (embedId) {
      const relFile = `ppt/slides/_rels/slide${slideNum}.xml.rels`
      const relsFile = zip.file(relFile)
      if (relsFile) {
        const relsXml = await relsFile.async('string')
        const relDoc = new DOMParser().parseFromString(relsXml, 'application/xml')
        const target = relDoc.querySelector(`[Id="${embedId}"]`)?.getAttribute('Target')
        if (target) {
          const imagePath = target.startsWith('/ppt/') ? target : `ppt/${target}`
          const imgFile = zip.file(imagePath)
          if (imgFile) {
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png'
            const b64 = await imgFile.async('base64')
            return `background-image: url(data:${mime};base64,${b64}); background-size: cover; background-position: center;`
          }
        }
      }
    }
  }

  return null
}

/** Resolve a color from <a:srgbClr>, <a:schemeClr>, or <a:sysClr> */
function resolveColor(el: Element): string | null {
  const srgb = el.querySelector('srgbClr')
  if (srgb) return '#' + (srgb.getAttribute('val') || '')

  const scheme = el.querySelector('schemeClr')
  if (scheme) {
    const val = scheme.getAttribute('val') || ''
    // Map common scheme colors to actual hex values
    const schemeMap: Record<string, string> = {
      lt1: '#FFFFFF', dk1: '#000000', lt2: '#E7E6E6', dk2: '#44546A',
      accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5',
      accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
      phClr: '#FFFFFF', hlink: '#0563C1', folHlink: '#954F72',
    }
    return schemeMap[val] || '#FFFFFF'
  }

  const sys = el.querySelector('sysClr')
  if (sys) {
    const val = sys.getAttribute('val') || ''
    if (val === 'windowText') return '#000000'
    if (val === 'window') return '#FFFFFF'
    const last = sys.getAttribute('lastClr')
    if (last) return '#' + last
  }

  return null
}

/** Get gradient angle from <a:lin> */
function getGradAngle(grad: Element): number {
  const lin = grad.querySelector('lin')
  if (lin) {
    const angle = parseInt(lin.getAttribute('ang') || '0')
    // PPTX uses 60000ths of a degree, clockwise from North
    return Math.round((360 - angle / 60000 + 90) % 360)
  }
  return 90
}
