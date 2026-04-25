/**
 * 在项目根目录生成便携版 exe 副本：
 * dist 内 electron-builder portable 产出 → claude-gui-<version>-portable-<git短哈希>.exe 与 claude-gui-latest.exe
 */
import { execSync, spawnSync } from 'child_process'
import { copyFileSync, readdirSync, readFileSync, existsSync, statSync, rmSync, renameSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'
import http from 'http'

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

function findPortableExe(distDir) {
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

/**
 * 清理 dist-build/win-unpacked（electron-builder 打包前需清空）。
 * IDE（Cursor / VS Code）会持有 app.asar 的文件句柄，导致直接删除失败。
 * 解决方案：
 *   1. 先尝试普通 rmSync
 *   2. 若失败则用"重命名"绕过锁——Windows 允许对已打开文件的目录做重命名，
 *      electron-builder 会创建全新的 win-unpacked，旧目录在后台异步清理。
 */
function cleanUnpacked() {
  const target = join(root, 'dist-build', 'win-unpacked')
  if (!existsSync(target)) return

  // 1. 先尝试直接删除
  try {
    rmSync(target, { recursive: true, force: true })
    return
  } catch { /* 被占用，走下面的 rename 方案 */ }

  // 2. 重命名绕过文件锁（Windows 支持对已打开文件的目录重命名）
  const trash = join(root, 'dist-build', `_win-unpacked-trash-${Date.now()}`)
  try {
    renameSync(target, trash)
    // 异步在后台清理旧目录（不阻塞主流程）
    spawnSync('cmd', ['/c', `start /b rmdir /s /q "${trash}"`], { stdio: 'ignore', shell: true })
    console.log('[sync-root-exe] win-unpacked 已重命名，electron-builder 将创建新目录')
    return
  } catch (e) {
    console.warn('[sync-root-exe] 重命名也失败，尝试让 electron-builder 直接覆盖')
    console.warn('[sync-root-exe] 提示：重启 IDE 后 .vscode/settings.json 的排除规则将彻底解决此问题')
  }
}

/**
 * 预填充 winCodeSign 缓存，跳过符号链接创建（-ssc- 选项）。
 * electron-builder 在 Windows 无开发者模式时无法用 7za 创建 macOS dylib 的符号链接，
 * 此函数手动下载并解压，让 electron-builder 直接复用已有缓存。
 */
async function ensureWinCodeSignCache() {
  const cacheDir = join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local'),
    'electron-builder', 'Cache', 'winCodeSign'
  )
  const version = 'winCodeSign-2.6.0'
  const targetDir = join(cacheDir, version)

  if (existsSync(targetDir)) {
    // 检查是否包含 win 目录（确保不是空目录或上次失败的残留）
    if (existsSync(join(targetDir, 'win'))) {
      console.log('[sync-root-exe] winCodeSign 缓存已存在，跳过下载')
      return
    }
    rmSync(targetDir, { recursive: true, force: true })
  }

  const url = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${version}/${version}.7z`
  const archivePath = join(cacheDir, `${version}.7z`)
  mkdirSync(cacheDir, { recursive: true })

  console.log(`[sync-root-exe] 下载 winCodeSign (绕过符号链接问题)…`)
  await new Promise((resolve, reject) => {
    function get(u) {
      const proto = u.startsWith('https') ? https : http
      proto.get(u, { headers: { 'User-Agent': 'electron-builder' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location); return }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => { writeFileSync(archivePath, Buffer.concat(chunks)); resolve() })
        res.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })

  mkdirSync(targetDir, { recursive: true })
  const sevenZa = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  console.log('[sync-root-exe] 解压 winCodeSign（-ssc- 跳过符号链接）…')
  // -ssc- : 不创建符号链接，改为复制实际文件（解决无开发者模式时的权限问题）
  spawnSync(sevenZa, ['x', '-bd', '-ssc-', archivePath, `-o${targetDir}`], {
    stdio: 'inherit',
    shell: false
  })

  // 清理下载的 7z 文件
  try { rmSync(archivePath) } catch { /* ignore */ }

  if (existsSync(join(targetDir, 'win'))) {
    console.log('[sync-root-exe] winCodeSign 缓存准备完毕')
  } else {
    console.warn('[sync-root-exe] winCodeSign 解压后未找到 win 目录，后续签名步骤可能失败（无证书时可忽略）')
  }
}

async function main() {
  console.log('[sync-root-exe] npm run build …')
  execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true })

  // 使用带时间戳的临时输出目录，完全绕过 IDE 对 dist-build/win-unpacked 的文件锁
  const tmpOut = join(root, `dist-build-tmp-${Date.now()}`)
  mkdirSync(tmpOut, { recursive: true })

  // 预填充 winCodeSign 缓存（跳过 macOS 符号链接，解决无开发者模式的权限问题）
  await ensureWinCodeSignCache()

  console.log('[sync-root-exe] electron-builder --win portable …')
  execSync(
    `npx electron-builder --win portable --x64 --config.directories.output="${tmpOut}"`,
    { cwd: root, stdio: 'inherit', shell: true }
  )

  const built = findPortableExe(tmpOut)
  if (!built) {
    console.error('[sync-root-exe] 未在临时输出目录找到 portable 对应的 .exe')
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

  // 清理临时目录（后台异步，不阻塞）
  spawnSync('cmd', ['/c', `start /b rmdir /s /q "${tmpOut}"`], { stdio: 'ignore', shell: true })

  // 读取本地部署目标（local/deploy-config.local.json），存在则复制过去
  const deployConfigPath = join(root, 'local', 'deploy-config.local.json')
  if (existsSync(deployConfigPath)) {
    try {
      const deployConfig = JSON.parse(readFileSync(deployConfigPath, 'utf-8'))
      const deployTarget = deployConfig.deployTarget
      if (deployTarget) {
        mkdirSync(deployTarget, { recursive: true })
        const dest = join(deployTarget, 'claude-gui-latest.exe')
        copyFileSync(latestPath, dest)
        console.log(`[sync-root-exe] 已复制到部署目标: ${dest}`)
      }
    } catch (e) {
      console.warn(`[sync-root-exe] 读取 deploy-config.local.json 失败，跳过部署复制: ${e.message}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
