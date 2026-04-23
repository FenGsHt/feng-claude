/**
 * 在项目根目录生成便携版 exe 副本：
 * dist 内 electron-builder portable 产出 → claude-gui-<version>-portable-<git短哈希>.exe 与 claude-gui-latest.exe
 */
import { execSync } from 'child_process'
import { copyFileSync, readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function getVersion() {
  const p = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  return p.version
}

function getShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf-8' }).trim()
  } catch {
    return 'nogit'
  }
}

function findPortableExe() {
  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) return null
  const files = readdirSync(distDir).filter(
    (f) =>
      f.endsWith('.exe') &&
      /portable/i.test(f) &&
      !/setup/i.test(f)
  )
  if (files.length === 0) return null
  files.sort((a, b) => statSync(join(distDir, b)).mtimeMs - statSync(join(distDir, a)).mtimeMs)
  return join(distDir, files[0])
}

function main() {
  console.log('[sync-root-exe] npm run build …')
  execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true })

  console.log('[sync-root-exe] electron-builder --win portable …')
  execSync('npx electron-builder --win portable --x64', {
    cwd: root,
    stdio: 'inherit',
    shell: true
  })

  const built = findPortableExe()
  if (!built) {
    console.error('[sync-root-exe] 未在 dist/ 找到 portable 对应的 .exe')
    process.exit(1)
  }

  const ver = getVersion()
  const sha = getShortSha()
  const outName = `claude-gui-${ver}-portable-${sha}.exe`
  const outPath = join(root, outName)
  const latestPath = join(root, 'claude-gui-latest.exe')

  copyFileSync(built, outPath)
  copyFileSync(built, latestPath)
  console.log(`[sync-root-exe] 已写入: ${outName}`)
  console.log('[sync-root-exe] 已写入: claude-gui-latest.exe')
}

main()
