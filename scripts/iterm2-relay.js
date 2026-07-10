#!/usr/bin/env node
'use strict'
/**
 * iTerm2 Relay — bridges iTerm2 terminal I/O to feng-claude daemon socket.
 *
 * Launched by AppleScript inside iTerm2:
 *   node iterm2-relay.js --socket <path> --cols <n> --rows <n>
 *
 * Protocol (NDJSON over Unix socket):
 *   Client → Server:
 *     {t:'r', c:<cols>, r:<rows>}  resize notification
 *     {t:'i', d:<string>}          input chunk
 *   Server → Client:
 *     {t:'s', d:<base64>}          initial scrollback
 *     {t:'o', d:<string>}          output chunk
 *     {t:'x', code:<number>}       PTY exited
 */

function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const socketPath = arg('socket')
const cols = parseInt(arg('cols') || '120', 10)
const rows = parseInt(arg('rows') || '40', 10)

if (!socketPath) {
  process.stderr.write('[iterm2-relay] --socket argument required\n')
  process.exit(1)
}

const net = require('net')

// ── Connect to daemon socket ────────────────────────────────────────
const socket = new net.Socket()
let connected = false
let lineBuf = ''

socket.on('connect', () => {
  connected = true
  // Send initial resize
  socket.write(JSON.stringify({ t: 'r', c: cols, r: rows }) + '\n')
})

socket.on('data', (chunk) => {
  lineBuf += chunk.toString('utf8')
  const lines = lineBuf.split('\n')
  lineBuf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      if (msg.t === 's' && msg.d) {
        // Initial scrollback (base64)
        const raw = Buffer.from(msg.d, 'base64').toString()
        process.stdout.write(raw)
      } else if (msg.t === 'o' && msg.d) {
        // Output chunk
        process.stdout.write(msg.d)
      } else if (msg.t === 'x') {
        // PTY exited
        process.exit(msg.code ?? 0)
      }
    } catch {
      // bad JSON, ignore
    }
  }
})

socket.on('close', () => {
  if (connected) {
    process.exit(0)
  } else {
    process.stderr.write('[iterm2-relay] Failed to connect to daemon socket\n')
    process.exit(1)
  }
})

socket.on('error', (err) => {
  process.stderr.write(`[iterm2-relay] Socket error: ${err.message}\n`)
  process.exit(1)
})

// ── Forward stdin to socket ─────────────────────────────────────────
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.on('data', (data) => {
  if (connected) {
    socket.write(JSON.stringify({ t: 'i', d: data.toString('utf8') }) + '\n')
  }
})

// ── Handle window resize (SIGWINCH) ─────────────────────────────────
function getTerminalSize() {
  // Use tty to get current terminal dimensions
  try {
    if (process.stdout.isTTY) {
      return {
        cols: process.stdout.columns || cols,
        rows: process.stdout.rows || rows
      }
    }
  } catch {
    // ignore
  }
  return { cols, rows }
}

process.on('SIGWINCH', () => {
  const { cols: c, rows: r } = getTerminalSize()
  if (connected) {
    socket.write(JSON.stringify({ t: 'r', c, r }) + '\n')
  }
})

// ── Cleanup on exit ─────────────────────────────────────────────────
function cleanup() {
  try { socket.destroy() } catch { /* ignore */ }
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// ── Connect ─────────────────────────────────────────────────────────
socket.connect(socketPath)
