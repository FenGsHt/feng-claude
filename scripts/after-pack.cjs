const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * Give unsigned macOS builds a complete ad-hoc signature before electron-builder
 * creates the DMG/ZIP. This seals the bundle so Gatekeeper can distinguish it
 * from a damaged app and offer the normal Privacy & Security override.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  console.log(`[after-pack] Applying ad-hoc signature to ${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' }
  )

  console.log(`[after-pack] Verifying ad-hoc signature for ${appPath}`)
  execFileSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' }
  )
}
