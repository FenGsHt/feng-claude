// [2026-06-12] 调试浏览器 routine 录制/回放。无 electron 运行时依赖（仅 import type），
// 所有浏览器/路径上下文经参数注入，便于独立验证。
// @ts-ignore - WebContents reserved for future replay step (inject via param)
import type { WebContents } from 'electron'
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface RoutineStep { type: string; [k: string]: unknown }
export interface Routine { name: string; description: string; createdAt: string; steps: RoutineStep[] }
export interface RoutineSummary { name: string; description: string; params: string[]; stepCount: number }
export interface RunResult { ok: boolean; variables: Record<string, unknown>; error?: string; failedStepIndex?: number }

const PARAM_RE = /\$\{([a-zA-Z0-9_]+)\}/g
const STRING_FIELDS = ['url', 'value', 'js', 'selector'] as const

export function routinesDir(workdir: string): string {
  return join(workdir, '.claude', 'browser-routines')
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

/** 扫描所有步骤字符串字段里的 ${name}，返回唯一、按首次出现排序的参数名列表。 */
export function extractParams(r: Routine): string[] {
  const seen: string[] = []
  for (const step of r.steps) {
    for (const f of STRING_FIELDS) {
      const v = step[f]
      if (typeof v !== 'string') continue
      let m: RegExpExecArray | null
      PARAM_RE.lastIndex = 0
      while ((m = PARAM_RE.exec(v)) !== null) {
        if (!seen.includes(m[1])) seen.push(m[1])
      }
    }
  }
  return seen
}

/** 把字符串里的 ${name} 替换成 params[name]；缺失替换为空串。 */
export function substituteParams(s: string, params: Record<string, unknown>): string {
  return s.replace(PARAM_RE, (_, k: string) => (params[k] !== undefined ? String(params[k]) : ''))
}

export function saveRoutine(workdir: string, r: Routine): string {
  const dir = routinesDir(workdir)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sanitizeName(r.name)}.json`)
  writeFileSync(path, JSON.stringify(r, null, 2), 'utf-8')
  return path
}

export function loadRoutine(workdir: string, name: string): Routine | null {
  try {
    const path = join(routinesDir(workdir), `${sanitizeName(name)}.json`)
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    if (data && Array.isArray(data.steps)) return data as Routine
    return null
  } catch { return null }
}

export function listRoutines(workdir: string): RoutineSummary[] {
  const dir = routinesDir(workdir)
  if (!existsSync(dir)) return []
  const out: RoutineSummary[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Routine
      if (!Array.isArray(r.steps)) continue
      out.push({ name: r.name, description: r.description || '', params: extractParams(r), stepCount: r.steps.length })
    } catch { /* skip corrupt */ }
  }
  return out
}

export function deleteRoutine(workdir: string, name: string): boolean {
  try {
    const path = join(routinesDir(workdir), `${sanitizeName(name)}.json`)
    if (!existsSync(path)) return false
    unlinkSync(path)
    return true
  } catch { return false }
}
