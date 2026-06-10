# Clone-Site 批量克隆 + API 录制回放 + Patch 自动应用

日期: 2026-06-10
状态: 已批准

## 目标

复刻网站做到：多页面一次完成、SPA 交互（tab/弹窗/路由）在克隆版里真实可用、patch 不再手动编辑文件。
把 5 页站点的克隆从 ~35 次工具调用压缩到 3-5 次。

## 设计

### 1. `browser_clone_site`（新工具，`/clone-site` 路由）

- 输入：`{ url, outputDir, maxPages=10, waitMs=4000, interactMs=0 }`
- 流程：发现页面 → 自动生成 pageMap → 逐页 `clonePageCore()` → 起本地 server →
  逐页截原站+克隆截图算相似度（pngjs，视口截图即可）→ wire navigation
- 返回：`{ serverUrl, outputDir, pages: [{ url, htmlFile, similarity, resources }], failed: [{ url, error }] }`
- 单页失败不中断整体
- 重构：`handleClonePage` 核心抽成 `clonePageCore()`，`handleSitePages` 发现逻辑抽成
  `discoverPages()`，`handleServeLocal`/`handleWireNavigation` 同理，新旧路由共用

### 2. API 录制回放

- CDP 捕获时通过 `Network.requestWillBeSent` 记录 method，`Network.responseReceived` 的
  `params.type` 识别 XHR/Fetch 资源
- XHR/Fetch 响应写入 `<outputDir>/api-archive.json`：
  `"GET /api/list?page=1" → { status, contentType, body }`，跨页面合并
- 生成 `<outputDir>/replay-shim.js`：重写 `window.fetch` + `XMLHttpRequest`，
  启动时同步 XHR 加载 api-archive.json；匹配顺序：method+path+query 精确 →
  method+path（忽略 query）→ 同 path 前缀模糊；未命中放行原请求
- 克隆 HTML 的 `<head>` 最顶部注入 `<script src="replay-shim.js"></script>`（先于业务 JS）
- `serve_local` 加 SPA fallback：404 且 Accept 含 text/html 时返回 index.html（history 路由）
- `interactMs > 0`：克隆前额外滚动+等待，让页面多触发 API 采集

### 3. `browser_patch_element` 加 `applyTo`

- 传克隆 HTML 绝对路径时，style 块直接插到该文件 `</head>` 前并保存，返回 `applied: true`
- 不传维持现状（返回 style 块文本）

### 4. MCP + skill

- `browser-mcp-server.js`：新增 `browser_clone_site` 定义（长超时）、`browser_patch_element`
  schema 加 `applyTo`
- skill（builtinSkills.ts + D:\git2\...\skills\clone-website.md）改为：
  Step 1 一次 `browser_clone_site` → Step 2 对低相似度页 patch（applyTo）→ Step 3 验证交互。
  SPA 不再强制纯截图，`browser_screenshot_full` 为兜底

## 已知限制

- 回放只覆盖克隆时触发过的请求；登录态、POST 写操作不可回放
- 大站点用 maxPages 分批
- XHR shim 为 best-effort（覆盖 onload/onreadystatechange/addEventListener 路径）

## 验证

1. `npx tsc --noEmit` 无 cloneManager 新错误
2. 重启 dev 后对 Vue SPA 站点跑 `browser_clone_site`，确认：页面相似度 ≥90%、
   tab 切换/弹窗在克隆版可交互、api-archive.json 有内容
3. `browser_patch_element(selector, applyTo)` 直接落盘
