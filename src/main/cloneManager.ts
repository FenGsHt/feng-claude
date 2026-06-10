import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { URL } from 'url'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createReadStream } from 'fs'
import { join, dirname, extname, basename } from 'path'
import type { WebContents } from 'electron'
import { PNG } from 'pngjs'

type GetWC = () => WebContents | null

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

// ── Page discovery (shared by /site-pages and /clone-site) ───────────────────

interface PageEntry { url: string; slug: string; filename: string }

function urlToFilename(u: string): string {
  const p = new URL(u).pathname.replace(/\/$/, '') || '/'
  if (p === '/') return 'index.html'
  const slug = p.replace(/^\//, '').replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '_') || 'index'
  return `${slug}.html`
}

async function discoverPages(wc: WebContents, targetUrl: string): Promise<{ pages: PageEntry[]; origin: string }> {
  await wc.loadURL(targetUrl)
  await new Promise(r => setTimeout(r, 3000))
  const origin = new URL(targetUrl).origin

  let sitemapUrls: string[] = []
  try {
    const smRes = await fetch(`${origin}/sitemap.xml`)
    if (smRes.ok) {
      const smText = await smRes.text()
      sitemapUrls = [...smText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
    }
  } catch { /* no sitemap */ }

  const pageUrls: string[] = await wc.executeJavaScript(`
    JSON.stringify([...new Set([
      ...document.querySelectorAll('a[href]')
    ].map(a => { try { return new URL(a.getAttribute('href'), location.href).href } catch { return null } })
    .filter(h => h && h.startsWith(${JSON.stringify(origin)}) && !h.includes('#')
      && !/\\.(pdf|zip|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|mp4|mp3|webp)$/i.test(h))
    )].slice(0, 100))
  `).then(r => JSON.parse(r as string))

  const allUrls = [...new Set([targetUrl, ...sitemapUrls, ...pageUrls])]
    .filter(u => { try { return new URL(u).origin === origin } catch { return false } })

  const pages = allUrls.map(u => ({
    url: u,
    slug: new URL(u).pathname.replace(/^\//, '') || 'index',
    filename: urlToFilename(u)
  }))
  return { pages, origin }
}

async function handleSitePages(req: IncomingMessage, res: ServerResponse, getWC: GetWC): Promise<void> {
  const body = await readBody(req)
  const targetUrl = (body?.url as string) ?? ''
  if (!targetUrl) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url' })); return }
  const wc = getWC()
  if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
  try {
    const { pages, origin } = await discoverPages(wc, targetUrl)
    res.writeHead(200); res.end(JSON.stringify({ pages, origin }))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── Replay shim (injected into cloned pages for API record-replay) ──────────

const REPLAY_SHIM = `// replay-shim.js — serves archived API responses to make SPA interactions work offline
(function () {
  var origFetch = window.fetch;
  var OrigXHR = window.XMLHttpRequest;
  var archive = {};
  try {
    var x = new OrigXHR();
    x.open('GET', 'api-archive.json', false);
    x.send();
    if (x.status === 200) archive = JSON.parse(x.responseText);
  } catch (e) {}

  function lookup(method, url) {
    try {
      var u = new URL(url, location.href);
      var exact = method + ' ' + u.pathname + u.search;
      if (archive[exact]) return archive[exact];
      var noQuery = method + ' ' + u.pathname;
      if (archive[noQuery]) return archive[noQuery];
      var prefix = method + ' ' + u.pathname + '?';
      for (var k in archive) if (k.indexOf(prefix) === 0) return archive[k];
    } catch (e) {}
    return null;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    var hit = lookup(method, url);
    if (hit) {
      return Promise.resolve(new Response(hit.body, {
        status: hit.status || 200,
        headers: { 'Content-Type': hit.contentType || 'application/json' }
      }));
    }
    return origFetch.apply(this, arguments);
  };

  window.XMLHttpRequest = function () {
    var xhr = new OrigXHR();
    var method = 'GET', url = '';
    var origOpen = xhr.open;
    xhr.open = function (m, u) {
      method = (m || 'GET').toUpperCase(); url = u;
      return origOpen.apply(xhr, arguments);
    };
    var origSend = xhr.send;
    xhr.send = function () {
      var hit = lookup(method, url);
      if (hit) {
        setTimeout(function () {
          try {
            Object.defineProperty(xhr, 'readyState', { value: 4 });
            Object.defineProperty(xhr, 'status', { value: hit.status || 200 });
            Object.defineProperty(xhr, 'responseText', { value: hit.body });
            Object.defineProperty(xhr, 'response', { value: hit.body });
            Object.defineProperty(xhr, 'getAllResponseHeaders', {
              value: function () { return 'content-type: ' + (hit.contentType || 'application/json'); }
            });
          } catch (e) {}
          try { xhr.dispatchEvent(new Event('readystatechange')); } catch (e) {}
          try { xhr.dispatchEvent(new ProgressEvent('load')); } catch (e) {}
          try { xhr.dispatchEvent(new ProgressEvent('loadend')); } catch (e) {}
        }, 0);
        return;
      }
      return origSend.apply(xhr, arguments);
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;
})();
`

// ── Page clone core (shared by /clone-page and /clone-site) ─────────────────

interface CloneResult {
  htmlFile: string
  cssFile: string
  cssRuleCount: number
  resources: number
  apiResponses: number
  crossOriginCss: string[]
  pageName: string
}

async function clonePageCore(
  wc: WebContents,
  targetUrl: string,
  outputDir: string,
  pageMap: Record<string, string>,
  waitMs: number,
  interactMs = 0
): Promise<CloneResult> {
  mkdirSync(outputDir, { recursive: true })

  // ── Step 1: capture resources via CDP ──────────────────────────────────
  try { wc.debugger.attach('1.3') } catch { /* already attached */ }
  type ReqInfo = { url: string; mimeType: string; status: number; type: string; method: string }
  const requests = new Map<string, ReqInfo>()
  const reqMethods = new Map<string, string>()
  const onMsg = (_evt: Electron.Event, method: string, params: Record<string, unknown>) => {
    if (method === 'Network.requestWillBeSent') {
      const r = params.request as Record<string, unknown>
      reqMethods.set(params.requestId as string, ((r?.method as string) ?? 'GET').toUpperCase())
    }
    if (method === 'Network.responseReceived') {
      const resp = params.response as Record<string, unknown>
      requests.set(params.requestId as string, {
        url: resp.url as string,
        mimeType: (resp.mimeType as string) ?? '',
        status: (resp.status as number) ?? 0,
        type: (params.type as string) ?? '',
        method: reqMethods.get(params.requestId as string) ?? 'GET'
      })
    }
  }
  wc.debugger.on('message', onMsg)
  await wc.debugger.sendCommand('Network.enable', {})
  await wc.debugger.sendCommand('Page.enable', {})

  const navDone = new Promise<void>(resolve => {
    const h = (_e: Electron.Event, method: string) => {
      if (method === 'Page.loadEventFired') { wc.debugger.removeListener('message', h); resolve() }
    }
    wc.debugger.on('message', h)
    setTimeout(resolve, 12000)
  })
  await wc.debugger.sendCommand('Page.navigate', { url: targetUrl })
  await navDone
  await new Promise(r => setTimeout(r, waitMs))
  await wc.executeJavaScript(`
    (async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, window.innerHeight * 0.8)
        await new Promise(r => setTimeout(r, 400))
      }
      window.scrollTo(0, 0)
    })()
  `)
  // extra time to let lazy API calls fire (record-replay coverage)
  if (interactMs > 0) await new Promise(r => setTimeout(r, Math.min(interactMs, 20000)))
  await new Promise(r => setTimeout(r, 1000))
  wc.debugger.removeListener('message', onMsg)

    // merge with manifest/api-archive from previously cloned pages (same outputDir)
    const manifestPath = join(outputDir, 'manifest.json')
    const apiArchivePath = join(outputDir, 'api-archive.json')
    const manifest: Record<string, string> = (() => {
      try { return JSON.parse(readFileSync(manifestPath, 'utf-8')) } catch { return {} }
    })()
    const apiArchive: Record<string, { status: number; contentType: string; body: string }> = (() => {
      try { return JSON.parse(readFileSync(apiArchivePath, 'utf-8')) } catch { return {} }
    })()
    const usedNames = new Set<string>(Object.values(manifest))
    function uniqueName(name: string): string {
      if (!usedNames.has(name)) { usedNames.add(name); return name }
      const ext2 = extname(name); const base2 = basename(name, ext2); let i = 2
      const dir2 = dirname(name)
      while (usedNames.has(join(dir2, `${base2}_${i}${ext2}`).replace(/\\/g, '/'))) i++
      const n = join(dir2, `${base2}_${i}${ext2}`).replace(/\\/g, '/'); usedNames.add(n); return n
    }
    let savedCount = 0
    let apiCount = 0
    for (const [requestId, info] of requests) {
      if (info.status < 200 || info.status >= 300) continue
      const mime = info.mimeType.split(';')[0].trim()
      const isApi = info.type === 'XHR' || info.type === 'Fetch'
      // API responses → api-archive.json (for replay shim), keyed by method + path + query
      if (isApi) {
        try {
          const rb = await wc.debugger.sendCommand('Network.getResponseBody', { requestId }) as { body: string; base64Encoded: boolean }
          const u = new URL(info.url)
          const key = `${info.method} ${u.pathname}${u.search}`
          if (!apiArchive[key]) {
            apiArchive[key] = {
              status: info.status,
              contentType: mime || 'application/json',
              body: rb.base64Encoded ? Buffer.from(rb.body, 'base64').toString('utf-8') : rb.body
            }
            apiCount++
          }
        } catch { /* skip */ }
        continue
      }
      let subdir = 'other'
      if (mime.includes('html')) subdir = '.'
      else if (mime.includes('css')) subdir = 'css'
      else if (mime.includes('javascript') || mime.includes('ecmascript')) subdir = 'js'
      else if (mime.startsWith('image/') || mime.includes('svg')) subdir = 'images'
      else if (mime.includes('font')) subdir = 'fonts'
      else if (mime.includes('json')) subdir = 'data'
      if (manifest[info.url]) { continue }  // already saved by a previous page
      try {
        const rb = await wc.debugger.sendCommand('Network.getResponseBody', { requestId }) as { body: string; base64Encoded: boolean }
        const urlObj = new URL(info.url)
        let rawName = basename(urlObj.pathname) || 'index'
        if (!extname(rawName)) {
          if (subdir === 'css') rawName += '.css'
          else if (subdir === 'js') rawName += '.js'
          else if (subdir === '.') rawName += '.html'
        }
        const finalName = uniqueName(subdir === '.' ? rawName : `${subdir}/${rawName}`)
        const destPath = join(outputDir, finalName)
        mkdirSync(dirname(destPath), { recursive: true })
        const content = rb.base64Encoded ? Buffer.from(rb.body, 'base64') : Buffer.from(rb.body, 'utf-8')
        writeFileSync(destPath, content)
        manifest[info.url] = finalName
        savedCount++
      } catch { /* skip */ }
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    writeFileSync(apiArchivePath, JSON.stringify(apiArchive, null, 2), 'utf-8')
    writeFileSync(join(outputDir, 'replay-shim.js'), REPLAY_SHIM, 'utf-8')

    // ── Step 2: export ALL CSS from live page ──────────────────────────────
    const cssResult: { css: string; crossOrigin: string[] } = await wc.executeJavaScript(`
      (() => {
        const parts = [], cross = []
        for (const sheet of document.styleSheets) {
          try { for (const rule of sheet.cssRules) parts.push(rule.cssText) }
          catch { if (sheet.href) cross.push(sheet.href) }
        }
        return JSON.stringify({ css: parts.join('\\n\\n'), crossOrigin: cross })
      })()
    `).then(r => JSON.parse(r as string))

    let extraCss = ''
    for (const cssUrl of cssResult.crossOrigin) {
      if (manifest[cssUrl]) {
        try { extraCss += '\n\n/* from: ' + cssUrl + ' */\n' + readFileSync(join(outputDir, manifest[cssUrl]), 'utf-8') } catch { /* skip */ }
      }
    }
    let fullCss = cssResult.css + extraCss
    fullCss = fullCss.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, q, rawUrl) => {
      const absUrl = (() => { try { return new URL(rawUrl, targetUrl).href } catch { return rawUrl } })()
      const localFile = manifest[absUrl] ?? manifest[rawUrl]
      return localFile ? `url("${localFile}")` : `url(${q}${rawUrl}${q})`
    })

    const pageName = (() => {
      const p = new URL(targetUrl).pathname.replace(/\/$/, '') || '/'
      if (p === '/') return 'index'
      return p.replace(/^\//, '').replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '_') || 'index'
    })()
    const cssFile = `styles_${pageName}.css`
    writeFileSync(join(outputDir, cssFile), fullCss, 'utf-8')
    const cssRuleCount = (fullCss.match(/\{/g) || []).length

    // ── Step 3: extract rendered DOM ──────────────────────────────────────
    const rawHtml: string = await wc.executeJavaScript(`
      (() => {
        const doctype = document.doctype ? '<!DOCTYPE ' + document.doctype.name + '>' : '<!DOCTYPE html>'
        return doctype + '\\n' + document.documentElement.outerHTML
      })()
    `)

    // ── Step 4: URL rewrite ────────────────────────────────────────────────
    // IMPORTANT: only rewrite outside <script> blocks to avoid corrupting JS code
    const origin2 = new URL(targetUrl).origin
    let html = rawHtml
    html = html.replace(/<base[^>]*>/gi, '')

    const remapUrl = (raw: string): string => {
      const trimmed = raw.trim()
      if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#') || trimmed.startsWith('javascript:')) return raw
      const abs = (() => { try { return new URL(trimmed, targetUrl).href } catch { return trimmed } })()
      return manifest[abs] ?? manifest[trimmed] ?? raw
    }

    // Split on <script> boundaries; only apply regex rewrites to non-script chunks
    function rewriteOutsideScripts(h: string, fn: (chunk: string) => string): string {
      const parts = h.split(/(<script[\s\S]*?<\/script>)/gi)
      return parts.map((part, i) => i % 2 === 1 ? part : fn(part)).join('')
    }

    html = rewriteOutsideScripts(html, chunk => chunk
      .replace(/\bsrc="([^"]*)"/g, (_m, v) => `src="${remapUrl(v)}"`)
      .replace(/\bsrc='([^']*)'/g, (_m, v) => `src='${remapUrl(v)}'`)
      .replace(/\bsrcset="([^"]*)"/g, (_m, v) => {
        const parts2 = v.split(',').map((p: string) => {
          const [u, ...rest] = p.trim().split(/\s+/)
          return [remapUrl(u), ...rest].join(' ')
        })
        return `srcset="${parts2.join(', ')}"`
      })
      .replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, q, u) => `url(${q}${remapUrl(u)}${q})`)
      .replace(/\bdata-src="([^"]*)"/g, (_m, v) => `data-src="${remapUrl(v)}"`)
    )

    // Navigation wiring: only outside scripts
    html = rewriteOutsideScripts(html, chunk => {
      let c = chunk
      for (const [origUrl, localFile] of Object.entries(pageMap)) {
        const variants = [origUrl, origUrl.replace(/\/$/, ''), origUrl.replace(/\/$/, '') + '/']
        for (const v of variants) {
          c = c.split(`href="${v}"`).join(`href="${localFile}"`)
          c = c.split(`href='${v}'`).join(`href='${localFile}'`)
        }
      }
      c = c.replace(new RegExp(`href="(${origin2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*)"`, 'g'), (_m, u) => {
        return Object.values(pageMap).some(f => u === f) ? `href="${u}"` : `href="#"`
      })
      // Rewrite <link href> through manifest (catches relative paths like /static/css/...)
      c = c.replace(/(<link[^>]*\s)href="([^"]*)"/gi, (_m, pre, v) => `${pre}href="${remapUrl(v)}"`)
      c = c.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, (tag) => {
        if (tag.includes('fonts.googleapis') || tag.includes('fonts.bunny') || tag.includes('cdnjs') || tag.includes('unpkg') || tag.includes('jsdelivr')) return tag
        if (!tag.includes('href="https://') && !tag.includes("href='https://")) return tag
        return `<!-- removed: ${tag.replace(/-->/g, '- ->')} -->`
      })
      return c
    })

    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="${cssFile}">\n</head>`)
    // replay shim must load before any app JS
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <script src="replay-shim.js"></script>`)

    const htmlFile = `${pageName}.html`
    writeFileSync(join(outputDir, htmlFile), html, 'utf-8')
    return {
      htmlFile, cssFile, cssRuleCount,
      resources: savedCount,
      apiResponses: apiCount,
      crossOriginCss: cssResult.crossOrigin,
      pageName
    }
}

// ── /clone-page ───────────────────────────────────────────────────────────────

async function handleClonePage(req: IncomingMessage, res: ServerResponse, getWC: GetWC): Promise<void> {
  const body = await readBody(req)
  const targetUrl = (body?.url as string) ?? ''
  const outputDir = (body?.outputDir as string) ?? ''
  const pageMap = (body?.pageMap as Record<string, string>) ?? {}
  const waitMs = Math.min(Number(body?.waitMs ?? 4000), 15000)
  const interactMs = Number(body?.interactMs ?? 0)
  if (!targetUrl || !outputDir) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url or outputDir' })); return }
  const wc = getWC()
  if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
  try {
    const result = await clonePageCore(wc, targetUrl, outputDir, pageMap, waitMs, interactMs)
    res.writeHead(200); res.end(JSON.stringify({ ...result, outputDir }))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── /clone-site — batch: discover → clone all → serve → diff → wire nav ──────

function computeSimilarity(pngA: Buffer, pngB: Buffer, threshold = 30): number {
  const a = PNG.sync.read(pngA)
  const b = PNG.sync.read(pngB)
  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  if (w === 0 || h === 0) return 0
  let diff = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4
      const ib = (y * b.width + x) * 4
      const d = Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2])
      if (d > threshold) diff++
    }
  }
  return Math.round((1 - diff / (w * h)) * 1000) / 10
}

async function handleCloneSite(
  req: IncomingMessage,
  res: ServerResponse,
  getWC: GetWC,
  localServers: Map<string, Server>
): Promise<void> {
  const body = await readBody(req)
  const targetUrl = (body?.url as string) ?? ''
  const outputDir = (body?.outputDir as string) ?? ''
  const maxPages = Math.min(Number(body?.maxPages ?? 10), 30)
  const waitMs = Math.min(Number(body?.waitMs ?? 4000), 15000)
  const interactMs = Number(body?.interactMs ?? 0)
  if (!targetUrl || !outputDir) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url or outputDir' })); return }
  const wc = getWC()
  if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
  try {
    // 1. discover
    const { pages } = await discoverPages(wc, targetUrl)
    const selected = pages.slice(0, maxPages)
    const pageMap: Record<string, string> = Object.fromEntries(selected.map(p => [p.url, p.filename]))

    // 2. clone each page (failures don't abort the batch)
    type PageResult = { url: string; htmlFile: string; resources: number; apiResponses: number; similarity: number | null }
    const results: PageResult[] = []
    const failed: { url: string; error: string }[] = []
    for (const p of selected) {
      try {
        const r = await clonePageCore(wc, p.url, outputDir, pageMap, waitMs, interactMs)
        results.push({ url: p.url, htmlFile: r.htmlFile, resources: r.resources, apiResponses: r.apiResponses, similarity: null })
      } catch (e) {
        failed.push({ url: p.url, error: String(e) })
      }
    }

    // 3. serve
    const serverUrl = await startLocalServer(outputDir, 0, localServers)

    // 4. per-page viewport similarity (original vs clone)
    for (const r of results) {
      try {
        await wc.loadURL(r.url)
        await new Promise(rs => setTimeout(rs, 2500))
        const orig = (await wc.capturePage()).toPNG()
        await wc.loadURL(`${serverUrl}/${r.htmlFile}`)
        await new Promise(rs => setTimeout(rs, 2000))
        const clone = (await wc.capturePage()).toPNG()
        r.similarity = computeSimilarity(orig, clone)
      } catch { r.similarity = null }
    }

    // 5. wire navigation across all cloned files
    const wired = wireNavigationCore(outputDir, pageMap)

    res.writeHead(200); res.end(JSON.stringify({
      serverUrl, outputDir,
      pages: results, failed,
      navUpdated: wired.updated,
      pageMap
    }))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── /serve-local ──────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm'
}

async function startLocalServer(dir: string, port: number, localServers: Map<string, Server>): Promise<string> {
  const key = dir.toLowerCase()
  if (localServers.has(key)) {
    try { localServers.get(key)!.close() } catch { /* ignore */ }
    localServers.delete(key)
  }
  const srv = createServer((req2, res2) => {
    const reqPath = decodeURIComponent(new URL(req2.url ?? '/', 'http://localhost').pathname)
    let filePath = join(dir, reqPath === '/' ? 'index.html' : reqPath)
    if (!existsSync(filePath) && existsSync(filePath + '.html')) filePath += '.html'
    if (!existsSync(filePath)) {
      // SPA fallback: history-router paths resolve to index.html
      const indexPath = join(dir, 'index.html')
      const acceptsHtml = (req2.headers.accept ?? '').includes('text/html')
      if (acceptsHtml && !extname(reqPath) && existsSync(indexPath)) {
        filePath = indexPath
      } else {
        res2.writeHead(404); res2.end('Not found'); return
      }
    }
    const ext2 = extname(filePath).toLowerCase()
    res2.setHeader('Content-Type', MIME_MAP[ext2] ?? 'application/octet-stream')
    res2.setHeader('Access-Control-Allow-Origin', '*')
    createReadStream(filePath).pipe(res2)
  })
  await new Promise<void>((resolve, reject) => {
    srv.listen(port || 0, '127.0.0.1', () => resolve())
    srv.on('error', reject)
  })
  const actualPort = (srv.address() as { port: number }).port
  localServers.set(key, srv)
  return `http://localhost:${actualPort}`
}

async function handleServeLocal(req: IncomingMessage, res: ServerResponse, localServers: Map<string, Server>): Promise<void> {
  const body = await readBody(req)
  const dir = (body?.dir as string) ?? ''
  const port = Number(body?.port ?? 0)
  if (!dir || !existsSync(dir)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing or invalid dir' })); return }
  try {
    const url = await startLocalServer(dir, port, localServers)
    res.writeHead(200); res.end(JSON.stringify({ url, port: Number(new URL(url).port), dir }))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── /patch-element ────────────────────────────────────────────────────────────

async function handlePatchElement(req: IncomingMessage, res: ServerResponse, getWC: GetWC): Promise<void> {
  const body = await readBody(req)
  const selector = (body?.selector as string) ?? ''
  const applyTo = (body?.applyTo as string) ?? ''
  if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing selector' })); return }
  const wc = getWC()
  if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
  try {
    const result = await wc.executeJavaScript(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        const s = getComputedStyle(el)
        const sb = getComputedStyle(el, '::before')
        const sa = getComputedStyle(el, '::after')
        const PROPS = [
          'display','position','top','left','right','bottom','float','clear','box-sizing',
          'width','min-width','max-width','height','min-height','max-height',
          'margin','margin-top','margin-right','margin-bottom','margin-left',
          'padding','padding-top','padding-right','padding-bottom','padding-left',
          'background','background-color','background-image','background-size',
          'background-position','background-repeat','background-attachment',
          'color','font-family','font-size','font-weight','font-style','font-variant',
          'line-height','letter-spacing','text-align','text-decoration','text-transform',
          'white-space','word-break','overflow-wrap','text-overflow',
          'border','border-top','border-right','border-bottom','border-left',
          'border-radius','border-collapse','outline','box-shadow',
          'opacity','visibility','overflow','overflow-x','overflow-y','clip-path',
          'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
          'justify-content','align-items','align-self','align-content','gap',
          'grid-template-columns','grid-template-rows','grid-column','grid-row',
          'transform','transform-origin','transition','animation','will-change',
          'z-index','pointer-events','cursor','list-style','list-style-type',
          'vertical-align','object-fit','object-position','resize',
          'content','counter-increment','counter-reset',
        ]
        const decls = PROPS.map(p => {
          const v = s.getPropertyValue(p).trim()
          return v ? \`  \${p}: \${v};\` : ''
        }).filter(Boolean)
        const pseudoDecls = (pseudo, name) => {
          const d = PROPS.map(p => {
            const v = pseudo.getPropertyValue(p).trim()
            return v && v !== 'none' && v !== 'normal' ? \`  \${p}: \${v};\` : ''
          }).filter(Boolean)
          return d.length ? \`\${name} {\\n\${d.join('\\n')}\\n}\` : ''
        }
        const rect = el.getBoundingClientRect()
        const block = \`\${${JSON.stringify(selector)}} {\\n\${decls.join('\\n')}\\n}\`
        const beforeBlock = pseudoDecls(sb, \`\${${JSON.stringify(selector)}}::before\`)
        const afterBlock = pseudoDecls(sa, \`\${${JSON.stringify(selector)}}::after\`)
        return JSON.stringify({
          selector: ${JSON.stringify(selector)},
          stylePatch: [block, beforeBlock, afterBlock].filter(Boolean).join('\\n\\n'),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })
      })()
    `).then(r => r ? JSON.parse(r as string) : null)

    if (!result) { res.writeHead(404); res.end(JSON.stringify({ error: 'Element not found' })); return }

    // applyTo: write the style patch directly into the clone HTML file
    if (applyTo) {
      if (!existsSync(applyTo)) {
        res.writeHead(400); res.end(JSON.stringify({ error: `applyTo file not found: ${applyTo}` })); return
      }
      let content = readFileSync(applyTo, 'utf-8')
      const styleBlock = `<style data-patch=${JSON.stringify(selector)}>\n${result.stylePatch}\n</style>\n`
      // replace previous patch for the same selector instead of stacking
      const existing = new RegExp(`<style data-patch=${JSON.stringify(selector).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>[\\s\\S]*?</style>\\n?`)
      if (existing.test(content)) content = content.replace(existing, styleBlock)
      else content = content.replace(/<\/head>/i, `${styleBlock}</head>`)
      writeFileSync(applyTo, content, 'utf-8')
      res.writeHead(200); res.end(JSON.stringify({ ...result, applied: true, file: applyTo }))
      return
    }
    res.writeHead(200); res.end(JSON.stringify(result))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── /wire-navigation ──────────────────────────────────────────────────────────

function wireNavigationCore(dir: string, pageMap: Record<string, string>): { updated: number; files: string[] } {
  const htmlFiles = readdirSync(dir).filter(f => f.endsWith('.html'))
  let updated = 0
  for (const file of htmlFiles) {
    const filePath = join(dir, file)
    let content = readFileSync(filePath, 'utf-8')
    let changed = false
    for (const [origUrl, localFile] of Object.entries(pageMap)) {
      const variants = [origUrl, origUrl.replace(/\/$/, ''), origUrl.replace(/\/$/, '') + '/']
      for (const v of variants) {
        if (content.includes(`href="${v}"`) || content.includes(`href='${v}'`)) {
          content = content.split(`href="${v}"`).join(`href="${localFile}"`)
          content = content.split(`href='${v}'`).join(`href='${localFile}'`)
          changed = true
        }
      }
    }
    if (changed) { writeFileSync(filePath, content, 'utf-8'); updated++ }
  }
  return { updated, files: htmlFiles }
}

async function handleWireNavigation(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const dir = (body?.dir as string) ?? ''
  const pageMap = (body?.pageMap as Record<string, string>) ?? {}
  if (!dir || !existsSync(dir)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing or invalid dir' })); return }
  try {
    res.writeHead(200); res.end(JSON.stringify(wireNavigationCore(dir, pageMap)))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── /screenshot-full — 全页截图（分段滚动拼接）──────────────────────────────

async function handleScreenshotFull(req: IncomingMessage, res: ServerResponse, getWC: GetWC): Promise<void> {
  const body = await readBody(req)
  const outputPath = (body?.outputPath as string) ?? ''    // optional: save to disk
  const scrollDelay = Math.min(Number(body?.scrollDelay ?? 300), 2000)
  const maxHeight = Math.min(Number(body?.maxHeight ?? 30000), 60000)

  const wc = getWC()
  if (!wc) { res.writeHead(400); res.end(JSON.stringify({ error: 'Browser not open' })); return }
  try {
    // Get page dimensions
    const dims: { scrollWidth: number; scrollHeight: number; viewportWidth: number; viewportHeight: number } =
      await wc.executeJavaScript(`
        JSON.stringify({
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: Math.min(document.documentElement.scrollHeight, ${maxHeight}),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        })
      `).then(r => JSON.parse(r as string))

    const { scrollHeight, viewportHeight, viewportWidth } = dims

    // Scroll to top first
    await wc.executeJavaScript('window.scrollTo(0,0)')
    await new Promise(r => setTimeout(r, 200))

    // Capture slices by scrolling
    const slices: Buffer[] = []
    let currentY = 0
    while (currentY < scrollHeight) {
      await wc.executeJavaScript(`window.scrollTo(0, ${currentY})`)
      await new Promise(r => setTimeout(r, scrollDelay))
      const img = await wc.capturePage()
      slices.push(img.toPNG())
      currentY += viewportHeight
    }

    // Scroll back to top
    await wc.executeJavaScript('window.scrollTo(0,0)')

    // Stitch slices vertically using pngjs
    const decoded = slices.map(buf => PNG.sync.read(buf))
    const sliceW = decoded[0]?.width ?? viewportWidth
    const totalH = Math.min(scrollHeight, decoded.reduce((s, d) => s + d.height, 0))
    const out = new PNG({ width: sliceW, height: totalH })

    let destY = 0
    for (let i = 0; i < decoded.length; i++) {
      const slice = decoded[i]!
      // last slice: only copy the remaining rows to avoid overlap
      const remaining = totalH - destY
      const rowsToCopy = Math.min(slice.height, remaining)
      // For all slices except the last, skip the last few px that overlap with next slice
      // (browser may have sub-pixel rounding, copy full rows)
      for (let row = 0; row < rowsToCopy; row++) {
        const srcOff = row * slice.width * 4
        const dstOff = (destY + row) * out.width * 4
        slice.data.copy(out.data, dstOff, srcOff, srcOff + sliceW * 4)
      }
      destY += rowsToCopy
      if (destY >= totalH) break
    }

    const pngBuf = PNG.sync.write(out)
    const base64 = pngBuf.toString('base64')

    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, pngBuf)
    }

    res.writeHead(200); res.end(JSON.stringify({
      data: base64,
      width: sliceW,
      height: totalH,
      slices: slices.length,
      savedTo: outputPath || null
    }))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })) }
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Handle clone-related HTTP routes. Returns true if the route was handled.
 */
export async function handleCloneRoute(
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
  getWC: GetWC,
  localServers: Map<string, Server>
): Promise<boolean> {
  if (path === '/site-pages'       && req.method === 'POST') { await handleSitePages(req, res, getWC);               return true }
  if (path === '/clone-page'       && req.method === 'POST') { await handleClonePage(req, res, getWC);               return true }
  if (path === '/clone-site'       && req.method === 'POST') { await handleCloneSite(req, res, getWC, localServers); return true }
  if (path === '/serve-local'      && req.method === 'POST') { await handleServeLocal(req, res, localServers);       return true }
  if (path === '/patch-element'    && req.method === 'POST') { await handlePatchElement(req, res, getWC);            return true }
  if (path === '/wire-navigation'  && req.method === 'POST') { await handleWireNavigation(req, res);                 return true }
  if (path === '/screenshot-full'  && req.method === 'POST') { await handleScreenshotFull(req, res, getWC);          return true }
  return false
}
