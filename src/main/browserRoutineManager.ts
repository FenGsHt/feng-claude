// [2026-06-12] 调试浏览器 routine 录制/回放。无 electron 运行时依赖（仅 import type），
// 所有浏览器/路径上下文经参数注入，便于独立验证。
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
    if (data && typeof data.name === 'string' && data.name && Array.isArray(data.steps)) return data as Routine
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
      if (!Array.isArray(r.steps) || typeof r.name !== 'string' || !r.name) continue
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

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** 对单个 step 的字符串字段做参数替换，返回新 step（不改原对象）。 */
export function resolveStep(step: RoutineStep, params: Record<string, unknown>): RoutineStep {
  const out: RoutineStep = { ...step }
  for (const f of STRING_FIELDS) {
    if (typeof out[f] === 'string') out[f] = substituteParams(out[f] as string, params)
  }
  return out
}

// 回放用的页面端 JS（与现有 /click /type /select /wait-for 端点保持一致）
function clickJs(selector: string): string {
  return `(function(){
    const el=document.querySelector(${JSON.stringify(selector)});
    if(!el)return false;
    el.scrollIntoView({block:'center',inline:'center'});
    const r=el.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const opts={bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy,button:0};
    try{el.dispatchEvent(new PointerEvent('pointerdown',opts));}catch(e){}
    el.dispatchEvent(new MouseEvent('mousedown',opts));
    try{el.dispatchEvent(new PointerEvent('pointerup',opts));}catch(e){}
    el.dispatchEvent(new MouseEvent('mouseup',opts));
    el.dispatchEvent(new MouseEvent('click',opts));
    if(typeof el.click==='function'){try{el.click();}catch(e){}}
    return true;
  })()`
}
function typeJs(selector: string, value: string): string {
  return `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(el){el.focus();el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;})()`
}
function selectJs(selector: string, value: string): string {
  return `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
}
function waitForJs(selector: string, timeout: number): string {
  return `new Promise((resolve)=>{const el=document.querySelector(${JSON.stringify(selector)});if(el){resolve(true);return}const ob=new MutationObserver(()=>{if(document.querySelector(${JSON.stringify(selector)})){ob.disconnect();resolve(true)}});ob.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{ob.disconnect();resolve(false)},${timeout})})`
}

/** 顺序回放一个 routine。任一步失败立即返回，已抓取的 variables 一并返回。 */
export async function runRoutine(
  wc: WebContents, workdir: string, name: string, params: Record<string, unknown>
): Promise<RunResult> {
  const routine = loadRoutine(workdir, name)
  if (!routine) return { ok: false, variables: {}, error: `Routine not found: ${name}` }
  const variables: Record<string, unknown> = {}
  for (let i = 0; i < routine.steps.length; i++) {
    const step = resolveStep(routine.steps[i], params)
    try {
      switch (step.type) {
        case 'navigate': {
          await wc.loadURL(String(step.url))
          break
        }
        case 'click': {
          const ok = await wc.executeJavaScript(clickJs(String(step.selector)))
          if (!ok) return { ok: false, variables, error: `click: element not found: ${step.selector}`, failedStepIndex: i }
          break
        }
        case 'type': {
          const ok = await wc.executeJavaScript(typeJs(String(step.selector), String(step.value ?? '')))
          if (!ok) return { ok: false, variables, error: `type: element not found: ${step.selector}`, failedStepIndex: i }
          break
        }
        case 'select': {
          const ok = await wc.executeJavaScript(selectJs(String(step.selector), String(step.value ?? '')))
          if (!ok) return { ok: false, variables, error: `select: element not found: ${step.selector}`, failedStepIndex: i }
          break
        }
        case 'sleep': {
          await delay(Math.min(30000, Math.max(0, Number(step.duration) || 0)))
          break
        }
        case 'wait_for': {
          const timeout = Math.min(30000, Math.max(100, Number(step.timeout) || 8000))
          const found = await wc.executeJavaScript(waitForJs(String(step.selector), timeout))
          if (!found) return { ok: false, variables, error: `wait_for timeout: ${step.selector}`, failedStepIndex: i }
          break
        }
        case 'evaluate': {
          const result = await wc.executeJavaScript(`(function(){${String(step.js)}})()`)
          if (typeof step.variable === 'string' && step.variable) variables[step.variable] = result
          break
        }
        default:
          return { ok: false, variables, error: `Unknown step type: ${step.type}`, failedStepIndex: i }
      }
    } catch (e) {
      return { ok: false, variables, error: `step ${i} (${step.type}) failed: ${String(e)}`, failedStepIndex: i }
    }
  }
  return { ok: true, variables }
}
