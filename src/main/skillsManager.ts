import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  readdirSync, rmSync, statSync
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { shell } from 'electron'
import type { SkillEntry } from '../renderer/src/types/ipc'

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

export function listSkills(): SkillEntry[] {
  const dir = globalCommandsDir()
  const skills: SkillEntry[] = []
  if (!existsSync(dir)) return skills

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      // Simple file skill
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
        updatedAt: stat.mtimeMs
      })
    } else if (entry.isDirectory()) {
      // Folder-based skill — look for SKILL.md or README.md
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
        updatedAt: stat.mtimeMs
      })
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkillContent(name: string): string {
  const dir = globalCommandsDir()
  // File skill
  const filePath = join(dir, `${name}.md`)
  if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
  // Folder skill
  for (const candidate of ['SKILL.md', 'README.md']) {
    const p = join(dir, name, candidate)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  return ''
}

export function saveSkill(name: string, content: string): void {
  const dir = globalCommandsDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.md`), content, 'utf-8')
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
