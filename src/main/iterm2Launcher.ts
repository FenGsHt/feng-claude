import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Check if iTerm2 is installed on macOS.
 */
export function isITerm2Installed(): boolean {
  if (process.platform !== 'darwin') return false

  // Check common installation paths
  const commonPaths = [
    '/Applications/iTerm.app',
    '/Applications/iTerm2.app'
  ]

  for (const p of commonPaths) {
    if (existsSync(p)) return true
  }

  // Try mdfind (Spotlight)
  try {
    const result = spawnSync('mdfind', [
      'kMDItemCFBundleIdentifier=com.googlecode.iterm2'
    ], {
      encoding: 'utf8',
      timeout: 2000
    })
    return result.stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Open a new iTerm2 window running the relay script.
 *
 * @param socketPath - Unix socket path to daemon
 * @param shell - Shell executable path
 * @param cwd - Working directory
 * @param cols - Terminal columns
 * @param rows - Terminal rows
 * @returns { success: boolean; error?: string }
 */
export function openITerm2Session(
  socketPath: string,
  shell: string,
  cwd: string,
  cols: number,
  rows: number
): { success: boolean; error?: string } {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'iTerm2 is only supported on macOS' }
  }

  // Resolve relay script path
  const relayScriptCandidates = [
    join(app.getAppPath(), 'scripts', 'iterm2-relay.js'),
    join(__dirname, '..', '..', 'scripts', 'iterm2-relay.js'),
    join(process.cwd(), 'scripts', 'iterm2-relay.js')
  ]

  const relayScript = relayScriptCandidates.find(p => existsSync(p))
  if (!relayScript) {
    return { success: false, error: 'iterm2-relay.js not found' }
  }

  // Build the command to run in iTerm2
  const nodeExe = process.execPath
  const relayCmd = `${nodeExe} "${relayScript}" --socket "${socketPath}" --cols ${cols} --rows ${rows}`

  // AppleScript to open iTerm2 and run the relay command
  const appleScript = `
    tell application "iTerm"
      activate
      set newWindow to (create window with default profile)
      tell current session of newWindow
        write text "${relayCmd}"
      end tell
    end tell
  `

  try {
    const result = spawnSync('osascript', ['-e', appleScript], {
      encoding: 'utf8',
      timeout: 10000
    })

    if (result.status === 0) {
      return { success: true }
    } else {
      return {
        success: false,
        error: result.stderr?.trim() || 'Failed to open iTerm2'
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Get iTerm2 installation status and path.
 */
export function getITerm2Info(): { installed: boolean; path?: string } {
  if (process.platform !== 'darwin') {
    return { installed: false }
  }

  const paths = ['/Applications/iTerm.app', '/Applications/iTerm2.app']
  for (const p of paths) {
    if (existsSync(p)) {
      return { installed: true, path: p }
    }
  }

  return { installed: false }
}
