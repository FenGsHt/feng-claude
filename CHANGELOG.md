# Changelog

All notable changes to this project will be documented in this file.

## [0.7.76] - 2026-06-25

### 修复 | Bug Fixes
- **打开文本编辑器时左侧 CC 终端变黑**：`AppShell` 里 `TerminalPanel` 在「无编辑器/横向分屏/纵向分屏」三种树位置间切换，开/关 txt 会改变其父节点类型 → React 卸载并重建 `TerminalPanel`，xterm 在未稳定的分屏布局里来不及重绘而变黑（关掉 txt 再次重挂才恢复）。改为让 `TerminalPanel` 始终保持在同一树位置（容器首个子节点），编辑器仅作为兄弟节点按需挂到旁边，终端不再重挂载
- **一窗口两终端切换后调试浏览器地址栏显示旧 URL**：切到「没有浏览器的另一个终端」时 `foregroundSessionId` 指向它，但右侧仍显示本会话浏览器；地址栏更新原本按 `foregroundSessionId` 判断，于是显示中页面的后续 SPA 导航不再更新地址栏，停在旧 URL。改为按「本 tab 即当前实际显示的 view」(`view === state.view`) 判断，地址栏始终跟随正在显示的页面

## [0.7.75] - 2026-06-23

### 修复 | Bug Fixes
- **Token 归属错误（同目录多窗口 / shell-only 抢占 primary）**：同一工作目录开两个窗口（如官方配置窗口 + 同目录 qwen 配置的 lazygit 窗口）时，token watcher 按目录共享、以「最近创建的会话」作全局归因 primary，导致官方会话实际跑出的 claude token 被记到那个只用来跑 lazygit 的 qwen 配置桶里（统计里凭空出现没用过的配置，量和实际用的几乎相等）。两层修复：① `watchSession` 传入 `shellOnly`，shell-only 会话（lazygit 等不跑 Claude）不再抢占归因 primary；② `reattributeProfileByModel` 改为对称——`claude-*` token 若被标到「默认模型非 claude」的第三方配置，归回官方（保留中转型 claude 配置不误改）

## [0.7.74] - 2026-06-22

### 界面 | UI
- **TabBar 满宽 + 调试浏览器/Office 面板下移到 TabBar 之下**：原先调试浏览器或 Office 预览面板出现时，整个 `main`（含 TabBar）被 `marginRight` 挤到左半，TabBar 缩成一块。现把 `marginRight` 只作用于 TabBar 下方的内容区，TabBar 始终横跨整行；调试浏览器（含其自身标签条）与 Office 面板整体下移到 TabBar 之下右侧（`CHROME_TOP = 标题栏 + TabBar`），拖拽手柄同步下移避免遮挡右侧标签

## [0.7.73] - 2026-06-22

### 修复 | Bug Fixes
- **收藏当前页收藏错页面**：调试浏览器的「收藏」按钮原先信任导航栏缓存的 `currentUrl`，SPA 路由切换（hash/pushState）时它没跟上，导致收藏成切换前的旧页面甚至最初的 bing 首页。改为由主进程从前台 active tab 的实时 `webContents` 解析 URL 与标题（权威来源），无论缓存是否滞后都收藏当前真实页面；标题也取页面真值而非工具条标题

### 界面 | UI
- **配置/Telegram 徽章迁移到终端头部**：API 配置切换药丸与 Telegram 频道药丸从每个 tab 内移到下方终端 pane 头部（标题右侧），作用于该 pane 的会话；分屏时各 pane 各显示各自配置。tab 随之大幅瘦身，窗口可拉得更窄。抽出独立组件 `SessionConfigBadges`，切换/重启/预设流程逻辑不变

## [0.7.72] - 2026-06-22

### 新功能 | Features
- **模型 1M 上下文声明**：API 配置的「默认/Sonnet/Opus」模型行新增「1M」勾选框，勾选后注入 env 时给对应模型名追加 `[1m]` 后缀（`ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL`），向 Claude Code 声明该模型按 1M 上下文对待（影响自动压缩阈值等）。Claude Code 发给上游前会自动剥掉 `[1m]`，第三方端点收到的仍是原模型名。仅第三方配置生效，官方配置不注入任何变量、完全不受影响；幂等不重复追加。Haiku/Subagent 不提供（官方语义不支持/未验证）
- **非 CC（shell-only）终端不自动创建调试浏览器**：调试浏览器面板打开时切到 shell-only 终端，不再自动为其新建浏览器 tab（保持显示上一个会话的网页）。`setActiveSession` 把 `shellOnly` 透传给 main，`setForegroundSession` 据此跳过自动建 tab；手动点 header 浏览器按钮仍可为其打开

### 修复 | Bug Fixes
- **标签组互切时终端显示另一个会话的旧内容**：两个分屏标签组互切时 React 按位置复用 `XTerminal` 组件（无 key），effect 把新会话终端 `appendChild` 进容器，但旧会话的 `term.element` 没被移除，导致容器内同时挂着两个终端、显示另一个会话的旧画面（需关掉同组另一终端才恢复）。修复：`XTerminal` cleanup 先于新 effect 执行时，把旧 `term.element` 从本容器摘除

### 界面 | UI
- **移除失效的「上下文窗口」字段**：API 配置里的「上下文窗口」数字框从未被注入 Claude Code（一直是摆设且易误导），已删除；声明上下文能力请用新的「1M」勾选

## [0.7.71] - 2026-06-18

### 修复 | Bug Fixes
- **切换配置时 xterm 鼠标事件崩溃**：`restartSession` 调用 `destroyTerminal` 销毁 xterm 内部 `_renderService` 后，React 尚未卸载旧 `XTerminal` 组件，终端 DOM 元素仍挂载并持续派发 `mousemove`，触发 `MouseService.getMouseReportCoords` 访问已为 null 的 `_renderService.dimensions` 报错。修复方案：在 `dispose()` 前先调用 `element.remove()` 将终端元素从 DOM 移除，从源头切断鼠标事件

## [0.7.70] - 2026-06-17

### 修复 | Bug Fixes
- **回退 Canvas 渲染器（多终端卡死/切换花屏/分屏 TUI 溢出）**：v0.7.68 引入的 Canvas 渲染器在多终端时多 canvas + 频繁 refresh 造成 GPU/ResizeObserver 反馈，随终端数放大导致卡死（关掉一个终端才恢复）、切换花屏、分屏 TUI 超出被截断。已回退到稳定的 DOM 渲染器并卸载 `xterm-addon-canvas`；保留无副作用的 header 订阅收窄优化
- **焦点被调试浏览器抢走**：重试式 focus 循环会把焦点从调试浏览器（独立 WebContentsView）拽回终端。`focusTerminal` / `focusEmbedInput` 每次重试先检查 `document.hasFocus()`，主窗口没焦点就不抢、直接终止重试
- **分屏后 TUI 超出 pane 被截断**：叶子集合变化（split 创建/还原/关窗格）时强制所有窗格按当前 pane 尺寸重新 fit（先 fit 再 refresh），修复 lazygit 等全屏 TUI 按旧几何渲染溢出

## [0.7.69] - 2026-06-17

### 修复 | Bug Fixes
- **Alt+E/R 切换后终端不刷新 / 画面错乱**：上版引入 Canvas 渲染器后的回归 —— 切换还原停泊分屏布局时 `.xterm` 元素被 reparent 到新容器，Canvas 画布残留空白/旧帧；尤其还原回来的非聚焦副窗格不走 active effect，只靠一次性 refresh 不够；active effect 又是先 refresh 后 fit（顺序反），尺寸变化时按旧几何重绘花屏。新增 `refreshTerminalView`（先 fit 拿到正确 cols/rows 再 refresh，跨两帧兜底），在终端 reparent 与变 active 时都调用

## [0.7.68] - 2026-06-17

### 修复 | Bug Fixes
- **Alt+E/R / Alt+F 切换后焦点不在输入框**：切窗口还原停泊分屏布局时终端正在重挂载，原一次性 `term.focus()`（microtask）在 textarea 接入 DOM 前就跑了而静默失败。改为重试式 focus（跨 rAF 重试直到 textarea 真正连入 DOM 且 `document.activeElement` 落到它）；外嵌 composer 的 focus 同样改为重试式；新增 `sessionFocus` 按会话模式路由到正确输入框（xterm/composer）；点击窗格也补一次稳健 focus，修复「点击输入框没反应」

### 性能 | Performance
- **多终端渲染优化**：分屏多终端时 xterm 默认 DOM 渲染器是主要瓶颈，改用 Canvas 渲染器 addon（GPU 合成、不占 WebGL context 配额，适合多终端；失败静默回退 DOM）
- **分屏 header 重渲染优化**：`TerminalPaneHeader` 不再订阅整个 `sessions`/`history` 数组 —— 原先任一会话 running/idle 切换都会让每个分屏 header 重渲染 + 重算候选目录（N 窗格 N 倍）；候选目录改为打开分屏弹窗时即时计算，header 现在只在自己会话变化时重渲染

## [0.7.67] - 2026-06-17

### 修复 | Bug Fixes
- **统计面板成本仍用老算法修复**：「统计」侧栏里 3 处费用计算仍用单一 active-profile 定价 × 整段范围（汇总卡费用、今日明细 Input/Output/Cache 费用、柱状图 tooltip 每日费用），把贵的官方 Claude 和便宜的第三方模型混在一个价格里算。现统一改为按模型定价：`claude-*` 走官方固定定价表，第三方模型走「拥有它的 profile」的定价，未归类余量回退单一定价（与底部 widget 一致）

### 界面 | UI
- **顶部 tab 宽度收紧**：内边距/项间距/最小宽度下调，profile 与 telegram 徽章加最大宽截断，整体更紧凑

## [0.7.66] - 2026-06-16

### 修复 | Bug Fixes
- **分屏拖动比例切换窗口后重置**：split 拖成非 50/50 后，Alt+E/R 切到其它窗口再切回会重置成五五分。现在比例存进布局树（split 节点新增 `sizes`），随停泊/还原一起保留；`onLayoutChanged` 保存、`defaultLayout` 还原

## [0.7.65] - 2026-06-16

### 新功能 | Features
- **Alt+F 窗口内终端切换**：分屏快捷键职责拆分 —— `Alt+E/R` 改为在「窗口（tab 组）」间切换（只在各组主 tab 间循环，不再钻进分屏副窗格）；`Alt+F` 在「当前窗口内的多个终端（分屏窗格）」间循环（非分屏时不拦截，保留终端 readline 行为）

### 修复 | Bug Fixes
- **分屏窗格 Alt+E/R 切走丢失**：split 分屏的窗格在 Alt+E/R 切到其它会话再切回时会脱离、变成独立 tab。新增 `parkedLayouts` 停泊机制：切走时暂存分屏组，切回其任一成员时还原整组（关闭/重启会话同步清理）
- **tab 栏分屏组重复显示**：分屏组现在只显示一个「主 tab」（组内首个 leaf），隐藏副窗格；active 高亮映射到所属组的主 tab

### 界面 | UI
- **底部 MODELS 价格随激活配置变动修复**：每个模型的价格固定用「拥有该模型的 profile」的定价，与当前激活 profile 无关

## [0.7.64] - 2026-06-16

### 修复 | Bug Fixes
- **Token 归因串号修复（侧栏统计）**：watcher 按 workdir 的 primarySessionId 归因，官方会话作 primary 时第三方模型（qwen/glm 等）的 token 会漏进「官方配置」桶。新增模型守卫：归到官方但 model 非 `claude-*` 时，按 model 唯一匹配改归正确 profile（仅在"官方+非 claude 模型"这一确定错误组合下重归，claude 模型不动，零误伤）。注：仅修新产生的 token，历史已混入的数据需手动重置

## [0.7.63] - 2026-06-16

### 新功能 | Features
- **browser_clone_routes（新工具）**：按显式路由列表批量克隆 SPA（解决 Vue/React hash 路由 sitemap/链接发现不到的问题），逐路由克隆→串导航→起预览服务器
- **browser_save_html（新工具）**：直接把渲染后 HTML 存到文件，不再让大 HTML 过模型上下文
- **clone_page 支持 outputFile + hash 路由命名**：SPA 同 base URL 多路由不再都落到 index.html 互相覆盖
- **stripJs 静态快照模式**：clone_page/routes/site 可剥除所有脚本，避免框架重渲染擦除已渲染 DOM
- **导航 shim 三层拦截**：注入到克隆页的点击拦截支持 `<a href>` / 通用 data-* 路由属性 / 自定义 clickRules（覆盖 div+JS 路由的 tabbar）
- **serve-local 路由→文件 rewrite**：克隆写 `routes.json`，本地服务器把 `/promo` 等路由路径（含多段路由）反查回克隆文件，拦得住框架自身改 URL
- **routeFix 开关**：可控制是否注入 route-fix 脚本，交给调用方按现场决定

### 修复 | Bug Fixes
- **克隆页面导航连不上（wired in 0 files）**：href 重写扩展到 hash 路由/路径形式，并注入捕获阶段点击 shim，对 Vue 重渲染后的 DOM 也生效
- **route-fix 加执行守卫**：`window.__fengRouteFixed` 防止同文档重复执行；hash 路由也能正确恢复
- **browser_screenshot 间歇失败自动重试**：遇 "display surface not available" 自动 show+等待+重拍
- **serve-local 禁用缓存**：改完克隆文件刷新即生效，无需换端口

## [0.7.62] - 2026-06-16

### 修复 | Bug Fixes
- **文件侧边栏漏显示文件夹**：之前根级别隐藏所有 dot 文件/夹，且 `build`/`dist`/`out` 等在忽略名单里，导致 Cocos 等项目的 `.creator`/`.history`/`build`/`.babelrc` 等不显示。现在文件树与搜索改用更宽松的显示规则（只隐藏 `node_modules`/`.git`/`.svn`/`.hg`），与系统资源管理器一致；watcher 仍忽略 build/dist/temp 等高频变动目录避免狂刷新

## [0.7.61] - 2026-06-15

### 修复 | Bug Fixes
- **调试浏览器聚焦/开 DevTools 时 Alt+E/R 失效**：DevTools 与调试浏览器是独立 WebContentsView，聚焦后渲染窗口收不到按键。现在主进程在每个浏览器 tab 与 DevTools 的 webContents 上拦截 Alt+E/R 并转发给渲染端，无论焦点在哪都能切换会话
- **切换会话/标签时 DevTools 被关掉**：DevTools 改为 per-tab 记录（`devToolsOpen`），内嵌 DevTools 随各自 webContents 持久；切换时不再强关，按新 active tab 状态恢复，切回时 DevTools 仍在

## [0.7.60] - 2026-06-15

### 修复 | Bug Fixes
- **Telegram 多窗口消息投递到错误窗口**：新增跨实例 owner 文件锁（`feng-owner.lock`，记录持有的 app 主进程 pid）。多窗口=多个独立 app 实例，原内存锁互不可见会各起一个 poller 抢同一 token；现在同一 token 全局只允许一个实例轮询，其它实例的会话自动退避（不起 poller）。持有实例退出/崩溃后锁自动失效可接管；会话关闭释放锁；**强制重连（↻）会夺锁**，让执行重连的那个窗口成为新 owner，消息从此只投递到该窗口

## [0.7.59] - 2026-06-15

### 修复 | Bug Fixes
- **Telegram -32000 根治**：强制重连不再只 kill `bot.pid` 记录的单个 PID，改为枚举并清掉**所有** telegram 插件 bun 进程（含 `bot.pid` 追踪不到的孤儿 `server.ts`），解决多个 server 抢同一 token 的 getUpdates（409 冲突）导致的 -32000；`/plugin` 重连延时 2.5s，给 Telegram 释放旧轮询槽，避免新连接仍撞 409

## [0.7.58] - 2026-06-15

### 新功能 | Features
- **宠物"看到现场"**：宠物点评时新增 Claude 最近一条回答的摘要进上下文，不再盲评；能针对真实发生的事给点评/建议
- **宠物报错哨兵**：本轮会话以错误状态结束时，无视触发概率强制触发并将冷却减半，优先给排错方向
- **宠物建议可一键执行**：回复中用反引号包裹的命令会在气泡里显示「▶ 命令」按钮，点击填入当前终端（不自动回车，确认后提交）
- **宠物成本/Git 哨兵**：单轮输出 token 偏多时提示留意成本；新增 `git:dirtyCount` IPC，未提交改动较多时提醒可 commit

### 修复 | Bug Fixes
- **宠物输入污染修复**：`bufferUserInput` 剥离鼠标跟踪等 ANSI/控制序列，避免鼠标划过终端的转义序列被当成"用户问题"喂给宠物（曾导致宠物把刷屏当挑衅、产生敌意回复）

### 性能 | Performance
- **宠物日志上限 500 → 200**：减小 electron-store 每次写入的全量重写体积

### 新功能 | Features
- **搜索结果"在文件树中定位"**：文件侧栏搜索结果右键菜单新增「在文件树中定位」，点击后清空搜索、级联展开文件树到该项位置，平滑滚动并琥珀色高亮 1.6 秒；菜单同时提供复制绝对路径、在文件管理器中打开、@ 引用到终端

## [0.7.56] - 2026-06-15

### 新功能 | Features
- **文件侧栏全树搜索**：新增后端递归搜索 IPC（`fs:search`），搜索时遍历整个工作目录返回扁平结果（文件名 + 相对路径），解决三级以上深层文件搜不到的问题；带扫描/结果上限保护，跳过 `node_modules`/`.git` 等
- **文件侧栏自动刷新**：用 chokidar 监听工作目录的文件增删/重命名，自动刷新文件树；静默刷新保留已展开文件夹状态；深度上限 8、忽略大目录、350ms 防抖

### 界面 | UI
- **录制/回放合并为一个按钮**：导航栏 ⏺ 录制与 ▶ 回放合并；hover 在按钮正下方弹出下拉选择，直接点击主按钮即开始录制，录制中不弹下拉、结束后恢复
- **回放面板样式修复**：补回此前移除历史面板时一并删掉的 header/滚动区/空状态样式
- **隐藏终端标签栏 token 统计**：移除终端 tab 标题栏的 token 用量显示（详细统计仍可在侧栏 Stats 面板查看）

## [0.7.55] - 2026-06-15

### 界面 | UI
- **调试浏览器导航栏 SVG 图标统一**：所有按钮（后退、前进、刷新、收藏、录制、回放、拾取、DevTools、新标签、关闭）从 Unicode 字符替换为 Feather 风格统一 SVG 图标，视觉一致性提升

## [0.7.54] - 2026-06-15

### 修复 | Bug Fixes
- **URL 历史下拉正确展开**：下拉面板通过 IPC 撑高 navView（同历史/routine 面板机制），不再被 86px navView 裁剪；样式改为两行（标题 + 蓝色 URL）+ 地球图标，与浏览器地址栏风格一致
- **移除冗余历史面板**：历史记录已由 URL 下拉覆盖，移除"更多"菜单及旧历史面板

## [0.7.53] - 2026-06-15

### 新功能 | Features
- **调试浏览器网页收藏**：ctrl-row 新增 ☆/★ 按钮收藏/取消收藏当前页；收藏栏（第三行，横向滚动）快捷点击跳转，× 删除；收藏持久化到 `browser-bookmarks.json`
- **URL 输入框历史下拉**：点击地址栏自动展开历史记录下拉，支持输入文字实时过滤；↑↓ 键导航，Enter 跳转，Escape 关闭

## [0.7.52] - 2026-06-15

### 修复 | Bug Fixes
- **主进程启动崩溃修复**：`browserViewManager.ts` 中 `is.dev` 引用未导入导致 `ReferenceError: is is not defined`，改用 `app.isPackaged`（已在 electron import 中可用）

## [0.7.51] - 2026-06-13

### 文档 | Docs
- **FEATURES.md 全面补全**：完整收录所有 42 个浏览器 MCP 工具（含标签页管理、网站克隆、截图差异对比、JS 执行、Routine 录制/回放等）；补全缺失快捷键（Alt+E/R 前后切换会话、Alt+↑/↓ 上下分屏切换、Alt+M 语音输入、Ctrl+P 文件搜索器、Ctrl+F 文件内查找、Shift+Enter 嵌入模式换行）；新增文本编辑器专区、语音输入专区、会话创建选项（Resume/Shell-only）、分屏方向说明

### 修复 | Bug Fixes
- **Token 归属修复**：同目录多 session 共享 watcher 时，全局 token 归因改为跟踪最近创建的 session（primarySessionId），修复重启会话后 token 误计入旧 profile 的问题
- **会话重启保留调试浏览器**：新增 `migrateSessionBrowser`，重启会话时把旧 session 的浏览器 tab 迁移到新 session，避免调试浏览器被重置到初始页面
- **分屏拖动同步**：拖动分屏分隔线改变 splitRatio 或 toolsPanelWidth 时，同步更新所有后台 session 的调试浏览器 bounds
- **DevTools 重载不抢前台**：调试浏览器 DevTools 重新加载页面时，检测同 URL 重载并抑制主窗口 focus 激活，避免应用被弹到前台

### 重构 | Refactor
- **useDragResize hook**：AppShell 三处拖动缩放（侧栏、编辑器分屏、调试浏览器面板）抽取为通用 `useDragResize` hook，回调存 ref 避免闭包陈旧

## [0.7.50] - 2026-06-13

### 修复 | Bug Fixes
- **统计面板费用修正**：官方配置（Anthropic）的费用改用 per-model 精确定价（Opus/Sonnet/Haiku 各自单价），不再 fallback 到 DEFAULT_PRICING（¥3/¥15），修复统计页显示费用远低于实际的问题
- **modelPricing 共享**：将 MODEL_PRICING / modelToPricingKey / computeClaudeModelsCost 抽取到 `lib/modelPricing.ts` 供 TokenUsageWidget 和 UsageChart 共用

## [0.7.49] - 2026-06-13

### 新功能 | Features
- **FEATURES.md 功能手册**：新增完整功能与快捷键文档，覆盖所有侧栏面板、API Profile、Token 统计、Telegram Channel、调试浏览器、Git Worktree、快捷键等
- **标题栏 `?` 帮助按钮**：右上角新增 `?` 按钮，点击直接打开 GitHub FEATURES.md

## [0.7.48] - 2026-06-13

### 新功能 | Features
- **Telegram 强制重连按钮**：Settings → Telegram Channel 区域新增 `↻` 按钮，一键 kill 旧 bot 进程、清除 bot.pid、触发 `/plugin` 重连，解决跨会话 PID 占用导致无法重连的问题

### 修复 | Bug Fixes
- **cacheCreate Token 占位问题**：改用 `hidden group-hover:inline` 替代 `opacity-0`，隐藏时不占位，修复 Models 分项因不可见元素撑开导致换行的问题

## [0.7.47] - 2026-06-13

### 修复 | Bug Fixes
- **Telegram bot.pid PID 复用误判**：`cleanStaleBotPid` 现额外用 `wmic`（Windows）/ `ps`（Unix）核验进程命令行含 "telegram" 关键字，防止 OS 将旧 bot PID 分配给无关进程时误判为 bot 在线（导致 `-32000` 重连失败）
- **cacheCreate Token 不可见**：TokenUsageWidget 的 Today/Total 及 Models 分项均默认隐藏 `cacheCreate`（☁ 橙色），鼠标悬浮时淡入显示，解决 Opus 高费用来源不透明问题

## [0.7.46] - 2026-06-13

### 修复 | Bug Fixes
- **Telegram bot.pid 残留**：启动 Telegram channel 前先检查 `bot.pid` 里的进程是否存活，仅在进程已死时清除，避免旧 PID 文件导致插件连接失败（-32000）

## [0.7.45] - 2026-06-13

### 修复 | Bug Fixes
- **Routine 回放列表为空**：调试浏览器面板切换前台 session 的渲染侧接线（preload `setActiveSession`/`destroySession` 暴露 + sessionStore 调用）此前漏提交，导致切换终端后浏览器面板/routine 列表的 session 归属解析不一致；现补齐接线，切回对应项目的终端即可看到该项目录制的 routine

### 界面 | UI
- **Token 统计「累计」标识**：Models 分项在仅有累计数据（今日无细分）时显示「累计」小标，区分今日用量与历史累计

## [0.7.44] - 2026-06-13

### 新功能 | Features
- **调试浏览器 Routine 录制/回放**：把浏览器里的一串操作（导航/点击/输入/选择）录成项目级 routine（存 `{workdir}/.claude/browser-routines/<name>.json`），AI 或用户可直接回放，免去逐步 LLM 推理。支持 7 种动作（navigate/click/type/select/sleep/wait_for/evaluate）、`${var}` 参数化（同一 routine 配不同账号密码复用成模板）、evaluate 抓数据回传变量、失败步定位
  - 导航栏新增 ⏺ 录制按钮（红点+步数+内联命名条）、▶ 回放按钮（弹出本项目 routine 列表点击即回放）
  - 5 个 MCP 工具：`browser_routine_record_start/stop`、`browser_routine_list/run/delete`
  - 录制走 `console.log('__WING_EVT__')` 通道，不污染 `/console`；导航后自动重注入 recorder

### 修复 | Bug Fixes
- **Token 计算偏多（重复累加）**：Claude Code 把同一条 assistant message 在 JSONL 里写成多条记录（按 content block / tool_use 拆分），每条带相同的 usage 快照；watcher 逐条累加导致 cacheRead/output 被多算 40~56%、成本虚高。现按 `message.id` 去重，同一 message 只计一次
- **evaluate 步骤字段名容错**：回放器原只认 `js`/`variable`，写 `javascript`/`expression`/`code`/`var` 会被静默忽略（执行空语句、不回传变量）；现接受全部别名，纯表达式自动加 return，含 return/多语句的当函数体
- **`window.prompt` 在 Electron 不可用**：录制停止命名原用 `window.prompt`（WebContentsView 直接返回 null 导致录制被静默取消），改为内联命名条
- **导航栏下拉被裁剪**：navView 物理高度仅 60px，更多菜单/历史/回放面板下拉超出会被 view 边界裁掉，现统一通过 IPC 撑高 navView 显示
- **多窗口最大化后台浏览器越界**：后台 session 的 tab view 在最大化后保留旧坐标从前台 view 边缘漏出，现 resize 时同步所有后台 tab bounds

### 界面 | UI
- **导航栏整理**：关闭 × 移到标签条右侧；历史记录收进右侧 ⋯ 更多菜单（悬浮/点击展开）；窄面板时控制行横向滚动而非溢出整页滚动条
- **浏览历史面板**：分组（今天/昨天/更早）+ 时间显示 + 清除全部
- **调试浏览器按 session 隔离的多 tab**：每个终端 session 独立一组 tab，互不可见；切终端自动切浏览器；后台 session 仍可截图/操作

### clone-website 工具链改进
- **SPA 完整克隆提醒**：工具描述补充——SPA 路由组件是懒加载 chunk，只在访问该路由时才下载；只克隆首页会漏掉其余路由的组件 chunk，复刻完整站点须遍历所有路由（用 `browser_clone_site` 或对每个 URL 循环 `browser_clone_page`）

## [0.7.43] - 2026-06-11

### 修复 | Bug Fixes
- **官方定价按模型 ID 判断**：原先「profile 非官方 → 所有模型用 singlePricing」，导致中转站 profile 里调用的真 Claude 模型（Opus/Sonnet）也被按单价计算；现改为按模型 ID 判断（`claude-*` 走官方定价表，第三方走 singlePricing），同一 profile 混用也各自算对
- **标签徽章模型名快照**：徽章原先实时读设置，在设置里改名/换模型后会错误地改动已运行 session 的徽章；现在启动时快照 profile 名称到 session，设置变更不再影响运行中的会话
- **新目录卡在 `--continue`**：无对话历史的目录启动时仍带 `--continue`，报 "No conversation found to continue" 后停在空 shell；现改为启动前主动检查 `~/.claude/projects/<目录>` 是否有历史，无则不带 `--continue`

### clone-website 工具链改进
- **本地 server 按原始路径 serve**：读 manifest 建立「原始 URL pathname → 本地文件」映射，JS bundle 运行时请求 `/static/css/...`、`/static/editor/...` 等原始路径也能命中（pathname 精确 + basename 兜底），无需重写 JS 内部路径
- **API 录制自动遍历点击**：克隆时在 interactMs 窗口内自动点击导航/分类/Tab 元素，触发各自的懒加载 API 并录入 api-archive.json，离线回放时未主动点过的分类不再空白
- **`browser_click` 派发完整事件序列**：从裸 `el.click()` 改为 pointerdown→mousedown→mouseup→click（带真实坐标），正确触发 Vue/React 绑在 mousedown 上的事件处理器

## [0.7.42] - 2026-06-11

### 修复 | Bug Fixes
- **第三方模型被错误按 Sonnet 计费**：`modelToPricingKey` 对非 Claude 官方模型（如 `qwen3.7-plus`）默认返回 `'sonnet'`，导致走官方 Sonnet 定价；现改为只有以 `claude-` 开头的模型才走 `MODEL_PRICING`，第三方模型一律用 `singlePricing`（设置里的自定义价格）
- **Fable/Mythos 模型计价缺失**：`modelToPricingKey` 未识别 `fable`/`mythos` 模型 ID，被按 Sonnet 价格计费；现已补上
- **MODELS 模型名显示过短**：`modelDisplayName` 对第三方模型只取最后一段（如 `qwen3.7-plus` → `plus`），现改为第三方模型显示完整 modelId；官方模型显示版本号（如 `Opus 4.8`、`Fable 5`）

## [0.7.41] - 2026-06-11

### 修复 | Bug Fixes
- **累计费用漏算历史 token**：per-model 追踪功能上线前的旧会话 token 存在 `total` 但不在 `perModel`，`computePerModelCost` 遗漏这部分导致累计严重偏低；现加 `globalRef` 参数，差额用 `singlePricing` 补足，与 `computePerProfileCost` 逻辑一致

## [0.7.40] - 2026-06-11

### 修复 | Bug Fixes
- **clone-website：其他页面内容被覆盖**：SPA（Vue/React）克隆后访问非首页时，内置 JS Bundle 重新初始化 Router 覆盖捕获内容；现在在 `<head>` 最顶部注入路由修复脚本，SPA 初始化前用 `history.replaceState` 恢复原始路径，各页面正确渲染
- **clone-website：批量新增 `browser_clone_site`**：一次调用完成发现→克隆→预览→相似度→导航接线，支持 SPA API 录制回放（XHR/fetch 存档 + replay-shim）；`browser_patch_element` 加 `applyTo` 参数自动写入克隆文件
- **MODELS 费用改用今日数据**：MODELS 区块改为显示今日各模型用量（而非累计）
- **今日/累计费用与 MODELS 对齐**：今日和累计费用改用 per-model 独立定价（Opus ≠ Sonnet），不再用固定单价低估 Opus 费用
- **CDP 缓存禁用**：多页批量克隆时强制禁用浏览器缓存，确保所有页面资源均触发 CDP 事件

## [0.7.39] - 2026-06-10

### 新功能 | New Features
- **clone-website MCP 工具**：新增 5 个内置 MCP 工具（`browser_site_pages` / `browser_clone_page` / `browser_serve_local` / `browser_patch_element` / `browser_wire_navigation`），复刻网站从手工指令变为工具调用，支持多页面、CSS全量导出、URL自动重写、导航链接自动修复
- **clone-website skill 更新**：skill 文件改为 5 步工具调用流程 + Agent 审查模式说明；`builtinSkills.ts` 改为 `forceUpdate: true`，每次启动自动覆盖更新

### 改进 | Improvements
- **MODELS 区块可折叠**：per-model token 细分区块支持点击折叠/展开（▶ 箭头动画）
- **MODELS 显示 cacheRead**：每个模型行新增 `⚡` 缓存命中显示，与今日/累计行保持一致
- **MODELS 计价修正**：非官方配置时 MODELS 区块使用 profile 自定义价格，不再强制走官方模型定价导致与上方汇总对不上

### 重构 | Refactor
- **cloneManager.ts**：clone 相关 HTTP 端点从 `browserViewManager.ts` 抽离到独立模块，`browserViewManager.ts` 从 ~2300 行降至 ~2010 行

## [0.7.38] - 2026-06-09

### 新功能 | New Features
- **Per-model token 细分**：从 JSONL 提取 `message.model`，按 Opus/Sonnet/Haiku 分别统计 token 用量和费用，各模型使用独立定价（Opus 4.8: ¥35/¥175, Sonnet 4.6: ¥21/¥105, Haiku 4.5: ¥7/¥35）
- **货币改为人民币**：所有费用显示从 `$` 改为 `¥`

### 修复 | Bug Fixes
- **配置切换后 token 统计错误**：切换 profile 时同步更新所有已有 session 的 profileId，token 不再记到旧配置
- **Opus 定价过时**：从已废弃的 Opus 4（$15/$75）更新为 Opus 4.8（$5/$25）

## [0.7.37] - 2026-06-09

### macOS 兼容性 | macOS Compatibility
- **双架构构建**：dmg 同时产出 Apple Silicon (arm64) 与 Intel (x64)，此前默认仅出 runner 架构包导致 Intel Mac 无法运行
- **快捷键支持 Cmd 键**：主进程拦截的 Ctrl+Shift+D（浏览器）/ Q（拾取器）/ C（复制）此前硬编码只认 Ctrl，Mac 按 Cmd 全部失效；现 Mac 上接受 Cmd（其他平台不变）
- **未签名分发说明**：`identity: null` 显式声明未签名；下载 dmg 后首次打开需「右键 → 打开」或 `xattr -cr` 清除隔离属性（无 Apple 开发者证书前无法做到双击直接打开）

### 改进 | Improvements
- **ConPTY 默认开启（Windows）**：未显式设置时默认使用 ConPTY，改善 lazygit/vim 等 TUI 应用显示；如遇异常可在设置中关闭（`FENG_USE_CONPTY=0` 可强制关）

## [0.7.36] - 2026-06-06

### 新功能 | New Features
- **触发器（Triggers）侧边栏**：可建多个触发器，到点自动向当前活跃会话发指令或跑某个待办清单；支持倒计时（一次性）、定时刻（一次性）、重复间隔三种时机；每个触发器有启动/停止开关、实时倒计时；仅应用运行期生效（不跨重启补触发）

### 改进 | Improvements
- **待办状态自动回传**：改为让 Claude 在回复末尾输出 `todo-status` 状态块（按序号汇报），GUI 从转录里实时解析，无需手动「从文件同步」；状态块到达即更新，同一块只应用一次（不覆盖用户后续手动改动）
- **待办运行用序号而非内部 id**：避免 Claude 把内部 UUID 误当成「任务系统的任务 ID」去查找而误判需澄清

### 修复 | Bug Fixes
- **待办/触发器持久化丢失**：从 localStorage 改为主进程稳定路径（getConfigDir/kv），并用同步读写消除异步水合竞态导致的「重开即空」；便携版/升级后数据仍在
- **「Task completed」通知狂弹**：同一项目多会话（多标签/分屏）会被广播多次 idle，去重改按项目（workdir）+ 15 秒全局冷却，不再一次弹很多条

---

## [0.7.35] - 2026-06-05

### 新功能 | New Features
- **待办清单（TodoList）侧边栏**：新增「待办」面板，可建多个**全局可复用**的命名清单，每个清单可独立增删/编辑条目、折叠、重命名
- **一键交给 Claude 执行**：每个清单两个运行按钮 —— ▶「运行待办」只发未完成项；▶▶「全部重跑」把所有项重置为待办后整单执行。运行会把清单写入项目根 `.feng-todos.md` 并自动发给当前活跃会话
- **四种状态**：待办 / 完成 / 失败（`[!]` + 原因）/ 需澄清（`[?]` + AI 疑问）。需澄清项面板内联回复框，补充说明后把「待办+疑问+答复」发回 Claude 继续
- **自动同步进度**：会话每轮结束（idle）自动回读 `.feng-todos.md`，刷新对应清单的勾选/失败/澄清状态；条目用隐藏 id 匹配，文本被改写也不丢
- **运行目标提示 + 运行中标识**：面板顶部明示「运行目标 ▶ 终端名」，无活跃会话时按钮置灰；正在执行的清单显示脉冲「运行中」
- **防误操作**：删除清单、全部重跑需二次点击确认（展开为「✕ 确认 / ▶▶ 确认」文字）
- 写入 `.feng-todos.md` 前自动追加到项目 `.gitignore`，避免被误提交

---

## [0.7.34] - 2026-06-04

### 修复 | Bug Fixes
- **拾取后中文 IME 概率失效**：增加 `compositionend` 事件派发清空拾取器遗留的 IME pending 状态；延迟加长至 150ms；350ms 处二次 click+focus 兜底，消除概率性需要退格才能输入中文的问题

## [0.7.33] - 2026-06-04

### 修复 | Bug Fixes
- **元素拾取器 HTML 输出过长**：改为只输出开头标签（含 class/id），不再输出完整 outerHTML
- **拾取后中文 IME 失效**：聚焦 CC 终端后额外触发 `click()`，正确激活 Windows IME，不再需要手动输入字符唤醒

## [0.7.32] - 2026-06-04

### 修复 | Bug Fixes
- **TUI 应用显示异常（lazygit/vim 光标乱跳）**：移除 xterm.js `convertEol: true`，该选项将 `\n` 强制转为 `\r\n`，导致 TUI 应用光标定位错误、残影
- **Windows ConPTY 支持**：设置页新增「ConPTY 模式」开关，可改善 TUI 应用兼容性（重启会话生效）
- **截图对比相似度虚高**：对比算法改为使用较大图的总面积，缺失部分计入差异；内容区差异权重 ×3，减少背景像素稀释
- **文本编辑器 Esc 误关闭**：Esc 不再关闭编辑器，只关闭子面板（picker/查找栏等）

## [0.7.31] - 2026-06-04

### 新功能 | New Features
- **调试浏览器记忆上次 URL**：关闭软件后重新打开，自动恢复到上次浏览的页面
- **`browser_capture_resources`**：一键抓取目标网站所有资源（HTML/CSS/JS/图片/字体），存到本地目录，生成 manifest.json 映射表，为网站复刻提供完整素材
- **`clone-website` 内置 skill**：app 启动时自动安装，包含完整网站复刻工作流（资源抓取→组件生成→视觉对比→多页面→动效）
- **`browser_screenshot_diff`**：像素级截图对比工具，返回相似度百分比和红色差异高亮图
- **Tab 切换自动滚动**：Tab 过多时，激活的 Tab 自动滚入可视区

### 修复 | Bug Fixes
- **长文本粘贴截断**：PTY 写入按 2048 字符分块，每块间隔 15ms，避免 ConPTY 缓冲溢出丢字
- **文本编辑器 Esc 误关闭**：Esc 键不再关闭编辑器，只关闭 picker/查找栏等子面板

## [0.7.30] - 2026-06-04

### 新功能 | New Features
- **`browser_scroll` 新增 `deltaY` 参数**：相对滚动（正数向下，负数向上），可触发懒加载内容（如 Discourse 论坛分页）
- **`browser_get_text` 新增 `maxLength` 参数**：默认上限从 8000 提升至 30000 字符，可自定义

## [0.7.29] - 2026-06-04

### 修复 | Bug Fixes
- **Alt+R 切换会话无效**：移除主进程对 Alt+R 的 `before-input-event` 拦截，恢复按键传达到 renderer

## [0.7.28] - 2026-06-04

### 新功能 | New Features
- **`browser_eval_in_frame`**：通过 CDP isolated world 在跨域 iframe 内执行 JS，突破同源限制；用 `frameUrl` 匹配目标 frame，无需 CSS 选择器
- **Alt+E/R 切换会话**：快捷键从 Ctrl+Shift+E/R 改为 Alt+E/R，切换上一个/下一个终端会话

### 修复 | Bug Fixes
- **Telegram 多会话路由混乱**：新增 owner 锁，同时打开多个 CC 终端时只有第一个获得 Telegram bot 控制权，避免消息随机分发到不同会话

## [0.7.27] - 2026-06-03

### 修复 | Bug Fixes
- **元素拾取器完整输出**：移除 outerHTML 和 innerText 的截断限制，原样输出完整内容（含 base64 图片数据）

## [0.7.26] - 2026-06-03

### 新功能 | New Features
- **Ctrl+Shift+E/R 切换会话**：在多个终端会话（标签页或分屏）间快速切换，E 切上一个，R 切下一个
- **浏览器 MCP 新增 iframe 支持**：`browser_get_frames` 列出所有 iframe 及其坐标；`browser_click_at` 按坐标点击（穿透跨域 iframe，如 Cloudflare Turnstile/reCAPTCHA）；`browser_eval` 新增 `frameSelector` 参数支持同源 iframe 内执行 JS

### 修复 | Bug Fixes
- **元素拾取器 HTML 截断**：outerHTML 截断前先剥离 base64 data URL（替换为 `[base64]`），避免内嵌图片耗尽 600 字符限额导致文本截断，同时修复经典终端路径的 PTY 粘贴截断

## [0.7.25] - 2026-06-02

### 修复 | Bug Fixes
- **切换配置后终端显示异常**：restartSession 完成后自动触发 wakeTerminal，不再需要手动点刷新
- **升级通知被浏览器面板遮挡**：通知自动定位在浏览器面板左侧，不关闭面板
- **元素拾取发送后未聚焦输入框**：显式 focus renderer webcontents，双重延迟确保外嵌输入框获焦
- **预览终端滚动失效**：transition 改为只过渡 opacity/transform，切换为固定模式时触发 wakeTerminal

## [0.7.24] - 2026-06-02

### 新功能 | New Features
- **终端悬浮预览**：外嵌模式下悬浮「显示终端」按钮时，右下角弹出终端预览（带淡入/淡出动画），移开自动消失，预览位于按钮区上方不遮挡操作；点击「显示终端」可固定

### 修复 | Bug Fixes
- **分屏弹窗被浏览器遮挡**：加 `useFocusWindow`，弹窗打开时自动隐藏内嵌浏览器

## [0.7.23] - 2026-06-02

### 新功能 | New Features
- **元素拾取器两阶段**：点击元素后显示父级面包屑链（当前元素在左，父级向右），可点击切换高亮；高亮元素旁显示「✓ 发送到输入框」确认按钮，再次点击已选项或点按钮发送

### 修复 | Bug Fixes
- **确认按钮点击无效**：捕获阶段 click 监听拦截了按钮事件，加白名单放行修复
- **token 重复计费**：多标签同目录时 isPrimary 机制防止全局 store 重复 ingest
- **通知每轮只发一次**：用户发新消息时重置通知状态，工具调用链不再触发多次通知

## [0.7.22] - 2026-06-02

### 修复 | Bug Fixes
- **缓存 token 重复计费**：同一 workdir 多标签时，JSONL watcher 向每个 session 发送 IPC，导致全局 store 重复 ingest；现在只有 primary session（watcher 创建者）更新全局 store

## [0.7.21] - 2026-06-01

### 修复 | Bug Fixes
- **多配置 baseUrl 全局化**：代理服务器只读全局 activeProfileId，导致非全局配置的 session 也走全局 baseUrl；现在非全局配置直接使用自身 baseUrl 绕过代理，全局配置保留原有容灾逻辑
- **多配置 model 混用**：PTY_ENV_STRIP 补全 model 相关 env var，切换配置时旧值不再残留
- **诊断日志**：PTY 启动时打印实际注入的 model env var，便于排查配置问题

## [0.7.20] - 2026-06-01

### 修复 | Bug Fixes
- **切换配置时 model 混用**：`PTY_ENV_STRIP` 补全 `ANTHROPIC_DEFAULT_SONNET/HAIKU/OPUS_MODEL` 和 `CLAUDE_CODE_SUBAGENT_MODEL`，防止旧配置的 model 变量残留；`filterEnvRecord` 同时过滤 `null/undefined`，避免未填字段的 undefined 键穿透继承系统环境变量
- **打包版 CSP 拦截主题脚本**：`script-src 'self'` 阻止 anti-FOUC inline script 执行导致主题初始化失败；将脚本 hash 加入白名单

## [0.7.19] - 2026-06-01

### 修复 | Bug Fixes
- **Token cacheRead 约两倍**：流式响应的中间快照（output=0 且 cacheCreate=0）未被过滤，导致 cacheRead 被重复计数；修正过滤条件后与 CC 内置 `/usage` 对齐
- **官方配置 token 未归属**：图表遍历 `settings.profiles` 时未包含虚拟 profile `__official__`，导致官方配置用量显示为「未归属」；新增 `displayProfiles()` helper 修复所有图表处
- **系统通知多次触发**：原 30 秒 debounce 逻辑因 `elapsed` 恒 < 30s 而从不触发，工具调用期间的 idle 事件又会误发多次；改为 idle 后延迟 8 秒发通知，期间若重新 running 则取消
- **React #310 崩溃（useFocusWindow）**：`UpdateNotification` 在两个 early return 之后才调用 `useFocusWindow`，违反 React Hooks 规则；将 hook 调用移至组件顶部
- **热力图被内嵌浏览器遮挡**：`WebContentsView` 为原生层，DOM z-index 无效；`useFocusWindow` 弹窗打开时自动通知主进程临时隐藏 browser panel，关闭后恢复

### 功能调整 | Changes
- **移除 Tool call 侧边面板**：删除标题栏「Toggle tool call panel」按钮及对应面板
- **外嵌按钮按设置显示**：「外嵌输出 BETA」关闭时，终端标题栏不再显示切换按钮
- **浏览器元素拾取快捷键说明**：导航栏 ⊕ 按钮 tooltip 补充 `(Ctrl+Shift+Q)`

## [0.7.18] - 2026-05-28

### 新功能 | New Features
- **终端刷新按钮**：终端标题栏新增 ↺ 刷新按钮，单击调用 `wakeTerminal` 立即重绘画面；lazygit / vim 等 TUI 出现乱码时可快速恢复
- **所有弹窗/浮层自动置前**：`useFocusWindow` hook 扩展至全部 11 个覆盖层组件（`UpdateNotification`、`UsageChart` 热力图、`SettingsPanel.ProfileEditor` 等），打开任意界面时主窗口均自动浮到最前

### 修复 | Bug Fixes
- **TUI 画面多项修复（lazygit / vim / htop）**：
  - 切换标签时立即同步刷新 xterm canvas（不再等 200ms），解决第一帧仍为旧画面的问题
  - 交替屏幕（alternate screen）标签始终强制发送 SIGWINCH，确保 TUI 响应尺寸变化重绘
  - 分屏布局切换（单窗格 ↔ 分屏）时 `container.appendChild` 移动 DOM 元素后补一帧 `refresh()`，消除"新分屏显示旧 lazygit 内容"
- **Windows ConPTY exit-259 修复**：`APP_FOCUS_WINDOW` 和 `browserViewManager.revealMainWindow` 均改为 `if (!win.isFocused()) win.focus()`，移除 `win.moveTop()`；打开调试浏览器后不再触发 ConPTY 意外断开（exit code 259 = `STILL_ACTIVE`）

## [0.7.16] - 2026-05-27

### 新功能 | New Features
- **Ctrl+P 文件搜索**：文本编辑器内按 Ctrl+P 弹出浮动文件搜索框，输入关键词实时过滤当前项目下所有文件（文件名匹配优先于路径匹配），↑↓ 导航、Enter/点击打开，Esc 关闭；文件列表首次加载后缓存，再次打开即时显示
- **官方配置（Official Profile）**：API 配置列表新增「官方配置」选项，选中后不注入任何 `ANTHROPIC_*` 环境变量，Claude Code 使用 `~/.claude/` 中自身存储的凭证（支持 `claude login` OAuth）
- **TUI 应用（lazygit / vim 等）显示修复**：切换标签时不再强制滚动终端视口，避免普通屏幕 scrollback 透过交替屏幕显示（乱码问题）
- **分屏弹窗遮挡修复**：打开分屏目录选择弹窗时自动将主窗口移至最前，防止被 detach DevTools 窗口遮挡

### 修复 | Bug Fixes
- 官方配置下 `CLAUDE_CODE_OAUTH_TOKEN` 不再被清除，OAuth 登录凭证正常生效
- 官方配置 profileId `__official__` 传给主进程时正确解析，不再回退到全局激活配置

## [0.7.15] - 2026-05-27

### 性能 | Performance
- **文本编辑器大幅提速**：修复打开大文件时按键卡顿的问题
  - 行号从 N 个 React `<div>` 改为单一文本节点，万行文件的渲染开销降至接近零
  - 查找匹配坐标计算从 O(n×m) 改为单次 O(n) 扫描，搜索高频字符不再卡顿
  - 光标位置更新回调不再依赖 `content` state，每次按键不重建函数
  - 文件大小显示不再每次按键运行 TextEncoder 全文编码

## [0.7.14] - 2026-05-26

### 新功能 | New Features
- **图片预览**：文件树双击 png / jpg / gif / webp / svg / avif 等格式文件，在分屏窗格中直接预览；与文本编辑器共用同一分屏逻辑，支持左右 / 上下切换和 Esc 关闭
- **文本编辑器增强**：新增保存失败提示条（权限不足时红色提示不再静默）、底部状态栏（行 / 列 / 总行数 / 文件大小）、从磁盘重新加载按钮、行号显示、Ctrl+F 内联查找

### 修复 | Bug Fixes
- **查找高亮位置偏移**：改用绝对定位色块替代镜像 div，测量实际字符宽度后精确定位；关闭 textarea 折行（`wrap="off"`）确保高亮与行号一一对应，不受长行影响
- **分屏对话框新增"打开文本文件"按钮**：新建分屏时可直接选择文本文件在编辑器中打开

## [0.7.13] - 2026-05-12

### 新功能 | New Features
- **文本文件编辑器**：文件树双击文本文件即可在右侧分栏打开编辑器；支持语法高亮、行号、Ctrl+F 搜索、保存状态提示、未保存警告、一键重载；布局与浏览器面板独立分栏，不互相覆盖

### 修复 | Bug Fixes
- **外嵌进程退出检测**：PTY 进程 `exited`/`error` 时底部显示红色提示条，输入框自动禁用，「重启 Claude」一键恢复（之前已在 main 分支，本版正式合入）

### 性能 | Performance
- **外嵌历史水合限速**：`readFullTranscriptEntriesFromDisk` 现在只读最近 25 个 JSONL 文件（按修改时间）且总量不超过 8 MB；长期项目积累数百个历史文件时不再全量同步读取，消除打开外嵌时的卡顿

---

## [0.7.12] - 2026-05-12

### 新功能 | New Features
- **OfficeCLI 内置 MCP**：自动下载 office-cli 二进制（docx/xlsx/pptx 处理），MCP 设置面板新增状态卡片，支持版本检测与一键更新
- **宠物进食动画**：喂食时根据食物类型播放专属动画——小饼干（3 帧轻快啃咬）、小鱼干（4 帧热情猛嚼）、豪华套餐（4 帧慢慢享受）；4 种宠物各有对应帧；台词随机抽取
- **外嵌进程退出检测**：PTY 进程退出或异常时外嵌底部显示红色提示条，输入框自动禁用，提供「重启 Claude」一键恢复
- **外嵌上下文用量环形图**：输入框右侧实时显示上下文占用百分比，支持状态栏 N/M、百分比和 JSONL 累计三种来源；超 75% 变橙、超 92% 变红

### 修复 | Bug Fixes
- **Agent 工具调用显示**：外嵌转录面板中 Agent/Explore 调用不再显示红色「no call data」，历史 JSONL 加载时直接携带 toolInput 数据，完整展示 agent 类型、描述和 prompt（最多 600 字符）
- **外嵌代码框样式统一**：bash 命令框、Agent prompt 框、通用参数框均改用主题 CSS 变量，不再硬编码黑色背景，浅色主题下正常显示
- **宠物食物扣费重启失效**：`lastCoinSyncCost` 纳入持久化，重启后不再因基准归零而把已消费游戏币补回

### 改进 | Improvements
- 宠物 ASCII 全面升级：4 行格式、等级分档尺寸（1–10 级 2 行 / 11–20 级 3 行 / 21+ 级 4 行）、饥饿系统与食物商店、颜色对比度提升、气泡浮动显示
- 宠物内容库每周批量获取 40 条并集成 Claude Code 使用技巧

---

## [0.7.9] - 2026-05-13

### 新功能 | New Features
- **Office 文件预览**：侧栏新增 Office 标签页，双击 docx/xlsx/pptx 文件即可打开右侧预览面板；支持文件浏览器拖拽与 MCP 触发
- **PPT 高保真渲染**：PPTX 优先通过 office-cli SVG 输出，完整保留背景、渐变、字体与布局；全部幻灯片纵向排列一页浏览
- **元素/单元格选择器**：预览面板顶部 @ 按钮进入拾取模式，点击 PPT 形状 / Excel 单元格即可将 `@path` 引用注入外嵌输入框
- **宠物 21 点 Blackjack 小游戏**：对话 token 消耗量自动换算为游戏币，支持下注、要牌/停牌，胜负即时结算

### 修复 | Bug Fixes
- **流式 token 统计膨胀**：跳过 intermediate streaming snapshot（output=0 & cache=0），input token 不再被重复计数
- **分屏输入框异常**：react-resizable-panels 布局未稳定时 textarea scrollHeight 测量错误导致输入框撑爆；ResizeObserver 监听宽度后重新测量
- **BP 模式下 ! 命令失效**：shell 命令在 bracketed paste 模式下被当作纯文本粘贴，不再触发执行
- **@ 路径外嵌发送失败**：含 @ 的文本不再用 BP 转义序列包裹，改用尾部空格阻止自动补全，确保输入正确送达 PTY

---

## [0.7.7] - 2026-05-12

### 修复 | Bug Fixes
- **大历史项目外嵌卡死**：外嵌转录面板首次挂载时不再全量过滤/聚合数千条历史，默认只扫描尾部窗口，搜索时才进入全量范围；避免含大量 JSONL 历史的项目点击外嵌后 UI 线程卡死
- **历史流式标记卡顿**：历史 assistant/thinking 的“已播放”标记改为批量写入 localStorage，并限制持久化数量，避免首次挂载时同步写入数千次

### 诊断 | Diagnostics
- **外嵌性能日志**：新增 `[embed-toggle]`、`[transcript:hydrate]`、`[transcript-store:replace]`、`[transcript-pane:filter]`、`[transcript-pane:aggregate]`、`[transcript-pane:pre-reveal]` 日志，用于定位项目级历史规模导致的卡顿

---

## [0.7.6] - 2026-05-12

### 修复 | Bug Fixes
- **外嵌卡住（特定项目）**：含失败 MCP 服务器的项目在 PTY 进入 `idle` 后，延迟到达的 PTY_OUTPUT chunk 可能携带 `?1049h`（Ink/TUI 启动噪声），导致备用屏标志被误置 `true`、外嵌输入框永久禁用。根本原因为 `PTY_OUTPUT` 与 `PTY_STATUS` 经不同 IPC 通道发送，渲染端收到顺序无保证。修复：`idle` 后 1500ms 宽限期内的 `?1049h` 视作噪声丢弃，不触发备用屏锁定
- **外嵌备用屏误判逃生门**：备用屏横幅新增「强制恢复」按钮，直接重置前端状态而不向 PTY 发送任何内容，供误检时恢复

---

## [0.7.5] - 2026-05-13

### 修复 | Bug Fixes
- **外嵌卡住（生产版）**：安装版正式包 preload 在 minify 模式下产生 `m is not defined` 错误，导致每次 PTY 输出事件回调抛异常，外嵌界面收不到任何数据而卡死；preload 已切换 `minify: false`，本版正式生效
- **斜杠命令误判**：`/**` 开头的 JSDoc 注释不再被视为斜杠命令，发送路径正确走普通消息流
- **多行提交稳定性**：多行文本延迟 80 ms 分帧发送 `\r`，避免 TUI 将 Enter 与正文粘在同一 write 内无法提交
- **首行 `/` 转义**：首行以 `/` 开头但非斜杠命令（如路径、注释）时，自动前置空格规避 CLI 误解析
- **Bracketed Paste 模式**：检测 xterm 的 BP 模式（`\x1b[?2004h/l`），发送时用 BP 序列包裹，彻底防止 `/` 触发 slash 弹窗

### 改进 | Improvements
- 移除调试日志：`[submitEmbed]`、`[submitEmbed:payload]`、`[pty-input-ack]`、`[bp]`、`[embed-mcp]` 等日志不再打印到控制台

---

## [0.7.4] - 2026-05-13

### 改进 | Improvements
- **本地字体**：通过 `@fontsource` 打包 DM Sans、VT323、Share Tech Mono（woff2），移除对 Google Fonts 的 `@import`，正式包在严格 CSP 下仍可加载字体、离线可用
- **CSP**：打包态不再为外链字体放宽 `style-src` / `font-src`

### 修复 | Bug Fixes
- **Preload 生产报错**：部分环境压缩后出现 `m is not defined`；preload 构建关闭 `minify` 规避
- **Preload 类型**：补全 `GitUpdateWorktreePayload` / `GitUpdateWorktreeResult` 的类型导入

---

## [0.7.3] - 2026-05-12

### 改进 | Improvements
- **PTY 输入 ACK**：`sendInput` 后主进程向渲染进程回传 `PTY_INPUT_ACK`（含可选 `traceId`），便于确认多行/粘贴内容是否写入 PTY
- **外嵌多行提交**：正文与提交回车分两帧发送（延迟 `\r`），避免斜杠 TUI 将 Enter 与多行正文粘在同一 write 内导致无法真正提交
- **斜杠命令识别**：仅当首段匹配 `/` + 字母时视为斜杠命令；`/**` 等 JSDoc 不再误判
- **非斜杠首行 `/` 转义**：首行以 `/` 开头且非斜杠命令时自动加前导空格，减轻 CLI 对 `/` 的误解析
- **Bracketed Paste 检测**：抽取 `bracketedPasteMode` 工具，供外嵌发送路径判断终端是否处于粘贴模式

### 修复 | Bug Fixes
- **外嵌斜杠 TUI 中断入口**：移除单独的「强制退出」；需要时统一使用「中断」结束斜杠交互（含需原始终端时的场景）
- **文案**：阻塞发送时的提示改为引导使用「中断」

---

## [0.7.2] - 2026-05-11

### 新功能 | New Features
- **外嵌输入框 UI 重构**：去掉转录区顶部 header，提示区移到输入框上方；输入框默认单行、可向下拖拽展开；搜索框回归转录区右上角与发送/显示终端按钮同行
- **快捷键说明默认折叠**：首次打开时收起说明区，点击后展开，减少界面干扰
- **原始终端按钮常驻**：不再依赖 `nativeTerminalNeeded` 状态，按钮始终显示，方便随时切换

### 修复 | Bug Fixes
- **外嵌滚动跳顶**：打开终端浮层后内容不足一屏时，滚动事件误触发历史加载导致画面跳回顶部；增加 `scrollHeight ≤ clientHeight` 守卫
- **中断按钮不显示**：Agent 等长工具调用期间 PTY 状态可能短暂变为 idle，导致中断按钮消失；改用转录尾部 thinking/tool 条目检测实际工作状态
- **Loading 栏 token 未清零**：新一轮问答开始时记录基线 token，loading 栏显示本轮增量而非累计值
- **WorkGroupBlock 无最大高度（Fallout 主题）**：恢复 `fo-wg-scroll` 的 `max-height: 400px` 与纵向滚动（`border-radius: 0` 后已无椭圆裁剪问题）
- **Loading 栏隐藏（Sprouting 等未知状态词）**：PTY 状态正则改为：有 spinner 字符前缀时接受任意大写开头的词，不再要求白名单；无 spinner 时保留保守白名单
- **图片临时文件过早删除**：改为保留 2 分钟再清理（原 5 秒太短，导致 Claude Code 读取前已被删除）

---

## [0.7.1] - 2026-05-09

### 改进 | Improvements
- **Fallout 主题字体优化**：转录区正文改用 Share Tech Mono，小字号下比 VT323 更锐利清晰；VT323 保留给 loading bar、LEVEL UP 横幅等大字号装饰元素

---

## [0.7.0] - 2026-05-09

### 修复 | Bug Fixes

#### Telegram Bot
- **「Interrupted」级联修复**：bot 启动前先调用 Telegram API 清空积压消息队列（`getUpdates` drain），避免旧消息在重启后被重新投递、持续打断 Claude 处理
- **多 Bot 目录隔离**：`stateDirId` 未手动填写时，按 Bot Token 的 MD5 哈希自动生成唯一目录，防止两个窗口使用不同 Bot 时状态相互干扰
- **重复 Token 警告**：设置页 Telegram 预设列表中检测到相同 Bot Token 时显示醒目警告横幅

#### 外嵌模式 (Embed Mode)
- **`/mcp` 二级菜单卡死**：移除过度防御性的快照校验逻辑，子菜单内容现可正常渲染
- **按 Esc 后出现 Rewind 界面**：退出斜杠命令时减少发送的 Esc 次数（6→1），防止多余 Esc 触发 Claude Code 的 Rewind 功能
- **输入框与终端状态不同步**：引入 `subscribeSlashDone` pub/sub 机制，TUI 结束时自动重置 `slashInteractiveMode`，输入框立即恢复正常
- **发送斜杠命令后自动触发 Esc**：移除全局空闲计时器（原 1.5s），改为仅在收到非 TUI 内容时启动 800ms 去抖计时器，避免 TUI 未渲染前误判结束
- **切换到终端标签时不自动滚动到底部**：激活时先 fit 再延迟 200ms 调用 `scrollToBottom()`，确保滚动在布局完成后执行

---

## [0.6.9] - 2026-05-08

### 新功能 | New Features
- **新版本介绍弹窗**：安装或升级后首次启动时展示当前版本要点（可读后一键关闭，按版本号仅提示一次）
- **Telegram 配对说明**：安装说明弹窗内灰框改为面向用户的简短步骤；配对路径在未启用会话 Telegram 时仍可从全局预设解析，减少误读默认 `telegram` 目录

### 修复 | Bug Fixes
- **Windows PTY 子进程残留**：关闭标签或退出应用时对 PTY 根进程执行 `taskkill /T /F`，尽量结束 Bun / Claude 等子进程树

---

## [0.6.7] - 2026-05-06

### 新功能 | New Features
- **持久化 Shell 会话**：空控制台通过后台守护进程（detached PTY daemon）保持运行，重启 app 后自动恢复 lazygit 等 TUI 程序；跨平台（Windows/macOS/Linux），无需安装 tmux 等外部依赖
- **browser-tools MCP 修复**：内嵌浏览器未打开时 CDP 代理返回空列表，现在首次请求时自动打开浏览器

---

## [0.6.6] - 2026-05-02

### 修复 | Bug Fixes
- **MCP 配置路径修正**：修复 user-scope MCP 写入路径错误（应为 `~/.claude/.claude.json`），visual-agent 等 MCP 现在可被 CLI 正确读取
- **Worktree 创建修复**：`-b` 参数顺序错误导致 `invalid reference` 报错；改用主仓库 mainPath 而非 workdir，并在 baseBranch 无效时自动回退到 HEAD
- **Worktree 删除确认框**：原生 `confirm()` 弹窗导致窗口失焦，改为内联确认行，彻底解决点击后输入框无法聚焦的问题

### 新功能 | New Features
- **Worktree 已有分支模式**：分屏 Worktree 对话框新增「已有分支」tab，可将本地未使用分支直接挂载为 worktree，无需新建分支

---

## [0.6.3] - 2026-04-29

### 修复 | Bug Fixes
- **CLAUDE_CONFIG_DIR 指向全局 ~/.claude**：修复技能、MCP 配置、OAuth 凭据不可见的问题
- **旧隔离目录迁移**：首次启动自动将 `data/claude-session` 中的会话/插件数据合并到 `~/.claude`

---

## [0.6.2] - 2026-04-29

### 新功能 | New Features
- **开发者模式**：设置面板新增开关，开启后侧边栏显示日志面板，支持一键打开 DevTools
- **终端主题跟随**：终端背景色和 xterm 主题跟随应用暗色/亮色主题
- **技能系统增强**：额外技能目录支持根目录 skills/commands 文件夹自动 junction；修复扫描逻辑；文件夹技能可编辑保存
- **MCP 配置改进**：写入 .claude.json（CLI 正确读取位置）；自动从 settings.json 迁移旧配置；支持 streamable-http 传输

### 改进 | Improvements
- 插件「已安装」标签正确显示
- 宠物面板子标签栏不透明度提升
- 统计面板新增按 profile 分布饼图
- 14 天图表横向可滚动，日期标签完整显示
- 工作区删除分支错误处理优化

### 修复 | Bug Fixes
- 修复保存设置时覆盖主题的问题
- 修复主题持久化（重启后不再重置）
- 修复 token 用量统计 total/today 数据损坏
- 修复 history.lastUserPrompt ANSI 转义残留
- 修复自动更新器 CDN 传播 404 噪声
- 修复 anti-FOUC 脚本暗色模式

---

## [0.6.1] - 2026-04-27

### 新功能 | New Features
- **宠物对话功能**：可配置触发概率和 API，自动触发技术点评
- **多 API 配置**：支持多个 API profile，一键切换
- **自动重启**：更新后自动重启

### 改进 | Improvements
- userData 目录重定向到安装目录（便携版）

---

## [0.5.2] - 2026-04-28

### 新功能 | New Features

#### 多 API 配置支持 | Multi-API Profile Support
- 支持配置多个 API profile（不同的 API key、baseUrl、model）
- Support multiple API profiles with different API keys, base URLs, and models
- Tab 栏显示每个窗口使用的配置名，点击可切换
- Tab bar shows profile name for each window, click to switch
- 切换配置自动重启 PTY 应用新配置
- Switching profile automatically restarts PTY to apply new configuration
- 关闭软件后重开，session 记住使用的配置
- Sessions remember their profile after app restart

#### 费用估算按配置区分 | Per-Profile Cost Estimation
- 每个配置单独设置 input/output/cache 价格
- Each profile has its own input/output/cache pricing settings
- 统计面板显示各配置的用量统计
- Usage stats panel shows breakdown by profile

### 其他改进 | Other Improvements
- Settings 面板显示所有模型字段（Sonnet/Haiku/Opus/Subagent）
- Settings panel shows all model fields (Sonnet/Haiku/Opus/Subagent)
- 修复 onboarding 弹窗逻辑（检查 profiles 而非 flat authToken）
- Fixed onboarding overlay logic (check profiles instead of flat authToken)
- Dropdown UI 优化（portal 定位、点击空白关闭）
- Improved dropdown UI (portal positioning, click-outside-to-close)

---

## [0.5.1] - 2026-04-27

### 新功能 | New Features
- 宠物对话功能：可配置触发概率和 API
- Pet dialog feature with configurable trigger probability and API
- 实时用户问题捕获
- Real-time user question capture
- 更新自动重启功能
- Auto-restart after update

### 改进 | Improvements
- userData 目录重定向到安装目录（便携版）
- Redirect userData to install directory for portable builds