import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronViteCli = join(dirname(require.resolve('electron-vite')), '..', 'bin', 'electron-vite.js')
const electronBinary = require('electron')

const child = spawn(process.execPath, [electronViteCli, 'dev'], {
  stdio: 'inherit',
  env: process.env
})

let stopping = false

function killDevElectron(signal) {
  if (process.platform === 'win32') return
  // This is the project's exact Electron executable, not a broad "Electron"
  // match, so Cursor/Chrome and other Electron applications are unaffected.
  spawnSync('pkill', [`-${signal}`, '-f', electronBinary], { stdio: 'ignore' })
}

function stop(signal) {
  if (stopping) return
  stopping = true
  child.kill(signal)
  // electron-vite's child Electron process can outlive its parent on macOS.
  // First offer a normal shutdown, then remove persistent dev PTY daemons.
  setTimeout(() => killDevElectron('TERM'), 100)
  setTimeout(() => {
    killDevElectron('KILL')
    process.exit(0)
  }, 500)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

child.on('error', (error) => {
  console.error('[dev] failed to start electron-vite:', error.message)
  process.exit(1)
})

child.on('exit', (code) => {
  if (!stopping) process.exit(code ?? 1)
})
