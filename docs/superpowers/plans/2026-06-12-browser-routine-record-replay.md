# 调试浏览器 Routine 录制/回放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把内嵌调试浏览器里的一串操作（导航/点击/输入/选择）录制成项目级 routine JSON，AI 或用户可直接回放，免去逐步 LLM 推理。

**Architecture:** 新增 Electron-free 的 `browserRoutineManager.ts`（数据模型 + 持久化 + 参数逻辑 + 回放引擎 + recorder 注入脚本，所有 Electron 依赖通过 `WebContents`/`workdir` 参数注入）。`browserViewManager.ts` 负责把它接到现有的 per-session tab 架构上：console-message 通道接收录制事件、did-navigate 重注入、session→workdir 注册表、HTTP 端点、导航栏录制按钮。`ptyManager.ts` 在建 session 时登记 workdir。`browser-mcp-server.js` 加 5 个工具。

**Tech Stack:** TypeScript + Electron (`WebContentsView`/`webContents.executeJavaScript`)、Node `fs`、现有 HTTP 控制服务器（`AsyncLocalStorage` 按 `X-Feng-Session` 头路由）、MCP stdio server。

**测试说明：** 本项目无测试框架（无 vitest/jest）。验证路径 = `npm run build`（electron-vite + tsc）+ 纯函数用独立 Node 脚本验证 + Electron 运行时部分用 `npm run dev` 手动冒烟。纯逻辑（参数提取/替换、持久化）设计为 Electron-free，可被 Node 脚本直接验证（TDD-lite）。

---

## File Structure

- **Create** `src/main/browserRoutineManager.ts` — routine 模型、持久化、参数提取/替换、录制状态机、recorder 注入脚本、回放引擎。无 `electron` import（除 `import type`）。
- **Create** `scripts/verify-routine-manager.mjs` — 纯函数验证脚本（构建产物上跑，或对源逻辑跑），阶段 A/B 用，验证后可删或保留。
- **Modify** `src/main/browserViewManager.ts` — session→workdir 注册表；createBrowserTab 内 console-message 过滤+录制事件接收、did-navigate 重注入；6 个 HTTP 端点；导航栏 ⏺ 按钮 + IPC。
- **Modify** `src/main/ptyManager.ts:665` — 建 session 时 `registerSessionWorkdir`。
- **Modify** `scripts/browser-mcp-server.js` — 5 个 MCP 工具（TOOLS 定义 + handleTool case）。

---

## STAGE A — 数据模型 + 持久化（地基）

### Task A1: 创建 browserRoutineManager.ts 的类型 + 纯函数 + 持久化

**Files:**
- Create: `src/main/browserRoutineManager.ts`
- Create: `scripts/verify-routine-manager.mjs`

- [ ] **Step 1: 写验证脚本（先失败）**

Create `scripts/verify-routine-manager.mjs`:

```js
// 纯函数验证（无 Electron 依赖）。运行：node scripts/verify-routine-manager.mjs
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as M from '../out/main/browserRoutineManagerStandalone.js'

let failures = 0
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++ } else { console.log('ok:', msg) } }

// extractParams
const r = { name: 'login', description: '', createdAt: '', steps: [
  { type: 'navigate', url: 'http://x/${env}/login' },
  { type: 'type', selector: '#u', value: '${username}' },
  { type: 'type', selector: '#p', value: '${password}' },
  { type: 'evaluate', js: 'return ${username}.length' }
]}
const params = M.extractParams(r)
assert(JSON.stringify(params) === JSON.stringify(['env','username','password']), 'extractParams unique ordered')

// substituteParams
assert(M.substituteParams('a${x}b${y}', { x: '1', y: '2' }) === 'a1b2', 'substituteParams replaces')
assert(M.substituteParams('a${x}', {}) === 'a', 'substituteParams missing -> empty')

// sanitizeName
assert(M.sanitizeName('a/b\\c .d') === 'a_b_c_.d', 'sanitizeName strips separators')

// persistence round-trip
const wd = mkdtempSync(join(tmpdir(), 'routine-'))
try {
  const path = M.saveRoutine(wd, r)
  assert(readFileSync(path, 'utf-8').includes('"login"'), 'saveRoutine writes file')
  const loaded = M.loadRoutine(wd, 'login')
  assert(loaded && loaded.steps.length === 4, 'loadRoutine reads back')
  const list = M.listRoutines(wd)
  assert(list.length === 1 && list[0].stepCount === 4 && list[0].params.length === 3, 'listRoutines summary')
  assert(M.deleteRoutine(wd, 'login') === true, 'deleteRoutine returns true')
  assert(M.loadRoutine(wd, 'login') === null, 'deleted gone')
  assert(M.deleteRoutine(wd, 'nope') === false, 'deleteRoutine missing -> false')
} finally { rmSync(wd, { recursive: true, force: true }) }

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: 创建 browserRoutineManager.ts（类型 + 纯函数 + 持久化）**

Create `src/main/browserRoutineManager.ts`:

```ts
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
```

- [ ] **Step 3: 为验证脚本产出 standalone 拷贝并运行**

验证脚本依赖编译产物。先 build，再把纯函数部分复制成一个无类型注解的 standalone（最简单：直接对 `.ts` 用 esbuild 转译到临时 mjs）。改用更简单的方式 —— 直接运行 tsc 单文件转译：

Run:
```bash
npx esbuild src/main/browserRoutineManager.ts --format=esm --platform=node --outfile=out/main/browserRoutineManagerStandalone.js && node scripts/verify-routine-manager.mjs
```
Expected: `ALL PASS`（若 esbuild 未装，用 `npx --yes esbuild@0.21.5 ...`）

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | grep browserRoutineManager`
Expected: 无 `browserRoutineManager.ts` 相关错误（已有 71 条 baseline 与 input-event/TS6307 无关错误可忽略）。

- [ ] **Step 5: Commit**

```bash
git add src/main/browserRoutineManager.ts scripts/verify-routine-manager.mjs
git commit -m "feat(browser-routine): routine model, params, persistence (stage A1)"
```

---

### Task A2: session→workdir 注册表（browserViewManager + ptyManager）

**Files:**
- Modify: `src/main/browserViewManager.ts`（globals 区 ~58；destroySessionBrowser ~1439；export 区）
- Modify: `src/main/ptyManager.ts:665`

- [ ] **Step 1: 在 browserViewManager 加注册表 + 导出函数**

在 `src/main/browserViewManager.ts` 的 `const sessionBrowsers = new Map...`（约行 58）之后插入：

```ts
// [2026-06-12] session → workdir 映射，供 routine HTTP 端点按请求 session 定位项目目录。
const sessionWorkdirs = new Map<string, string>()
export function registerSessionWorkdir(sessionId: string, workdir: string): void {
  if (sessionId && workdir) sessionWorkdirs.set(sessionId, workdir)
}
export function unregisterSessionWorkdir(sessionId: string): void {
  sessionWorkdirs.delete(sessionId)
}
/** 当前请求 session 的项目目录（routine 存取根）。 */
function currentWorkdir(): string | null {
  const sid = currentSessionId()
  return sid ? (sessionWorkdirs.get(sid) ?? null) : null
}
```

- [ ] **Step 2: destroySessionBrowser 时清理**

在 `destroySessionBrowser`（约行 1439）函数体末尾、`sessionBrowsers.delete(sessionId)` 之后加一行：

```ts
  unregisterSessionWorkdir(sessionId)
```

定位：
```ts
  sessionBrowsers.delete(sessionId)
  unregisterSessionWorkdir(sessionId)   // ← 新增
  if (foregroundSessionId === sessionId) {
```

- [ ] **Step 3: ptyManager 建 session 时登记 workdir**

在 `src/main/ptyManager.ts` 顶部 import 区加（与其他 `./browserViewManager` 无现有 import，则新增）：

```ts
import { registerSessionWorkdir } from './browserViewManager'
```

在 `createSession` 内、`const ptyEnv = { ...buildPtyEnv(...) }` 块之后（约行 665，daemon 分支 `if (shellOnly && ...)` 之前）插入：

```ts
    // [2026-06-12] 登记 session→workdir，供调试浏览器 routine 按项目存取
    registerSessionWorkdir(sessionId, workdir)
```

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`，无新报错。

- [ ] **Step 5: Commit**

```bash
git add src/main/browserViewManager.ts src/main/ptyManager.ts
git commit -m "feat(browser-routine): session->workdir registry (stage A2)"
```

---

### Task A3: HTTP /routine/list + /routine/delete 端点

**Files:**
- Modify: `src/main/browserViewManager.ts`（import 区；HTTP handler 区，紧跟 `/tabs/close` 块之后 ~1724）

- [ ] **Step 1: import routine manager**

在 `src/main/browserViewManager.ts` 顶部 import（`import { handleCloneRoute } from './cloneManager'` 之后）加：

```ts
import * as routineMgr from './browserRoutineManager'
```

- [ ] **Step 2: 加 HTTP 端点**

在 `/tabs/close` 处理块结束的 `}`（约行 1724）之后、`if (path === '/navigate' ...` 之前插入：

```ts
        // ── [2026-06-12] Routine 录制/回放（按请求 session 隔离，存项目目录）──
        if (path === '/routine/list' && req.method === 'GET') {
          const wd = currentWorkdir()
          if (!wd) { res.writeHead(200); res.end(JSON.stringify({ routines: [] })); return }
          res.writeHead(200); res.end(JSON.stringify({ routines: routineMgr.listRoutines(wd) }))
          return
        }
        if (path === '/routine/delete' && req.method === 'POST') {
          const body = await readBody(req)
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!wd || !name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing workdir or name' })); return }
          const ok = routineMgr.deleteRoutine(wd, name)
          res.writeHead(ok ? 200 : 404); res.end(JSON.stringify(ok ? { ok: true } : { error: 'Routine not found' }))
          return
        }
```

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 4: 手动验证（dev）**

Run（后台起 dev，另开终端 curl）：
```bash
# 在 app 内打开一个终端 session 并打开调试浏览器后，取其端口（默认 3100）
curl -s -H "X-Feng-Session: $(echo)" http://localhost:3100/routine/list
```
Expected: `{"routines":[]}`（无 session 头时回退前台 session 的 workdir；空目录返回空数组）。此步可在 Stage D 完成后连同 UI 一起冒烟，先以 build 通过为准。

- [ ] **Step 5: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): HTTP list/delete endpoints (stage A3)"
```

---

### Task A4: MCP browser_routine_list + browser_routine_delete

**Files:**
- Modify: `scripts/browser-mcp-server.js`（TOOLS 数组末尾 ~450；handleTool switch ~767 default 之前）

- [ ] **Step 1: 加 TOOLS 定义**

在 `scripts/browser-mcp-server.js` 的 `TOOLS` 数组最后一个元素（`browser_tab_close`，约行 449-450）的 `}` 之后、数组闭合 `]` 之前插入：

```js
  ,
  {
    name: 'browser_routine_list',
    description: 'List recorded browser routines for THIS terminal session\'s project (stored in {workdir}/.claude/browser-routines). Returns each routine\'s name, description, params (template ${var} placeholders to pass to browser_routine_run), and step count. Routines automate repeated UI sequences (login, close dialogs, navigation) without per-step LLM reasoning.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_routine_delete',
    description: 'Delete a recorded routine by name from this project.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Routine name' } },
      required: ['name']
    }
  }
```

- [ ] **Step 2: 加 handleTool case**

在 `handleTool` switch 的 `default:`（约行 767）之前插入：

```js
      case 'browser_routine_list': {
        const r = await callHttp('/routine/list')
        const rs = r.routines || []
        if (!rs.length) return [{ type: 'text', text: 'No routines recorded for this project.' }]
        const lines = rs.map(x => `- ${x.name}  (${x.stepCount} steps)${x.params.length ? `  params: ${x.params.join(', ')}` : ''}${x.description ? `\n    ${x.description}` : ''}`)
        return [{ type: 'text', text: `Routines (${rs.length}):\n${lines.join('\n')}` }]
      }
      case 'browser_routine_delete': {
        const r = await callHttp('/routine/delete', { name: args.name })
        return [{ type: 'text', text: r.ok ? `Deleted routine ${args.name}` : `Failed: ${r.error}` }]
      }
```

- [ ] **Step 3: 语法检查**

Run: `node --check scripts/browser-mcp-server.js`
Expected: 无输出（语法 OK）。

- [ ] **Step 4: Commit**

```bash
git add scripts/browser-mcp-server.js
git commit -m "feat(browser-routine): MCP list/delete tools (stage A4)"
```

---

## STAGE B — 回放引擎

### Task B1: runRoutine（7 种动作 + 参数替换 + 返回结构）

**Files:**
- Modify: `src/main/browserRoutineManager.ts`（文件末尾追加）
- Modify: `scripts/verify-routine-manager.mjs`（追加 substitute-step 验证）

- [ ] **Step 1: 追加 runRoutine 实现**

在 `src/main/browserRoutineManager.ts` 末尾追加：

```ts
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
```

- [ ] **Step 2: 追加纯函数验证（resolveStep）**

在 `scripts/verify-routine-manager.mjs` 的 `console.log(failures === 0 ...)` 之前插入：

```js
// resolveStep
const rs1 = M.resolveStep({ type: 'type', selector: '#u', value: '${username}' }, { username: 'admin' })
assert(rs1.value === 'admin' && rs1.selector === '#u', 'resolveStep substitutes value')
const rs2 = M.resolveStep({ type: 'navigate', url: 'http://x/${env}' }, {})
assert(rs2.url === 'http://x/', 'resolveStep missing param -> empty')
```

- [ ] **Step 3: 重新转译并运行验证**

Run:
```bash
npx esbuild src/main/browserRoutineManager.ts --format=esm --platform=node --outfile=out/main/browserRoutineManagerStandalone.js && node scripts/verify-routine-manager.mjs
```
Expected: `ALL PASS`

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 5: Commit**

```bash
git add src/main/browserRoutineManager.ts scripts/verify-routine-manager.mjs
git commit -m "feat(browser-routine): replay engine runRoutine (stage B1)"
```

---

### Task B2: HTTP /routine/run 端点

**Files:**
- Modify: `src/main/browserViewManager.ts`（紧跟 Task A3 的 `/routine/delete` 块之后）

- [ ] **Step 1: 加端点**

在 `/routine/delete` 处理块之后插入：

```ts
        if (path === '/routine/run' && req.method === 'POST') {
          const body = await readBody(req)
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!wd || !name) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Missing workdir or name' })); return }
          ensureBrowserVisible()
          const wc = getBrowserViewWebContents()
          if (!wc) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Browser not open' })); return }
          const params = (body?.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {}
          const result = await routineMgr.runRoutine(wc, wd, name, params)
          res.writeHead(result.ok ? 200 : 500); res.end(JSON.stringify(result))
          return
        }
```

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 3: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): HTTP run endpoint (stage B2)"
```

---

### Task B3: MCP browser_routine_run

**Files:**
- Modify: `scripts/browser-mcp-server.js`（TOOLS 区；handleTool 区）

- [ ] **Step 1: 加 TOOLS 定义**

在 Task A4 加的 `browser_routine_delete` 定义之后插入：

```js
  ,
  {
    name: 'browser_routine_run',
    description: 'Replay a recorded routine in this session\'s active debug-browser tab. Executes the saved steps (navigate/click/type/select/sleep/wait_for/evaluate) without per-step reasoning. Pass params for any ${var} placeholders (e.g. {"username":"admin","password":"x"}). Returns ok, any variables captured by evaluate steps, and on failure the error + failedStepIndex.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Routine name (from browser_routine_list)' },
        params: { type: 'object', description: 'Values for ${var} placeholders (optional)' }
      },
      required: ['name']
    }
  }
```

- [ ] **Step 2: 加 handleTool case**

在 `browser_routine_delete` case 之后插入：

```js
      case 'browser_routine_run': {
        const r = await callHttp('/routine/run', { name: args.name, params: args.params || {} })
        if (r.ok) {
          const vars = r.variables && Object.keys(r.variables).length
            ? `\nVariables: ${JSON.stringify(r.variables)}` : ''
          return [{ type: 'text', text: `Routine "${args.name}" completed.${vars}` }]
        }
        const at = r.failedStepIndex !== undefined ? ` (step ${r.failedStepIndex})` : ''
        return [{ type: 'text', text: `Routine failed${at}: ${r.error}` }]
      }
```

- [ ] **Step 3: 语法检查**

Run: `node --check scripts/browser-mcp-server.js`
Expected: 无输出。

- [ ] **Step 4: Commit**

```bash
git add scripts/browser-mcp-server.js
git commit -m "feat(browser-routine): MCP run tool (stage B3)"
```

---

### Task B4: 手写 JSON 验证回放（手动冒烟）

**Files:** 无代码改动（手动验证）。

- [ ] **Step 1: 起 dev**

Run: `npm run dev`（后台）。在 app 内开一个终端 session（注意其 workdir），打开调试浏览器导航到任意可控页面（如 `https://example.com`）。

- [ ] **Step 2: 手写一个 routine 文件**

在该 session 的 `{workdir}/.claude/browser-routines/demo.json` 写入：

```json
{
  "name": "demo",
  "description": "navigate then read title",
  "createdAt": "2026-06-12T00:00:00.000Z",
  "steps": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "wait_for", "selector": "h1", "timeout": 5000 },
    { "type": "evaluate", "js": "return document.querySelector('h1').textContent", "variable": "heading" }
  ]
}
```

- [ ] **Step 2.5: 让 routine 端口知道 session**

确认浏览器打开后端口为 3100（`browser_get_url` 之类已可用即说明）。

- [ ] **Step 3: 调 run 端点验证**

在 app 该 session 的 Claude 里执行 `browser_routine_run({name:"demo"})`，或直接 curl（带该 session 的 `X-Feng-Session`，从 app 日志或前台 session 回退）：
```bash
curl -s -X POST http://localhost:3100/routine/run -H "Content-Type: application/json" -d '{"name":"demo"}'
```
Expected: `{"ok":true,"variables":{"heading":"Example Domain"}}`

- [ ] **Step 4: 验证失败步报告**

把 `wait_for` 的 selector 改成 `#nope`，再 run。
Expected: `{"ok":false,...,"failedStepIndex":1,"error":"wait_for timeout: #nope"}`

- [ ] **Step 5: 记录结果（无需 commit）**

确认通过后删除 demo.json。回放引擎验证完成。

---

## STAGE C — 录制

### Task C1: 录制状态机 + recorder 脚本（browserRoutineManager）

**Files:**
- Modify: `src/main/browserRoutineManager.ts`（文件末尾追加）

- [ ] **Step 1: 追加录制状态 + API + recorder 脚本**

在 `src/main/browserRoutineManager.ts` 末尾追加：

```ts
// ── 录制状态机（per session）─────────────────────────────────────────────
export const WING_EVT_PREFIX = '__WING_EVT__'
const AUTO_SLEEP_MIN = 800
const AUTO_SLEEP_MAX = 8000

interface Recording { steps: RoutineStep[]; lastActionAt: number }
const recordings = new Map<string, Recording>()

export function isRecording(sessionId: string): boolean {
  return recordings.has(sessionId)
}
export function recordingStepCount(sessionId: string): number {
  return recordings.get(sessionId)?.steps.length ?? 0
}

/** 开始录制；initialUrl 若提供则作为首个 navigate 步，使回放可从当前页复现。 */
export function startRecording(sessionId: string, initialUrl?: string): void {
  const steps: RoutineStep[] = []
  if (initialUrl && /^https?:/.test(initialUrl)) steps.push({ type: 'navigate', url: initialUrl })
  recordings.set(sessionId, { steps, lastActionAt: 0 })
}

function maybeInsertSleep(rec: Recording): void {
  const now = Date.now()
  if (rec.steps.length > 0 && rec.lastActionAt > 0) {
    const gap = now - rec.lastActionAt
    if (gap >= AUTO_SLEEP_MIN) rec.steps.push({ type: 'sleep', duration: Math.min(gap, AUTO_SLEEP_MAX) })
  }
  rec.lastActionAt = now
}

/** 接收来自页面 recorder 的事件。 */
export function recordEvent(sessionId: string, evt: { kind: string; selector?: string; value?: string }): void {
  const rec = recordings.get(sessionId)
  if (!rec || !evt || !evt.selector) return
  maybeInsertSleep(rec)
  if (evt.kind === 'click') rec.steps.push({ type: 'click', selector: evt.selector })
  else if (evt.kind === 'type') rec.steps.push({ type: 'type', selector: evt.selector, value: evt.value ?? '' })
  else if (evt.kind === 'select') rec.steps.push({ type: 'select', selector: evt.selector, value: evt.value ?? '' })
}

/** 记录一次导航（由主进程 did-navigate 调用）。 */
export function recordNavigate(sessionId: string, url: string): void {
  const rec = recordings.get(sessionId)
  if (!rec || !/^https?:/.test(url)) return
  // 去重：与最近一步 navigate 相同则跳过（loadURL + did-navigate 可能重复）
  const last = rec.steps[rec.steps.length - 1]
  if (last && last.type === 'navigate' && last.url === url) return
  maybeInsertSleep(rec)
  rec.steps.push({ type: 'navigate', url })
}

/** 停止并存盘。返回 null 表示当前无录制。 */
export function stopRecording(sessionId: string, workdir: string, name: string): { path: string; stepCount: number } | null {
  const rec = recordings.get(sessionId)
  if (!rec) return null
  recordings.delete(sessionId)
  const routine: Routine = {
    name: sanitizeName(name),
    description: '',
    createdAt: new Date().toISOString(),
    steps: rec.steps
  }
  const path = saveRoutine(workdir, routine)
  return { path, stepCount: rec.steps.length }
}

/** 取消录制（不存盘）。 */
export function cancelRecording(sessionId: string): void {
  recordings.delete(sessionId)
}

/** 注入到被录制页面的脚本：捕获 click/change/select，经 console.log 上报。
 *  幂等（window.__wingRec 守卫），导航后需重新注入。 */
export const RECORDER_JS = `(function(){
  if (window.__wingRec) return;
  window.__wingRec = true;
  function getSelector(el){
    const parts=[];let cur=el;
    while(cur && cur!==document.documentElement && cur.tagName){
      let part=cur.tagName.toLowerCase();
      if(cur.id){part+='#'+CSS.escape(cur.id);parts.unshift(part);break;}
      const sib=cur.parentNode?Array.from(cur.parentNode.children).filter(c=>c.tagName===cur.tagName):[];
      if(sib.length>1){const idx=Array.from(cur.parentNode.children).indexOf(cur)+1;part+=':nth-child('+idx+')';}
      parts.unshift(part);cur=cur.parentElement;
    }
    return parts.join(' > ');
  }
  function report(evt){try{console.log('${WING_EVT_PREFIX}'+JSON.stringify(evt));}catch(e){}}
  document.addEventListener('click',function(e){
    const el=e.target.closest('a,button,input[type=button],input[type=submit],[role=button],[onclick]')||e.target;
    if(!el||!el.tagName)return;
    report({kind:'click',selector:getSelector(el)});
  },true);
  document.addEventListener('change',function(e){
    const el=e.target;if(!el||!el.tagName)return;
    const tag=el.tagName.toLowerCase();
    if(tag==='select'){report({kind:'select',selector:getSelector(el),value:el.value});}
    else if(tag==='input'||tag==='textarea'){report({kind:'type',selector:getSelector(el),value:el.value});}
  },true);
})()`
```

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 3: Commit**

```bash
git add src/main/browserRoutineManager.ts
git commit -m "feat(browser-routine): recording state machine + recorder script (stage C1)"
```

---

### Task C2: 接入 console-message 接收 + did-navigate 重注入

**Files:**
- Modify: `src/main/browserViewManager.ts`（createBrowserTab：console-message ~667；did-navigate ~630）

- [ ] **Step 1: console-message 过滤 + 转录制事件**

把 `createBrowserTab` 内 `view.webContents.on('console-message', ...)`（约行 667-676）整体替换为：

```ts
  view.webContents.on('console-message', (_event: Electron.Event, level: number, message: string, _line: number, _sourceId: string) => {
    // [2026-06-12] 录制事件通道：带前缀的日志转给 routine 录制器，且不进 console buffer（不污染 /console）
    if (message.startsWith(routineMgr.WING_EVT_PREFIX)) {
      if (routineMgr.isRecording(sid)) {
        try { routineMgr.recordEvent(sid, JSON.parse(message.slice(routineMgr.WING_EVT_PREFIX.length))) } catch { /* ignore */ }
      }
      return
    }
    const entry: ConsoleLogEntry = { level: levelToString(level), text: message, timestamp: new Date().toISOString() }
    tab.consoleLogs.push(entry)
    if (tab.consoleLogs.length > CONSOLE_BUFFER_MAX) tab.consoleLogs.shift()
    // 前台 active tab 同步写入全局 buffer（兼容 /console 端点）
    if (isForegroundActive()) {
      consoleLogs.push(entry)
      if (consoleLogs.length > CONSOLE_BUFFER_MAX) consoleLogs.shift()
    }
  })
```

- [ ] **Step 2: did-navigate 记录 + 重注入 recorder**

把 `createBrowserTab` 内 `view.webContents.on('did-navigate', ...)`（约行 630-633）替换为：

```ts
  view.webContents.on('did-navigate', (_, navUrl) => {
    if (isForegroundActive()) { updateNavUrl(navUrl); updateNavBackForward(); saveLastBrowserUrl(navUrl) }
    addToHistory(navUrl, tab.title)
    // [2026-06-12] 录制中：记录导航并在新页面重注入 recorder（导航清空了注入脚本）
    if (routineMgr.isRecording(sid)) {
      routineMgr.recordNavigate(sid, navUrl)
      view.webContents.executeJavaScript(routineMgr.RECORDER_JS).catch(() => {})
    }
  })
```

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 4: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): console-message ingest + did-navigate reinject (stage C2)"
```

---

### Task C3: HTTP /routine/record/start + /routine/record/stop + 注入 helper

**Files:**
- Modify: `src/main/browserViewManager.ts`（helper 函数区，靠近 ensureBrowserVisible ~754；HTTP 端点区，紧跟 `/routine/run` 之后）

- [ ] **Step 1: 加注入 helper**

在 `ensureBrowserVisible` 函数（约行 754）之前插入：

```ts
/** [2026-06-12] 向某 session 的 active tab 注入 recorder 脚本。 */
function injectRecorder(sid: string): void {
  const wc = getActiveTab(sid)?.view.webContents
  if (wc) wc.executeJavaScript(routineMgr.RECORDER_JS).catch(() => {})
}
```

- [ ] **Step 2: 加 HTTP 端点**

在 `/routine/run` 处理块之后插入：

```ts
        if (path === '/routine/record/start' && req.method === 'POST') {
          ensureBrowserVisible()
          const sid = currentSessionId()
          if (!sid) { res.writeHead(400); res.end(JSON.stringify({ error: 'No session' })); return }
          const wc = getActiveTab(sid)?.view.webContents
          routineMgr.startRecording(sid, wc?.getURL())
          injectRecorder(sid)
          res.writeHead(200); res.end(JSON.stringify({ ok: true }))
          return
        }
        if (path === '/routine/record/stop' && req.method === 'POST') {
          const body = await readBody(req)
          const sid = currentSessionId()
          const wd = currentWorkdir()
          const name = (body?.name as string) ?? ''
          if (!sid || !wd || !name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing session/workdir/name' })); return }
          const result = routineMgr.stopRecording(sid, wd, name)
          if (!result) { res.writeHead(400); res.end(JSON.stringify({ error: 'Not recording' })); return }
          res.writeHead(200); res.end(JSON.stringify({ ok: true, ...result }))
          return
        }
```

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 4: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): HTTP record start/stop + recorder inject (stage C3)"
```

---

### Task C4: MCP browser_routine_record_start + record_stop

**Files:**
- Modify: `scripts/browser-mcp-server.js`（TOOLS 区；handleTool 区）

- [ ] **Step 1: 加 TOOLS 定义**

在 `browser_routine_run` 定义之后插入：

```js
  ,
  {
    name: 'browser_routine_record_start',
    description: 'Start recording browser actions in this session\'s active tab. Clicks, input/select changes, and navigations are captured. The current page URL is recorded as the first step. Call browser_routine_record_stop with a name to save. Recorded values are stored in plaintext; edit the JSON to replace secrets with ${var} placeholders.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_routine_record_stop',
    description: 'Stop recording and save the captured steps as a routine in {workdir}/.claude/browser-routines/<name>.json.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Routine name to save as' } },
      required: ['name']
    }
  }
```

- [ ] **Step 2: 加 handleTool case**

在 `browser_routine_run` case 之后插入：

```js
      case 'browser_routine_record_start': {
        const r = await callHttp('/routine/record/start', {})
        return [{ type: 'text', text: r.ok ? 'Recording started. Perform actions in the browser, then call browser_routine_record_stop.' : `Failed: ${r.error}` }]
      }
      case 'browser_routine_record_stop': {
        const r = await callHttp('/routine/record/stop', { name: args.name })
        return [{ type: 'text', text: r.ok ? `Saved routine "${args.name}" (${r.stepCount} steps) → ${r.path}` : `Failed: ${r.error}` }]
      }
```

- [ ] **Step 3: 语法检查**

Run: `node --check scripts/browser-mcp-server.js`
Expected: 无输出。

- [ ] **Step 4: Commit**

```bash
git add scripts/browser-mcp-server.js
git commit -m "feat(browser-routine): MCP record start/stop tools (stage C4)"
```

---

### Task C5: 录制端到端手动验证

**Files:** 无代码改动（手动验证）。

- [ ] **Step 1: 起 dev，录制**

Run: `npm run dev`。开终端 session，打开调试浏览器导航到一个有输入框+按钮的本地页面（或 example.com 的搜索框场景）。在该 session 的 Claude 执行 `browser_routine_record_start()`。

- [ ] **Step 2: 操作**

在浏览器里：点一个链接（触发导航）、在输入框输入文字（触发 change）、点一个按钮。

- [ ] **Step 3: 停止并检查文件**

执行 `browser_routine_record_stop({name:"smoke"})`。
检查 `{workdir}/.claude/browser-routines/smoke.json`：
Expected: 含首个 `navigate`（起始 URL）、`type`（输入框，明文值）、`click`（按钮），导航触发的 `navigate`，间隔 >800ms 处有 `sleep`。

- [ ] **Step 4: 验证 /console 无噪声**

执行 `browser_console()`。
Expected: 输出不含 `__WING_EVT__` 字样。

- [ ] **Step 5: 回放**

执行 `browser_routine_run({name:"smoke"})`。
Expected: 浏览器重现操作序列，返回 `Routine "smoke" completed.`。确认后删除 smoke.json。

---

## STAGE D — 导航栏录制按钮 UI

### Task D1: 导航栏 ⏺ 按钮（HTML/CSS/JS）

**Files:**
- Modify: `src/main/browserViewManager.ts`（NAVBAR_HTML：control-row 按钮 ~349；脚本区 IPC handlers）

- [ ] **Step 1: 加按钮到 control-row**

在 `NAVBAR_HTML` 的 control-row 里，`<button id="history-btn" ...>` 之前插入：

```html
    <button id="record-btn" title="录制操作（routine）">⏺</button>
```

- [ ] **Step 2: 加录制态 CSS**

在 `NAVBAR_HTML` 的 `<style>` 内 `button.active { color: #f59e0b; border-color: #f59e0b; }` 之后插入：

```css
#record-btn.recording { color: #ef4444; border-color: #ef4444; }
```

- [ ] **Step 3: 加按钮 JS（录制开关 + 命名）**

在 `NAVBAR_HTML` 的 `<script>` 里，`$('history-btn').addEventListener(...)` 相关块之后（任意 handler 注册区）插入：

```js
  let recording = false
  $('record-btn').addEventListener('click', () => {
    if (!recording) {
      ipcRenderer.send('browser-nav:record-start')
    } else {
      const name = window.prompt('保存 routine 名称：', '')
      if (name && name.trim()) ipcRenderer.send('browser-nav:record-stop', name.trim())
      else ipcRenderer.send('browser-nav:record-cancel')
    }
  })
  ipcRenderer.on('browser-nav:recording', (_, d) => {
    recording = !!d.active
    const btn = $('record-btn')
    btn.classList.toggle('recording', recording)
    btn.textContent = recording ? ('⏹ ' + (d.count || 0)) : '⏺'
    btn.title = recording ? '停止并保存（已录 ' + (d.count||0) + ' 步）' : '录制操作（routine）'
  })
```

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 5: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): navbar record button UI (stage D1)"
```

---

### Task D2: 录制按钮的 IPC handlers + 录制态推送

**Files:**
- Modify: `src/main/browserViewManager.ts`（registerBrowserViewIpc ~1505；录制态推送 helper）

- [ ] **Step 1: 加录制态推送 helper**

在 `injectRecorder` 函数（Task C3 加的）之后插入：

```ts
/** [2026-06-12] 把前台 session 录制态推给导航栏（按钮红点 + 步数）。 */
function pushRecordingState(sid: string): void {
  if (!state.navView?.webContents) return
  state.navView.webContents.send('browser-nav:recording', {
    active: routineMgr.isRecording(sid),
    count: routineMgr.recordingStepCount(sid)
  })
}
```

- [ ] **Step 2: 录制事件接收后刷新步数（C2 增量）**

把 Task C2 的 console-message 录制分支里 `recordEvent` 那行扩展为同时推送步数。将：

```ts
        try { routineMgr.recordEvent(sid, JSON.parse(message.slice(routineMgr.WING_EVT_PREFIX.length))) } catch { /* ignore */ }
```

替换为：

```ts
        try {
          routineMgr.recordEvent(sid, JSON.parse(message.slice(routineMgr.WING_EVT_PREFIX.length)))
          if (sid === foregroundSessionId) pushRecordingState(sid)
        } catch { /* ignore */ }
```

并在 Task C2 的 did-navigate 录制分支 `routineMgr.recordNavigate(sid, navUrl)` 之后加：

```ts
      if (sid === foregroundSessionId) pushRecordingState(sid)
```

- [ ] **Step 3: 加 IPC handlers**

在 `registerBrowserViewIpc` 内、`browser-nav:action` 的 `ipcMain.on(...)` 块（约行 1505）之后插入：

```ts
  ipcMain.on('browser-nav:record-start', () => {
    if (!foregroundSessionId) return
    const wc = getActiveTab(foregroundSessionId)?.view.webContents
    routineMgr.startRecording(foregroundSessionId, wc?.getURL())
    injectRecorder(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
  })
  ipcMain.on('browser-nav:record-stop', (_event, name: string) => {
    if (!foregroundSessionId) return
    const wd = sessionWorkdirs.get(foregroundSessionId)
    if (wd && name) routineMgr.stopRecording(foregroundSessionId, wd, name)
    else routineMgr.cancelRecording(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
  })
  ipcMain.on('browser-nav:record-cancel', () => {
    if (!foregroundSessionId) return
    routineMgr.cancelRecording(foregroundSessionId)
    pushRecordingState(foregroundSessionId)
  })
```

- [ ] **Step 4: 切前台 session 时同步录制态**

在 `setForegroundSession` 函数末尾（`notifyBrowserState()` 之后，约行 1435）加：

```ts
  pushRecordingState(sessionId)
```

- [ ] **Step 5: Build**

Run: `npm run build 2>&1 | tail -3`
Expected: `✓ built`。

- [ ] **Step 6: Commit**

```bash
git add src/main/browserViewManager.ts
git commit -m "feat(browser-routine): record button IPC + recording state push (stage D2)"
```

---

### Task D3: UI 端到端手动验证

**Files:** 无代码改动（手动验证）。

- [ ] **Step 1: 起 dev，点 ⏺**

Run: `npm run dev`。打开调试浏览器，点导航栏 ⏺ 按钮。
Expected: 按钮变红，文字变 `⏹ 0`。

- [ ] **Step 2: 操作并看计数**

在页面点按钮、输入文字、导航。
Expected: ⏹ 后的步数随操作递增。

- [ ] **Step 3: 停止命名**

再点按钮，弹出命名框，输入 `ui-smoke` 确定。
Expected: 按钮恢复 ⏺；`{workdir}/.claude/browser-routines/ui-smoke.json` 生成，步骤正确。

- [ ] **Step 4: 多 tab/session 隔离**

开第二个终端 session，切到它（前台切换）。
Expected: 录制按钮回到非录制态（第二 session 未在录制）；切回第一 session 若仍在录制则恢复红点（若已 stop 则为 ⏺）。

- [ ] **Step 5: 回放确认**

第一 session 里 `browser_routine_run({name:"ui-smoke"})`，确认重现。删除 ui-smoke.json。

---

## Self-Review

**Spec coverage（逐节核对）：**
- 7 种动作类型 → Task B1 runRoutine 全覆盖；录制捕获 navigate/click/type/select（C1 RECORDER_JS + recordEvent + recordNavigate），sleep 自动插入（C1 maybeInsertSleep），wait_for/evaluate 手动编辑 + 回放支持（B1）。✓
- params 计算字段（扫 ${var}） → A1 extractParams（不存储，list/run 时算）。✓
- run 返回 {ok,variables,error,failedStepIndex} → B1 RunResult。✓
- 项目级存储 {workdir}/.claude/browser-routines → A1 routinesDir + A2 session→workdir 注册表。✓
- console.log 通道 + 前缀过滤不污染 /console → C2 console-message 分支。✓
- did-navigate 重注入 → C2。✓
- 5 个 MCP 工具 → A4(list/delete) + B3(run) + C4(record start/stop)。✓
- 导航栏 ⏺ 按钮 + 录制态 → D1 + D2。✓
- HTTP 端点 list/delete/run/record start/stop → A3 + B2 + C3。✓
- session→workdir 注册（ptyManager） → A2。✓
- 明文录制 → C1 recordEvent 存原始 value。✓

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码；每个命令步骤含 Expected。✓

**Type consistency：** `Routine`/`RoutineStep`/`RoutineSummary`/`RunResult` 在 A1 定义，B1/C1 沿用；`routineMgr.*` 调用名（listRoutines/deleteRoutine/runRoutine/startRecording/stopRecording/cancelRecording/recordEvent/recordNavigate/isRecording/recordingStepCount/RECORDER_JS/WING_EVT_PREFIX）在 A1/B1/C1 定义、A3/B2/C3/C2/D2 引用一致。`registerSessionWorkdir`/`unregisterSessionWorkdir` A2 定义、ptyManager 引用一致。IPC 名 `browser-nav:record-start/stop/cancel`、`browser-nav:recording` D1/D2 两端一致。✓

**已知非阻塞项：** Task A1 验证脚本依赖 esbuild 转译一个 standalone 产物（绕过 Electron import type）；若环境无 esbuild，`npx --yes esbuild` 临时拉取。Electron 运行时部分（录制/回放/UI）以 build 通过 + 手动冒烟为准，符合本项目无测试框架的现实。
