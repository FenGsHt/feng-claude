# 调试浏览器 Routine 录制/回放（BrowserWing 式自动化）

日期：2026-06-12
状态：已批准，待写实现计划

## 背景与目标

内嵌调试浏览器主要用于克隆网站时的调试。克隆 / 调试过程中存在大量**重复的浏览器操作**：登录后台、关闭弹窗、切换页面、填表单。当前每次都要 AI 通过 LLM 推理逐步决定下一个动作 —— 慢且费 token。

借鉴 [BrowserWing](https://github.com/browserwing/browserwing) 的思路：把一串浏览器操作**录制一次**，存成固定的 routine（命令），之后 AI 直接调用 `browser_routine_run(name)` 即可重放，无需逐步推理。

### 确认的范围决策

- **项目级存储**：routine 存在 `{workdir}/.claude/browser-routines/<name>.json`，跟着项目走，可纳入 git。
- **明文录制**：录制时输入什么存什么（含密码）。要参数化时手动改 JSON 为 `${var}`。
- **纯手动触发**：AI 自己决定何时调 `browser_routine_run`；不与 clone 流程自动耦合。
- **采纳 BrowserWing 的**：`sleep` 动作、`evaluate` 抓数据、`list` 返回富信息、`${var}` 参数替换。
- **补充项**：`wait_for` 动作、run 返回抓取数据 + 失败步、`routine_delete` 工具。

## 现有架构关键点（已读证实）

- `src/main/browserViewManager.ts`
  - 每个终端 session 一组隔离的 tab（`SessionBrowser{ tabs[], activeTabId }`），`foregroundSessionId` 标记前台。
  - HTTP 控制服务器：`X-Feng-Session` 头经 `AsyncLocalStorage`(`requestSessionStore`) 携带，`currentSessionId()` 解析请求归属 session。
  - 每个 tab view 已有 `console-message` 监听器（写入 `tab.consoleLogs` + 前台同步全局 `consoleLogs`）。
  - 已有 `did-navigate` / `did-navigate-in-page` / `dom-ready`(未用) 事件可挂钩。
  - 元素拾取器 `PICKER_JS` 内含成熟的 `getSelector(el)`（生成唯一 CSS selector，遇 id 截断、否则 `:nth-child`）—— 录制 click/type 复用此逻辑。
  - 导航栏 `NAVBAR_HTML` 控制行已有按钮模式（pick/devtools/close）+ IPC（`browser-nav:action`）。
  - `getBrowserViewWebContents()` / `targetWebContents()` 是按 session 路由的统一出口。
- `src/main/ptyManager.ts`
  - `PtySession { id, workdir, ... }`，`buildPtyEnv` 已注入 `FENG_CLAUDE_SESSION_ID`。session 创建在 `createSession`（约行 606+）。
- `scripts/browser-mcp-server.js`
  - `callHttp(path, body)` 是唯一 HTTP 注入点，已带 `X-Feng-Session` 头。
  - `TOOLS[]` + `handleTool` switch；已有 `browser_tab_*` 系列工具的成例可仿。

## 数据模型

### Routine JSON（`{workdir}/.claude/browser-routines/<name>.json`）

```json
{
  "name": "login",
  "description": "登录后台",
  "createdAt": "2026-06-12T08:00:00.000Z",
  "steps": [
    { "type": "navigate", "url": "http://localhost:4755/login" },
    { "type": "wait_for", "selector": "#user", "timeout": 5000 },
    { "type": "type", "selector": "#user", "value": "${username}" },
    { "type": "type", "selector": "#pass", "value": "${password}" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "sleep", "duration": 1500 },
    { "type": "evaluate", "js": "return document.querySelector('.welcome').textContent", "variable": "greeting" }
  ]
}
```

`description` 录制时取首个 navigate 的标题/URL 作默认，可手动改。

### 动作类型（7 种）

| type | 字段 | 录制来源 | 回放语义 |
|---|---|---|---|
| `navigate` | `url` | 主进程 `did-navigate` | `wc.loadURL(url)` + 等 `did-finish-load` |
| `click` | `selector` | recorder 脚本 | 派发真实 mouse 事件序列到元素 |
| `type` | `selector`, `value` | recorder 脚本 | 聚焦 + 设 value + 派发 `input`/`change` |
| `select` | `selector`, `value` | recorder 脚本 | 设 `<select>` value + 派发 `change` |
| `sleep` | `duration`(ms) | 录制时两步间隔 >800ms 自动插入（上限 8000） | `await delay(duration)` |
| `wait_for` | `selector`, `timeout`(默认 8000) | 手动编辑 | 轮询直到 `querySelector` 命中或超时 |
| `evaluate` | `js`, `variable`(可选) | 手动编辑 | 在页面执行 JS，结果存入命名变量 |

### params（计算字段，不存储）

routine 文件**不**存 params。在 load / list / run 时扫描所有步骤的字符串字段（`url` / `value` / `js`），用正则 `/\$\{([a-zA-Z0-9_]+)\}/g` 提取唯一 token 集合作为 params 列表。改 JSON 即时生效，零维护。

## 组件设计

### 1. `src/main/browserRoutineManager.ts`（新文件）

单一职责：routine 的录制状态机 + 持久化 + 回放执行。不直接碰 HTTP/IPC（由 browserViewManager 调用）。

```ts
// 依赖注入：拿当前请求 session 的 active tab webContents + workdir
type GetWC = () => Electron.WebContents | null
type GetWorkdir = (sessionId: string | null) => string | null

interface RoutineStep { type: string; [k: string]: unknown }
interface Routine { name: string; description: string; createdAt: string; steps: RoutineStep[] }

// 录制态（per session）
interface Recording { sessionId: string; steps: RoutineStep[]; lastActionAt: number }
const recordings = new Map<string, Recording>()   // key = sessionId

export function isRecording(sessionId: string): boolean
export function startRecording(sessionId: string): void
export function stopRecording(sessionId: string, name: string, workdir: string): { path: string; stepCount: number }
export function ingestEvent(sessionId: string, evt: unknown): void  // 由 console-message 解析后调用，含自动 sleep 插入
export function recordNavigate(sessionId: string, url: string): void

export function listRoutines(workdir: string): { name: string; description: string; params: string[]; stepCount: number }[]
export function deleteRoutine(workdir: string, name: string): boolean
export async function runRoutine(wc, workdir, name, params): Promise<RunResult>

interface RunResult { ok: boolean; variables: Record<string, unknown>; error?: string; failedStepIndex?: number }
```

回放逐步执行，任一步失败立即返回 `{ ok:false, error, failedStepIndex }`，已抓取的 variables 一并返回。

### 2. recorder 注入脚本（browserRoutineManager 内常量）

注入到被录制 tab 的页面，捕获 click / input / change，经 `console.log('__WING_EVT__'+JSON.stringify(evt))` 上报。复用 `getSelector` 逻辑生成 selector。

- 注入时机：`startRecording` 立即注入一次；`did-navigate` / `dom-ready` 时若该 session 在录制态则重注入（导航清空脚本）。
- 幂等：脚本内置 `window.__wingRecording` 标志，避免重复绑定监听。
- click 与 type 去重：input 连续触发只记最终 value（debounce 到 change/blur）。

### 3. `browserViewManager.ts` 改动

- **console-message 监听**：识别 `__WING_EVT__` 前缀 → `JSON.parse` → `browserRoutineManager.ingestEvent(sid, evt)`；**该条不进 `tab.consoleLogs` / 全局 `consoleLogs`**（过滤，不污染 `/console`）。
- **did-navigate 监听**：若 `isRecording(sid)` → `recordNavigate(sid, url)` + 重注入 recorder。
- **session→workdir 注册表**：新增 `const sessionWorkdirs = new Map<string,string>()` + 导出 `registerSessionWorkdir(id, wd)` / `unregisterSessionWorkdir(id)`。HTTP handler 用 `currentSessionId()` 查表得 workdir。
- **HTTP 端点**（在现有 server 内，`requestSessionStore` 作用域中）：
  - `POST /routine/record/start` `{name?}` → startRecording
  - `POST /routine/record/stop` `{name}` → stopRecording，返回 `{path, stepCount}`
  - `GET  /routine/list` → listRoutines
  - `POST /routine/run` `{name, params?}` → runRoutine（路由到请求 session 的 active tab wc）
  - `POST /routine/delete` `{name}` → deleteRoutine
- **导航栏 ⏺ 录制按钮**：control-row 加按钮，`browser-nav:action` 增 `record` 分支 → 切换前台 session 录制态；录制中按钮变红 + 显示步数（新 IPC `browser-nav:recording` `{active, count}`）。停止时 navView 内 prompt 命名（或弹简单输入），发 `browser-nav:record-stop` `{name}`。

### 4. `ptyManager.ts` 改动

`createSession` 内拿到 `sessionId` + `workdir` 后调 `registerSessionWorkdir(sessionId, workdir)`；session 关闭时 `unregisterSessionWorkdir(sessionId)`（或复用现有 `destroySessionBrowser` 时机）。

### 5. `scripts/browser-mcp-server.js` 改动

`TOOLS[]` 加 5 个工具，`handleTool` 加对应 case，均走 `callHttp`：

- `browser_routine_record_start` `{name?}` → `/routine/record/start`
- `browser_routine_record_stop` `{name}` → `/routine/record/stop`
- `browser_routine_list` `{}` → `/routine/list`
- `browser_routine_run` `{name, params?}` → `/routine/run`
- `browser_routine_delete` `{name}` → `/routine/delete`

工具 description 写清：routine 按 session 隔离、明文存储、`${var}` 手动参数化、run 返回 variables。

## 数据流

**录制**：用户点 ⏺ → IPC `record` → `startRecording(sid)` → 注入 recorder → 用户在页面操作 → 页面 `console.log('__WING_EVT__'...)` → tab `console-message` → 过滤+`ingestEvent` → 累积 steps（含自动 sleep）；导航 → `recordNavigate` + 重注入 → 用户点停止 → 命名 → 写 JSON。

**回放**：AI 调 `browser_routine_run({name, params})` → MCP `callHttp('/routine/run')`（带 session 头）→ HTTP handler 在 `requestSessionStore` 作用域解析 sid + workdir → `runRoutine(activeTabWc, workdir, name, params)` → 逐步执行、收集 variables → 返回 `{ok, variables, error?, failedStepIndex?}`。

## 错误处理

- 录制中导航到跨域页面：recorder 重注入即可（同源/跨域都注入）。
- 回放 selector 未命中：`wait_for` 超时或 click/type 找不到元素 → 返回 `{ok:false, failedStepIndex, error:'selector not found: ...'}`。
- routine 文件不存在 / JSON 损坏：list 跳过坏文件；run 返回明确 error。
- params 缺失：`${k}` 无对应值 → 替换为空串并在 error 提示（不中断，宽松处理）。
- 无 active tab / 浏览器未开：run 先 `ensureBrowserVisible()`，仍失败则返回 error。
- 录制 stop 时 name 已存在：覆盖（UI 可提示）。

## 测试

1. `npm run build` + `npx tsc --noEmit` 无新类型错误。
2. 录制：开浏览器 → 点 ⏺ → 导航到 localhost 克隆站 → 输入用户名密码 → 点登录 → 停止命名 `login` → 检查 `.claude/browser-routines/login.json` 内容正确（navigate/type/click + 自动 sleep）。
3. `/console` 端点不含 `__WING_EVT__` 噪声。
4. 回放：`browser_routine_run({name:'login'})` → 页面实际完成登录。
5. 参数化：手改 JSON 为 `${username}`/`${password}` → `browser_routine_list` 返回 params:['username','password'] → `run({name, params:{username,password}})` 生效。
6. evaluate：加 evaluate 步抓标题 → run 返回 `variables.greeting`。
7. 失败步：故意写错 selector → run 返回 `failedStepIndex` 指向该步。
8. 隔离：session A 录的 routine，session B `list` 看不到（不同 workdir）。
9. `browser_routine_delete` 删除文件。

## 风险与权衡

- **console.log 通道 vs CDP binding**：放弃 CDP `Runtime.addBinding`，因 Electron 每 webContents 仅允许一次 `debugger.attach`，已被 CDP proxy 占用。console.log 通道无此冲突、不受 CSP 限制、后台 tab 可用；代价是需前缀过滤，可接受。
- **CSS selector 脆弱性**：BrowserWing 用稳定元素 ID `@e1`。本设计复用现有 `getSelector`（CSS），localhost 克隆场景足够；未来可升级为索引式稳定标识。
- **MCP 工具非动态注册**：不为每个 routine 生成独立 MCP 工具（stdio server 需重启才能发现新工具）。改由 `browser_routine_list` 返回富信息（description+params），AI 零重启获取等价可发现性。
- **自动 sleep 阈值**：>800ms 插入、上限 8000ms 为经验值；过细会噪声、过粗会丢节奏，回放仍可手动调。

## 分阶段落地

1. **阶段 A**：browserRoutineManager 骨架（数据模型 + 持久化 + list/delete）+ session→workdir 注册 + HTTP list/delete 端点 + MCP list/delete 工具。先打通存取。
2. **阶段 B**：回放引擎（runRoutine 全动作类型 + params 替换 + 返回结构）+ HTTP/MCP run。可先手写一个 JSON 测回放。
3. **阶段 C**：录制（recorder 注入 + console-message 解析 + 自动 sleep + did-navigate 重注入）+ HTTP record start/stop + MCP record 工具。
4. **阶段 D**：导航栏 ⏺ 按钮 + 录制态 UI（红点 + 步数 + 命名）。
