import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  readdirSync, rmSync, statSync
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { shell } from 'electron'
import type { SkillEntry } from '../renderer/src/types/ipc'
import { SettingsStore } from './settingsStore'

export type { SkillEntry }

function globalCommandsDir(): string {
  return join(homedir(), '.claude', 'commands')
}

/** Extract title + description from markdown content */
function extractMeta(content: string): { title: string; description: string } {
  const lines = content.split('\n')
  let i = 0

  // Skip YAML frontmatter
  if (lines[0]?.trim() === '---') {
    i = 1
    while (i < lines.length && lines[i].trim() !== '---') i++
    i++
  }

  // Skip blank lines
  while (i < lines.length && lines[i].trim() === '') i++

  // Title from first heading
  let title = ''
  if (lines[i]?.startsWith('#')) {
    title = lines[i].replace(/^#+\s*/, '').trim()
    i++
  }

  // Description from first paragraph
  while (i < lines.length && lines[i].trim() === '') i++
  const descLines: string[] = []
  while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
    descLines.push(lines[i].trim())
    i++
  }

  return {
    title: title || '',
    description: descLines.join(' ').slice(0, 180)
  }
}

/**
 * Scan a directory for skills. Returns { skills, dir, dirLabel }.
 * dirLabel is used to identify the source in the UI.
 */
function scanDir(dir: string, dirLabel: string): { skills: SkillEntry[]; dirLabel: string } {
  const skills: SkillEntry[] = []
  if (!existsSync(dir)) return { skills, dirLabel }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const name = entry.name.slice(0, -3)
      const filePath = join(dir, entry.name)
      const content = readFileSync(filePath, 'utf-8')
      const { title, description } = extractMeta(content)
      const stat = statSync(filePath)
      skills.push({
        name,
        title: title || name,
        description,
        isFolder: false,
        filePath,
        updatedAt: stat.mtimeMs,
        source: dirLabel
      })
    } else if (entry.isDirectory()) {
      const candidates = ['SKILL.md', 'README.md']
      let mdPath: string | null = null
      for (const c of candidates) {
        const p = join(dir, entry.name, c)
        if (existsSync(p)) { mdPath = p; break }
      }
      if (!mdPath) continue
      const content = readFileSync(mdPath, 'utf-8')
      const { title, description } = extractMeta(content)
      const stat = statSync(mdPath)
      skills.push({
        name: entry.name,
        title: title || entry.name,
        description,
        isFolder: true,
        filePath: join(dir, entry.name),
        updatedAt: stat.mtimeMs,
        source: dirLabel
      })
    }
  }

  return { skills, dirLabel }
}

export function listSkills(): SkillEntry[] {
  const settings = new SettingsStore()
  const all: SkillEntry[] = []
  const seen = new Set<string>()

  // Global commands dir
  const globalDir = globalCommandsDir()
  const { skills: globalSkills } = scanDir(globalDir, 'global')
  for (const s of globalSkills) {
    all.push(s)
    seen.add(s.name)
  }

  // Extra skill directory
  const extraDir = settings.get().sharedSkillAddDir
  console.log('[Skills] sharedSkillAddDir from settings:', JSON.stringify(extraDir))
  if (extraDir) {
    // The extra dir itself is passed to claude --add-dir, but skills inside it
    // may be at root, or in .claude/commands/ or .claude/skills/ subdirs
    const possibleDirs = [
      join(extraDir, '.claude', 'commands'),
      join(extraDir, '.claude', 'skills'),
      extraDir
    ]
    console.log('[Skills] scanning possibleDirs:', possibleDirs)
    for (const dir of possibleDirs) {
      const exists = existsSync(dir)
      console.log('[Skills] scanning dir:', dir, 'exists:', exists)
      if (!exists) continue
      const { skills } = scanDir(dir, 'extra')
      console.log('[Skills] found', skills.length, 'skills in', dir)
      for (const s of skills) {
        if (!seen.has(s.name)) {
          all.push(s)
          seen.add(s.name)
        }
      }
    }
  }

  console.log('[Skills] total skills:', all.length, all.map(s => `${s.name}(${s.source})`))
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkillContent(name: string, source?: string): string {
  const globalDir = globalCommandsDir()
  const settings = new SettingsStore()
  const extraDir = settings.get().sharedSkillAddDir

  // Resolve target directories based on source
  const dirs: string[] = []
  if (source === 'extra' && extraDir) {
    dirs.push(join(extraDir, '.claude', 'commands'))
    dirs.push(join(extraDir, '.claude', 'skills'))
    dirs.push(extraDir)
  } else {
    // Default: check global first, then extra
    dirs.push(globalDir)
    if (extraDir) {
      dirs.push(join(extraDir, '.claude', 'commands'))
      dirs.push(join(extraDir, '.claude', 'skills'))
      dirs.push(extraDir)
    }
  }

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    // Folder skill takes precedence over flat file with same name
    const folderPath = join(dir, name)
    if (existsSync(folderPath)) {
      for (const candidate of ['SKILL.md', 'README.md']) {
        const p = join(folderPath, candidate)
        if (existsSync(p)) return readFileSync(p, 'utf-8')
      }
    }
    // Flat file
    const filePath = join(dir, `${name}.md`)
    if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
  }

  return ''
}

/**
 * Save a skill. If isFolder, writes to name/SKILL.md; otherwise name.md.
 */
export function saveSkill(name: string, content: string, isFolder: boolean): void {
  const dir = globalCommandsDir()
  mkdirSync(dir, { recursive: true })
  if (isFolder) {
    const folderPath = join(dir, name)
    mkdirSync(folderPath, { recursive: true })
    writeFileSync(join(folderPath, 'SKILL.md'), content, 'utf-8')
  } else {
    writeFileSync(join(dir, `${name}.md`), content, 'utf-8')
  }
}

export function deleteSkill(name: string, isFolder: boolean): void {
  const dir = globalCommandsDir()
  if (isFolder) {
    rmSync(join(dir, name), { recursive: true, force: true })
  } else {
    const p = join(dir, `${name}.md`)
    if (existsSync(p)) rmSync(p)
  }
}

export function openSkillsDir(): void {
  const dir = globalCommandsDir()
  mkdirSync(dir, { recursive: true })
  shell.openPath(dir)
}
