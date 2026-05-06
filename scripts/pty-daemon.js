'use strict'
/**
 * PTY Daemon — keeps shell sessions alive across Feng Claude restarts.
 *
 * Launched via:
 *   ELECTRON_RUN_AS_NODE=1 <electron-binary> pty-daemon.js [args]
 *
 * Args:
 *   --id <string>            session hash (used for pipe/socket name)
 *   --shell <string>         shell executable path
 *   --cwd <string>           working directory
 *   --cols <number>          initial terminal columns (default 120)
 *   --rows <number>          initial terminal rows (default 40)
 *   --state-file <path>      path to write session state JSON
 *   --resources-path <path>  Electron resourcesPath (for finding node-pty in prod)
 *
 * Client protocol (newline-delimited JSON):
 *   Server → Client:
 *     {t:'s', d:<base64>}   initial scrollback on connect
 *     {t:'o', d:<string>}   PTY output chunk
 *     {t:'x', code:<number>} PTY exited
 *   Client → Server:
 *     {t:'i', d:<string>}   input to PTY
 *     {t:'r', c:<cols>, r:<rows>} resize PTY
 */

function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const id = arg('id') || 'default'
const shellArg = arg('shell') || (process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'bash'))
const cwd = arg('cwd') || process.cwd()
const cols = parseInt(arg('cols') || '120', 10)
const rows = parseInt(arg('rows') || '40', 10)
const stateFile = arg('state-file')
const resourcesPath = arg('resources-path')
const nodePtyPath = arg('node-pty-path')  // explicit path passed by spawner (most reliable)

const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ── Load node-pty ────────────────────────────────────────────────────
// Try multiple paths: explicit arg → packaged (asar.unpacked) → fallback
let pty
const ptySearchPaths = [
  nodePtyPath,  // explicit path from spawner — works in both dev and prod
  resourcesPath && path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty'),
  path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty'),
  'node-pty'
].filter(Boolean)

for (const p of ptySearchPaths) {
  try { pty = require(p); break } catch { /* try next */ }
}
if (!pty) {
  process.stderr.write('[pty-daemon] Cannot load node-pty. Tried:\n' + ptySearchPaths.join('\n') + '\n')
  process.exit(1)
}

// ── Pipe / socket path ───────────────────────────────────────────────
const pipePath = process.platform === 'win32'
  ? `\\\\.\\pipe\\feng-pty-${id}`
  : path.join(os.tmpdir(), `feng-pty-${id}.sock`)

// Clean up stale Unix socket
if (process.platform !== 'win32') {
  try { fs.unlinkSync(pipePath) } catch { /* ignore */ }
}

// ── Rolling scrollback buffer (200 KB) ──────────────────────────────
const MAX_SCROLLBACK = 200 * 1024
let sbChunks = []
let sbSize = 0

function addScrollback(data) {
  const b = Buffer.from(data)
  sbChunks.push(b)
  sbSize += b.length
  while (sbSize > MAX_SCROLLBACK && sbChunks.length > 1) {
    sbSize -= sbChunks.shift().length
  }
}

function getScrollbackBase64() {
  return sbChunks.length ? Buffer.concat(sbChunks).toString('base64') : null
}

// ── Spawn PTY ────────────────────────────────────────────────────────
const ptyProc = pty.spawn(shellArg, [], {
  name: 'xterm-256color',
  cols,
  rows,
  cwd,
  env: process.env   // inherits env vars passed by Electron on spawn
})

const clients = new Set()

ptyProc.onData(data => {
  addScrollback(data)
  const msg = JSON.stringify({ t: 'o', d: data }) + '\n'
  for (const c of clients) {
    try { if (!c.destroyed) c.write(msg) } catch { /* ignore */ }
  }
})

ptyProc.onExit(({ exitCode }) => {
  const msg = JSON.stringify({ t: 'x', code: exitCode }) + '\n'
  for (const c of clients) {
    try { c.end(msg) } catch { /* ignore */ }
  }
  cleanup()
  process.exit(0)
})

function cleanup() {
  if (stateFile) try { fs.unlinkSync(stateFile) } catch { /* ignore */ }
  if (process.platform !== 'win32') try { fs.unlinkSync(pipePath) } catch { /* ignore */ }
}

// ── IPC server ───────────────────────────────────────────────────────
const server = net.createServer(socket => {
  clients.add(socket)

  // Replay buffered scrollback to the newly connected client
  const sb = getScrollbackBase64()
  if (sb) socket.write(JSON.stringify({ t: 's', d: sb }) + '\n')

  let lineBuf = ''
  socket.on('data', chunk => {
    lineBuf += chunk.toString('utf8')
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.t === 'i') ptyProc.write(msg.d)
        else if (msg.t === 'r') ptyProc.resize(msg.c, msg.r)
      } catch { /* bad JSON, ignore */ }
    }
  })

  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => {
    clients.delete(socket)
    try { socket.destroy() } catch { /* ignore */ }
  })
})

server.listen(pipePath, () => {
  if (stateFile) {
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true })
      fs.writeFileSync(stateFile, JSON.stringify({
        pid: ptyProc.pid,
        pipe: pipePath,
        shell: shellArg,
        cwd,
        startedAt: Date.now()
      }), 'utf8')
    } catch (e) {
      process.stderr.write('[pty-daemon] write state file: ' + e.message + '\n')
    }
  }
  // Notify parent process if still connected via IPC
  try { if (process.send) process.send('ready') } catch { /* ignore */ }
})

server.on('error', err => {
  process.stderr.write('[pty-daemon] server error: ' + err.message + '\n')
  cleanup()
  process.exit(1)
})

// Survive terminal/parent close signals
process.on('SIGINT', () => {})
process.on('SIGTERM', () => {})
if (process.platform !== 'win32') process.on('SIGHUP', () => {})
