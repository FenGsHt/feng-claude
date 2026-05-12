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
      `<div class="slide-container"><div class="slide">${slideHtml}</div></div>`
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
    background: white; overflow: hidden;
  }
  .slide-outer {
    width: 100%; overflow: hidden;
  }
  .slide {
    position: relative; width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px;
    transform-origin: top left;
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
  .shape-text { padding: 4px 8px; font-size: 14px; line-height: 1.4; overflow: hidden; }
  .pic {
    position: absolute; object-fit: contain;
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
// Auto-scale slides to fit container width
function scaleSlides() {
  document.querySelectorAll('.slide-container').forEach(function(container) {
    const outer = container.querySelector('.slide-outer');
    const slide = container.querySelector('.slide');
    if (!outer || !slide) return;
    const scale = outer.clientWidth / ${SLIDE_WIDTH};
    slide.style.transform = 'scale(' + scale + ')';
    slide.style.transformOrigin = 'top left';
    outer.style.height = (${SLIDE_HEIGHT} * scale) + 'px';
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

  const spTree = doc.querySelector('spTree')
  let inner = `<span class="slide-number">${slideNum}</span>`

  if (!spTree) return inner

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
