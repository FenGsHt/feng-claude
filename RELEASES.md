# Releases

> 每次版本更新时，将以下内容复制到 GitHub Release 中。
> Copy this content to GitHub Release on each version bump.

---

## v0.7.86 (2026-07-29)

### 修复
- **历史名称乱码**：过滤终端能力响应和鼠标报告，侧边栏不再把 `[<…M`、`[?…c`、`[?…$y` 等控制序列显示为历史名称
- **兼容已有历史**：旧版本已经保存的乱码会在读取时自动清理；有真实提问则恢复提问，只有控制序列则回退为文件夹名

---

## v0.7.85 (2026-07-29)

### 修复
- **跨平台打包恢复**：GitHub Actions 改用 Node.js 22.12，并更新 Electron 原生模块重建工具，修复 Electron 43.2.0 的 ABI 无法识别导致 Linux 构建退出的问题
- **构建任务相互独立**：关闭矩阵快速失败，一个平台构建异常时不再取消 Windows、macOS 和 Linux 的其他任务

---

## v0.7.84 (2026-07-29)

### 修复
- **macOS 终端启动可靠性**：zsh/bash 通过 shell 参数直接执行 Claude，不再模拟键盘输入，修复启动命令被截成 `ude`
- **终端控制码隔离**：历史滚屏回放过滤鼠标追踪、焦点、粘贴模式与终端查询，避免控制码污染新会话
- **开发版保持内嵌终端**：iTerm2 仅在 macOS 打包版启用，`npm run dev` 不再弹出外置窗口
- **iTerm2 回退修复**：修复 AppleScript 路径转义与 daemon 回退清理
- **Vite 热更新修复**：拆分 `XTerminal` 组件与终端运行时，消除 Fast Refresh 失效刷屏

---

## v0.7.83 (2026-07-28)

### 新功能
- **macOS 窗口生命周期优化**：`Command+W` 后保留应用与 PTY 会话，从程序坞重新打开时恢复原窗口
- **开发模式退出清理**：`Ctrl+C` 停止 `npm run dev` 时同步清理 PTY daemon 和本项目 Electron 进程

### 修复
- **窗口重开崩溃**：避免 IPC 与 BrowserView handler 重复注册
- **终端刷新乱码**：刷新只重绘画面，不再触发多余 PTY resize 和终端能力查询
- **Claude 重复启动**：移除不可靠的 shell prompt 自动重启判断，修复启动命令被截断为 `ude`
- **第三方 API 环境**：消除重复认证变量与异常输出预算，1M 上下文改用独立环境变量声明
- **macOS Electron 兼容性**：升级 Electron 至 43.2.0

---

## v0.7.82 (2026-07-11)

### 新功能
- **iTerm2 集成（macOS 打包版）**：设置中新增「使用 iTerm2」选项，启用后在 iTerm2 中打开终端而非内置 xterm。采用 daemon + relay 架构，feng-claude 创建 daemon session，通过 AppleScript 打开 iTerm2 窗口运行 relay 脚本连接 socket 代理 I/O。保留 session 管理、token 统计、scrollback 等功能。仅 macOS 打包版本显示该选项，开发模式隐藏

### 修复
- **Claude Code 运行时被误判为 shell prompt 导致重复启动**：进度条（`16%`）、权限选择菜单、思考状态（`Thought for`/`Waiting.` 等）被误判为 shell prompt，触发自动重启发送重复命令。增加 Claude 运行时特征检测
- **macOS 交通灯按钮遮挡侧边栏标题**：TitleBar 和 Sidebar 面板标题栏在 macOS 下左侧增加 70px padding
- **`posix_spawnp failed` 错误**：修复 node-pty `spawn-helper` 权限问题；增加 shell 路径验证和 workdir 回退逻辑

---

## v0.7.78 (2026-07-01)

### 修复
- **新用户无法替换第三方 API 地址**：Claude CLI 的 `~/.claude/settings.json` 里若有 `env` 块硬编码了 `ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY`（常来自第三方中转教程），会覆盖软件为每个会话注入的环境变量，导致换配置也「改不动」、请求仍打到旧地址报错。现在启动时自动剥离这三个冲突键（保留其它自定义变量、剥离前备份），软件内的 API 配置成为唯一真相源

---

## v0.7.77 (2026-06-25)

### 修复
- **单终端时终端只填一半高度（v0.7.76 回归）**：外层容器补上 `flex flex-col`，终端恢复撑满
- **重启后分屏组被拆成独立 tab**：持久化并恢复停泊的分屏组（`parkedLayouts`），重启后分屏不再丢失

---

## v0.7.76 (2026-06-25)

### 修复
- **打开文本编辑器时左侧 CC 终端变黑**：`TerminalPanel` 改为始终保持同一树位置，开/关 txt 不再重挂载终端
- **两终端切换后地址栏显示旧 URL**：地址栏更新改按「当前实际显示的浏览器 view」判断，不再受 `foregroundSessionId` 错位影响

---

## v0.7.75 (2026-06-23)

### 修复
- **Token 归属错误（同目录多窗口 / shell-only）**：同目录开官方窗口 + 另一个仅跑 lazygit 的第三方配置窗口时，claude token 被错记到该第三方配置桶。修复：shell-only 会话不再抢占 token 归因 primary；并让 `claude-*` token 在被标到非 claude 第三方配置时归回官方

---

## v0.7.74 (2026-06-22)

### 界面
- **TabBar 满宽 + 调试浏览器/Office 面板下移到 TabBar 之下**：调试浏览器/Office 面板出现时不再把 TabBar 挤成一块；TabBar 横跨整行，两个右侧面板整体排到 TabBar 下方

---

## v0.7.73 (2026-06-22)

### 修复
- **收藏当前页收藏错页面**：「收藏」改由主进程从实时 webContents 解析 URL+标题，修复 SPA 路由切换后收藏成旧页面/bing 首页的问题

### 界面
- **配置/Telegram 徽章迁移到终端头部**：两枚药丸从 tab 内移到 pane 头部标题右侧（作用于该 pane 会话），tab 瘦身、窗口可更窄；抽出 `SessionConfigBadges` 组件，行为不变

---

## v0.7.72 (2026-06-22)

### 新功能
- **模型 1M 上下文声明**：API 配置的 默认/Sonnet/Opus 模型行新增「1M」勾选，勾上后给模型名追加 `[1m]` 后缀，向 Claude Code 声明 1M 上下文（Claude Code 发给上游前会剥掉，第三方端点收到的仍是原模型名）。仅第三方配置生效，官方配置不受影响
- **非 CC（shell-only）终端不自动创建调试浏览器**：浏览器面板打开时切到 shell-only 终端不再自动建 tab（保持显示上一个会话的网页），手动按钮仍可打开

### 修复
- **标签组互切时终端显示另一个会话的旧内容**：`XTerminal` cleanup 时把旧会话的终端 DOM 元素从容器摘除，修复无 key 复用组件导致的旧元素残留

### 界面
- **移除失效的「上下文窗口」字段**：该数字框从未注入 Claude Code，已删除；声明上下文能力改用「1M」勾选

---

## v0.7.71 (2026-06-18)

### 修复
- **切换配置时 xterm 鼠标崩溃**：`destroyTerminal` 在 `dispose()` 前先移除终端 DOM 元素，避免 `_renderService` 已销毁时 `mousemove` 仍在派发导致 `Cannot read properties of undefined (reading 'dimensions')` 报错

---

## v0.7.70 (2026-06-17)

### 修复
- **回退 Canvas 渲染器**：多终端时 Canvas 渲染器造成卡死（关掉一个终端才恢复）/ 切换花屏 / 分屏 TUI 溢出，已回退到稳定的 DOM 渲染器；保留 header 订阅收窄优化
- **焦点被调试浏览器抢走**：重试式 focus 加 `document.hasFocus()` 守卫，主窗口没焦点不抢
- **分屏后 TUI 超出 pane 被截断**：叶子集合变化时强制所有窗格按当前尺寸重新 fit

---

## v0.7.69 (2026-06-17)

### 修复
- **Alt+E/R 切换后终端不刷新 / 画面错乱**：Canvas 渲染器 reparent 后残留空白/旧帧的回归。新增 `refreshTerminalView`（先 fit 再 refresh，跨帧兜底），在终端 reparent 与变 active 时调用，覆盖聚焦/非聚焦窗格

---

## v0.7.68 (2026-06-17)

### 修复
- **Alt+E/R / Alt+F 切换后焦点不在输入框**：改为重试式 focus，扛住停泊分屏布局还原时终端/composer 重挂载的时序；点击窗格也补一次稳健 focus

### 性能
- **多终端渲染优化**：xterm 改用 Canvas 渲染器（适合多终端，不占 WebGL context 配额，失败回退 DOM）
- **分屏 header 重渲染优化**：`TerminalPaneHeader` 不再订阅整个 sessions/history 数组，只在自己会话变化时重渲染

---

## v0.7.67 (2026-06-17)

### 修复
- **统计面板成本仍用老算法修复**：「统计」侧栏的汇总卡费用、今日明细分项费用、柱状图 tooltip 每日费用统一改为按模型定价（官方 Claude vs 第三方分开），不再用单一价格混算

### 界面
- **顶部 tab 宽度收紧**：内边距/间距/最小宽下调，徽章加最大宽截断，整体更紧凑

---

## v0.7.66 (2026-06-16)

### 修复
- **分屏拖动比例切换窗口后重置**：split 比例现在存进布局树，随停泊/还原保留，Alt+E/R 切走再切回不再重置成五五分

---

## v0.7.65 (2026-06-16)

### 新功能
- **Alt+F 窗口内终端切换**：`Alt+E/R` 改为窗口（tab 组）间切换，不再钻进分屏副窗格；`Alt+F` 在当前窗口内的多个终端（分屏窗格）间循环

### 修复
- **分屏窗格 Alt+E/R 切走丢失**：新增停泊机制，切走暂存分屏组、切回还原整组，不再脱离成独立 tab
- **tab 栏分屏组重复显示**：分屏组只显示一个主 tab，隐藏副窗格
- **底部 MODELS 价格随激活配置变动**：每个模型固定用其所属 profile 的定价

---

## v0.7.64 (2026-06-16)

### 修复
- **Token 归因串号修复**：第三方模型（qwen/glm 等）的 token 不再因 workdir primary 归因漏进「官方配置」桶；新增模型守卫，归到官方但 model 非 `claude-*` 时按 model 唯一匹配改归正确 profile（零误伤）。仅修新产生 token，历史数据需手动重置

---

## v0.7.63 (2026-06-16)

### 新功能
- **浏览器克隆工具大幅增强（SPA 静态复刻全链路）**：
  - 新增 `browser_clone_routes`（按显式路由列表批量克隆，解决 hash 路由发现不到）、`browser_save_html`（直接存 HTML 到文件）
  - `clone_page` 支持 `outputFile` + hash 路由命名，多路由不再互相覆盖
  - `stripJs` 静态快照模式：剥除脚本避免框架重渲染擦除内容
  - 导航 shim 三层拦截：`<a href>` / data-* 路由属性 / 自定义 clickRules（覆盖 div+JS 路由 tabbar）
  - serve-local 路由→文件 rewrite（`routes.json`），把 `/promo` 等路由路径反查回克隆文件，拦得住框架自身改 URL
  - 新增 `routeFix` 开关交给调用方控制

### 修复
- 克隆页导航连不上（wired 0）：href 重写覆盖 hash/路径，注入捕获阶段点击 shim
- route-fix 加执行守卫，支持 hash 路由
- browser_screenshot 间歇失败自动重试；serve-local 禁用缓存

---

## v0.7.62 (2026-06-16)

### 修复
- **文件侧边栏漏显示文件夹**：文件树与搜索改用更宽松的显示规则（只隐藏 `node_modules`/`.git`/`.svn`/`.hg`），dot 文件夹及 `build`/`dist`/`temp`/`library` 等与系统资源管理器一致地显示；watcher 仍忽略高频变动目录避免狂刷新

---

## v0.7.61 (2026-06-15)

### 修复
- **调试浏览器/DevTools 聚焦时 Alt+E/R 失效**：主进程在浏览器 tab 与 DevTools 的 webContents 上拦截 Alt+E/R 并转发渲染端，焦点在浏览器/DevTools 时也能切换会话
- **切换会话/标签时 DevTools 被关掉**：DevTools 改为 per-tab 持久，切换不再强关，切回时仍在

---

## v0.7.60 (2026-06-15)

### 修复
- **Telegram 多窗口消息投错窗口**：新增跨实例 owner 文件锁，同一 token 全局只允许一个 app 实例轮询，其它窗口的会话自动退避；持有实例退出后锁自动失效；强制重连（↻）夺锁，让当前窗口成为 owner，消息只投递到该窗口

---

## v0.7.59 (2026-06-15)

### 修复
- **Telegram -32000 根治**：强制重连改为枚举并清掉所有 telegram 插件 bun 进程（含 bot.pid 追踪不到的孤儿 server.ts），解决多 server 抢同一 token 导致的 409/-32000；`/plugin` 重连延时 2.5s 让 Telegram 释放旧轮询槽

---

## v0.7.58 (2026-06-15)

### 新功能
- **宠物"看到现场"**：点评时新增 Claude 最近回答的摘要进上下文，不再盲评
- **宠物报错哨兵**：会话报错时强制触发、冷却减半，优先给排错方向
- **宠物建议可一键执行**：回复中反引号包裹的命令显示「▶ 命令」按钮，点击填入当前终端
- **宠物成本/Git 哨兵**：单轮输出 token 偏多时提示成本；新增 `git:dirtyCount`，未提交改动多时提醒 commit

### 修复
- **宠物输入污染修复**：剥离鼠标跟踪等 ANSI/控制序列，避免被当成"用户问题"喂给宠物

### 性能
- **宠物日志上限 500 → 200**：减小每次写入的全量重写体积

---

## v0.7.57 (2026-06-15)

### 新功能
- **搜索结果"在文件树中定位"**：文件侧栏搜索结果右键菜单新增「在文件树中定位」，点击清空搜索并级联展开文件树到该项，平滑滚动并短暂高亮；菜单还提供复制绝对路径、在文件管理器中打开、@ 引用到终端

---

## v0.7.56 (2026-06-15)

### 新功能
- **文件侧栏全树搜索**：搜索时后端递归遍历整个工作目录，返回扁平结果（文件名 + 相对路径），三级以上深层文件也能搜到；跳过 `node_modules`/`.git` 等并带上限保护
- **文件侧栏自动刷新**：chokidar 监听文件增删/重命名自动刷新文件树，静默刷新保留已展开文件夹状态

### 界面
- **录制/回放合并按钮**：⏺ 录制与 ▶ 回放合并为一个导航按钮；hover 在按钮正下方弹出下拉，直接点击即开始录制，录制中不弹下拉
- **回放面板样式修复**：补回 header/滚动区/空状态样式
- **隐藏终端标签栏 token 统计**：详细统计移至侧栏 Stats 面板查看

---

## v0.7.55 (2026-06-15)

### 界面
- **调试浏览器导航栏 SVG 图标统一**：后退、前进、刷新、收藏、录制、回放、拾取、DevTools、新标签、关闭按钮全部替换为 Feather 风格 SVG 图标，替代原有 Unicode 字符（◀ ▶ ⟳ ☆ ⏺ ⊕ ⌘ + ×）

---

## v0.7.54 (2026-06-15)

### 修复
- **URL 历史下拉正确展开**：通过 IPC 撑高 navView 使下拉不被裁剪；样式改为两行（标题 + 蓝色 URL）+ 地球图标
- **移除冗余历史面板**："更多"菜单及旧历史面板已删除，历史功能统一由 URL 下拉提供

---

## v0.7.53 (2026-06-15)

### 新功能
- **调试浏览器网页收藏**：ctrl-row 新增 ☆/★ 按钮收藏/取消收藏当前页；收藏栏（导航行下方第三行，横向滚动）快捷点击跳转，× 取消收藏；收藏持久化到 `browser-bookmarks.json`
- **URL 输入框历史下拉**：点击地址栏自动展开历史记录下拉列表，支持输入文字实时过滤；↑↓ 键导航，Enter 跳转，Escape 关闭

---

## v0.7.52 (2026-06-15)

### 修复
- **主进程启动崩溃修复**：`browserViewManager.ts` 中 `is.dev` 引用未导入导致 `ReferenceError: is is not defined`，改用 `app.isPackaged`

---

## v0.7.51 (2026-06-13)

### 文档
- **FEATURES.md 全面补全**：完整收录所有 42 个浏览器 MCP 工具（标签页管理、网站克隆、截图差异对比、JS 执行、Routine 录制/回放）；补全缺失快捷键 Alt+E/R、Alt+↑/↓、Alt+M、Ctrl+P、Ctrl+F、Shift+Enter；新增文本编辑器专区、语音输入专区、会话创建选项（Resume/Shell-only）

### 修复
- **Token 归属修复**：同目录多 session 共享 watcher 时，全局 token 归因改为跟踪最近创建的 session（primarySessionId），修复重启会话后 token 误计入旧 profile 的问题
- **会话重启保留调试浏览器**：新增 `migrateSessionBrowser`，重启时把旧 session 的浏览器 tab 迁移到新 session，避免调试浏览器被重置到初始页面
- **分屏拖动同步**：拖动分屏分隔线改变 splitRatio 或 toolsPanelWidth 时，同步更新所有后台 session 的调试浏览器 bounds
- **DevTools 重载不抢前台**：调试浏览器 DevTools 重新加载页面时，检测同 URL 重载并抑制主窗口 focus 激活，避免应用被弹到前台

### 重构
- **useDragResize hook**：AppShell 三处拖动缩放（侧栏、编辑器分屏、调试浏览器面板）抽取为通用 hook

---

## v0.7.50 (2026-06-13)

### 修复
- **统计面板费用修正**：官方配置的费用改用 per-model 精确定价（Opus ¥35/M、Sonnet ¥21/M、Haiku ¥7/M），不再使用默认的 ¥3/M，修复统计页显示费用严重偏低的问题

---

## v0.7.49 (2026-06-13)

### 新功能
- **FEATURES.md 功能手册**：新增完整功能与快捷键文档，双语（中/英），涵盖所有侧栏面板、API Profile、Token 统计、Telegram Channel、调试浏览器、Git Worktree、ASCII 宠物、MCP/Skills/插件、快捷键速查
- **标题栏 `?` 帮助按钮**：右上角新增 `?` 按钮，点击直接打开 GitHub FEATURES.md

---

## v0.7.48 (2026-06-13)

### 新功能
- **Telegram 强制重连**：Settings → Telegram Channel 右上角新增 `↻` 按钮，一键 kill 旧 bot、清 bot.pid、触发 `/plugin` 重连，解决跨会话 PID 占用的 -32000 问题

### 修复
- **cacheCreate 占位**：隐藏时改用 `hidden` 而非 `opacity-0`，修复 Models 分项换行问题

---

## v0.7.47 (2026-06-13)

### 修复
- **Telegram bot.pid PID 复用误判**：`cleanStaleBotPid` 现额外核验进程命令行含 "telegram"，防止 OS 将旧 bot PID 分配给无关进程时误判为 bot 在线（导致 `/plugin` 重连 -32000）
- **cacheCreate Token 不可见**：Token 统计的 Today/Total 及 Models 分项默认隐藏 cacheCreate（☁），悬浮时淡入，Opus 高费用来源现在透明可见

---

## v0.7.46 (2026-06-13)

### 修复
- **Telegram bot.pid 残留**：启动 Telegram channel 前检查 `bot.pid` 里的进程是否存活，仅在进程已死时清除，避免旧 PID 文件导致插件连接失败（-32000）

---

## v0.7.45 (2026-06-13)

### 修复
- **Routine 回放列表为空**：补齐调试浏览器切换前台 session 的渲染侧接线（此前漏提交），切回对应项目终端即可看到该项目录制的 routine

### 界面
- **Token 统计「累计」标识**：Models 分项仅有累计数据时显示「累计」小标，区分今日与历史累计

---

## v0.7.44 (2026-06-13)

### 新功能
- **调试浏览器 Routine 录制/回放**：把浏览器操作录成项目级 routine，AI 或用户直接回放，免去逐步推理。支持 navigate/click/type/select/sleep/wait_for/evaluate 七种动作、`${var}` 参数化、evaluate 抓数据、失败步定位
  - 导航栏 ⏺ 录制按钮（红点+步数+命名条）、▶ 回放按钮（弹列表点击回放）
  - 5 个 MCP 工具：record_start/stop、list/run/delete

### 修复
- **Token 计算偏多**：同一 assistant message 在 JSONL 里多条记录带相同 usage 快照被重复累加，cacheRead/output 多算 40~56%；现按 message.id 去重
- **evaluate 字段名容错**：回放器接受 js/javascript/expression/code、variable/var，纯表达式自动 return
- **`window.prompt` 在 Electron 不可用**：录制命名改用内联输入条
- **导航栏下拉被裁剪**：菜单/面板统一撑高 navView 显示
- **多窗口最大化后台浏览器越界**：resize 时同步后台 tab 坐标

### 界面
- **导航栏整理**：关闭按钮移到标签条右侧；历史收进 ⋯ 更多菜单；窄面板控制行横向滚动
- **浏览历史面板**：分组+时间+清除全部
- **调试浏览器多 tab 按 session 隔离**：每个终端独立 tab，切终端自动切浏览器，后台仍可截图

### clone-website
- **SPA 完整克隆提醒**：工具描述补充——只克隆首页会漏掉懒加载的路由组件 chunk，复刻完整站点须遍历所有路由

---

## v0.7.43 (2026-06-11)

### 修复
- **官方定价按模型 ID 判断**：中转站 profile 里调用的真 Claude 模型（Opus/Sonnet）现按官方定价表计算，第三方模型按自定义单价，同一 profile 混用各自算对
- **标签徽章模型名快照**：启动时快照 profile 名称，设置里改名/换模型不再影响已运行的会话徽章
- **新目录卡在 `--continue`**：无对话历史的目录不再带 `--continue`，避免停在空 shell

### clone-website 工具链改进
- **本地 server 按原始路径 serve**：靠 manifest 映射 `/static/...` 等原始路径，无需重写 JS 内部路径
- **API 录制自动遍历点击**：克隆时自动点击导航/分类/Tab 录入懒加载 API，离线回放时分类不再空白
- **`browser_click` 派发完整事件序列**：正确触发 Vue/React 的事件处理器

---

## v0.7.42 (2026-06-11)

### 修复
- **第三方模型被错误按 Sonnet 计费**：`qwen3.7-plus` 等非 Claude 官方模型被按 Sonnet 价格计算；现改为只有 `claude-*` 模型走官方定价表，第三方模型用设置里的自定义价格
- **Fable/Mythos 模型计价缺失**：补上 Fable 5 / Mythos 5 的模型识别与定价
- **MODELS 模型名显示过短**：第三方模型显示完整 modelId，官方模型显示版本号（Opus 4.8、Fable 5 等）

---

## v0.7.41 (2026-06-11)

### 修复
- **累计费用漏算历史 token**：per-model 追踪上线前的旧会话 token 仅存在 `total` 不在 `perModel`，导致累计费用严重偏低；现补足未追踪部分（差额用 singlePricing 计算），累计费用与实际消耗对齐

---

## v0.7.40 (2026-06-11)

### 修复
- **clone-website 其他页面内容被覆盖**：SPA 克隆后非首页被 Router 重渲染覆盖；注入路由修复脚本在 SPA 初始化前恢复正确路径，各页面内容正确显示
- **`browser_clone_site` 一键批量克隆**：自动发现页面 → 逐页克隆 → 起预览服务器 → 逐页相似度 → 导航接线，一次调用完成全站克隆；SPA 支持 API 录制回放（XHR/fetch 存档 + replay-shim，tabs/弹窗/路由离线可用）
- **`browser_patch_element` 加 `applyTo`**：传入 HTML 路径后自动写入，无需手动粘贴
- **MODELS 区块改为今日数据**（之前显示累计）
- **今日/累计费用与 MODELS 定价对齐**：改用 per-model 独立定价，Opus 不再被 Sonnet 单价低估

---

## v0.7.39 (2026-06-10)

### 新功能
- **clone-website MCP 工具**：5 个新内置工具一键复刻网站，支持多页面、CSS全量导出、URL自动重写、导航链接修复
  - `browser_site_pages` — 发现站点所有页面
  - `browser_clone_page` — 完整克隆（资源捕获 + CSS + DOM + URL重写）
  - `browser_serve_local` — 内置静态服务器预览
  - `browser_patch_element` — 提取元素计算样式 → 即粘即用 `<style>` 补丁
  - `browser_wire_navigation` — 批量修复所有页面内部导航链接
- **clone-website skill 升级**：5 步工具调用流程，支持 Agent 审查模式；每次启动自动覆盖更新至最新版

### 改进
- **MODELS 可折叠**：per-model 细分区块支持折叠/展开
- **MODELS 显示缓存命中**：每个模型行显示 `⚡` cacheRead 数据
- **MODELS 计价修正**：非官方配置时使用 profile 自定义价格

---

## v0.7.38 (2026-06-09)

### 新功能
- **Per-model token 细分**：按 Opus/Sonnet/Haiku 分别统计用量和费用
- **货币改为人民币**：`$` → `¥`

### 修复
- **配置切换后 token 统计错误**：切换 profile 时同步更新 session 的 profileId
- **Opus 定价过时**：更新为 Opus 4.8（¥35/¥175）

---

## v0.7.37 (2026-06-09)

### macOS 兼容性
- **双架构构建**：dmg 同时产出 Apple Silicon (arm64) 与 Intel (x64)
- **快捷键支持 Cmd 键**：Ctrl+Shift+D/Q/C 在 Mac 上可用 Cmd 触发
- **未签名分发**：下载 dmg 后首次打开需「右键 → 打开」或 `xattr -cr`

### 改进
- **ConPTY 默认开启（Windows）**：默认使用 ConPTY 改善 TUI 显示，可在设置中关闭

---

## v0.7.36 (2026-06-06)

### 新功能 | New Features
- **触发器侧边栏**：建多个触发器，到点自动向当前活跃会话发指令或跑待办清单；倒计时 / 定时刻 / 重复间隔三种时机；启动/停止开关 + 实时倒计时（仅应用运行期）

### 改进 | Improvements
- **待办状态自动回传**：Claude 在回复末尾输出 `todo-status` 状态块（按序号），GUI 实时解析更新，无需手动同步；同一块只应用一次，不覆盖用户后续改动
- **运行用序号而非内部 id**：避免 Claude 把 UUID 误当成任务系统 ID 去查找而误判需澄清

### 修复 | Bug Fixes
- **待办/触发器持久化丢失**：改存主进程稳定路径（getConfigDir/kv）+ 同步读写，消除异步水合竞态导致的「重开即空」；便携/升级后仍在
- **「Task completed」通知狂弹**：去重改按项目 + 15 秒全局冷却，多标签/分屏不再一次弹很多条

---

## v0.7.35 (2026-06-05)

### 新功能 | New Features
- **待办清单（TodoList）侧边栏**：新增「待办」面板，可建多个全局可复用的命名清单，每个清单独立增删/编辑/折叠/重命名
- **一键交给 Claude 执行**：每个清单两个运行按钮 —— ▶「运行待办」只发未完成项；▶▶「全部重跑」整单重置后执行。运行会写入项目根 `.feng-todos.md` 并自动发给当前活跃会话
- **四种状态**：待办 / 完成 / 失败（`[!]`+原因）/ 需澄清（`[?]`+AI 疑问）。需澄清项面板内联回复，补充后把「待办+疑问+答复」发回 Claude
- **自动同步**：会话每轮结束自动回读 `.feng-todos.md` 刷新状态；条目用隐藏 id 匹配，文本改写不丢
- **运行目标提示 + 运行中标识 + 二次确认**：明示发给哪个终端；运行中脉冲标识；删除/全部重跑需点「确认」
- 写文件前自动追加到项目 `.gitignore`，不污染用户仓库

---

## v0.7.34 (2026-06-04)

### 修复
- **拾取后中文 IME 概率失效**：`compositionend` 清空 IME pending 状态 + 延迟加长 + 二次 focus 兜底，消除概率性退格问题

---

## v0.7.33 (2026-06-04)

### 修复
- **元素拾取器输出精简**：只输出开头标签，不再输出完整 outerHTML
- **拾取后中文 IME 失效**：额外 click() 触发 IME 激活

---

## v0.7.32 (2026-06-04)

### 修复
- **TUI 显示异常**：移除 `convertEol: true`，修复 lazygit/vim 光标乱跳和残影问题
- **Windows ConPTY 开关**：设置页可切换 ConPTY/WinPTY，进一步改善 TUI 兼容性
- **截图对比相似度虚高**：缺失区域计入差异，内容区权重 ×3
- **文本编辑器 Esc 误关闭**：Esc 只关闭子面板，不关闭编辑器

---

## v0.7.31 (2026-06-04)

### 新功能
- **调试浏览器记忆 URL**：重启后自动恢复上次页面
- **`browser_capture_resources`**：CDP 抓取目标网站全部资源到本地，生成 manifest.json
- **`clone-website` 内置 skill**：启动自动安装，完整网站复刻工作流
- **`browser_screenshot_diff`**：像素级截图对比，返回相似度 + 差异高亮图
- **Tab 切换自动滚动**：激活 Tab 自动滚入可视区

### 修复
- **长文本粘贴截断**：PTY 写入分块（2048字/块，15ms间隔），避免 ConPTY 缓冲溢出
- **文本编辑器 Esc 误关闭**：Esc 不再关闭编辑器本体

---

## v0.7.30 (2026-06-04)

### 新功能
- **`browser_scroll` deltaY 参数**：相对滚动触发懒加载，`deltaY: 800` 向下滚一屏
- **`browser_get_text` maxLength 参数**：默认上限提升至 30000 字符，可自定义

---

## v0.7.29 (2026-06-04)

### 修复
- **Alt+R 切换会话无效**：主进程误拦截了 Alt+R 导致按键无法到达 renderer，已修复

---

## v0.7.28 (2026-06-04)

### 新功能
- **`browser_eval_in_frame`**：通过 CDP isolated world 在跨域 iframe 内执行 JS，`frameUrl` 匹配目标 frame，突破同源限制
- **Alt+E/R 切换会话**：快捷键调整为 Alt+E（上一个）/ Alt+R（下一个）

### 修复
- **Telegram 多会话路由**：多个 CC 终端同时打开时，只有第一个获得 bot 控制权，消息不再随机路由

---

## v0.7.27 (2026-06-03)

### 修复
- **元素拾取器完整输出**：移除所有截断限制，outerHTML 和 innerText 原样输出

---

## v0.7.26 (2026-06-03)

### 新功能
- **Ctrl+Shift+E/R 切换会话**：快速在多个终端标签页/分屏间切换，E 切上一个，R 切下一个
- **浏览器 MCP iframe 支持**：新增 `browser_get_frames`（列出所有 iframe 坐标）、`browser_click_at`（坐标点击，可穿透 Cloudflare Turnstile/reCAPTCHA 等跨域 iframe）；`browser_eval` 新增 `frameSelector` 支持同源 iframe 内注入 JS

### 修复
- **元素拾取器文本截断**：注入草稿前剥离 base64 data URL，修复外嵌输入框和经典终端均出现的截断问题

---

## v0.7.25 (2026-06-02)

### 修复
- 切换配置后终端显示异常，自动刷新无需手动操作
- 升级通知定位在浏览器面板左侧，不再被遮挡
- 元素拾取发送后自动聚焦外嵌输入框
- 预览终端滚动失效修复

---

## v0.7.24 (2026-06-02)

### 新功能
- **终端悬浮预览**：悬浮「显示终端」按钮时弹出终端预览，带淡入淡出动画，位于按钮区上方

### 修复
- 分屏弹窗被内嵌浏览器遮挡

---

## v0.7.23 (2026-06-02)

### 新功能
- **元素拾取器升级**：点击后显示可交互父级面包屑链，蓝色确认按钮浮于高亮元素旁

### 修复
- 确认按钮点击无效（捕获阶段事件拦截）
- token 多标签重复计费
- 完成通知每轮只发一次

---

## v0.7.22 (2026-06-02)

### 修复
- **缓存 token 重复计费**：多标签打开同一目录时，token 计费不再翻倍

---

## v0.7.21 (2026-06-01)

### 修复
- **多配置 baseUrl 全局化**：切换 tab 配置时 baseUrl 不再被全局配置覆盖，每个 session 使用自己的 baseUrl
- **多配置 model 混用**：切换配置后 `/model` 列表不再混入旧配置的模型名

---

## v0.7.20 (2026-06-01)

### 修复
- **配置切换 model 混用**：切换 API 配置后 `/model` 列表不再混入旧配置的模型名
- **打包版主题初始化失败**：CSP `script-src 'self'` 白名单加入 anti-FOUC 脚本 hash，主题检测恢复正常

---

## v0.7.19 (2026-06-01)

### 修复
- **Token cacheRead 约两倍**：过滤流式快照中间条目，cacheRead 计数与 CC 内置 `/usage` 对齐
- **官方配置 token 未归属**：图表新增 `displayProfiles()` 包含虚拟 profile，官方配置用量正确归属
- **系统通知多次触发**：改为 idle 后延迟 8 秒发通知，工具调用期间若重新 running 自动取消
- **React #310 崩溃**：修复 `UpdateNotification` 中 `useFocusWindow` 在 early return 后调用的 Hooks 规则违反
- **热力图被内嵌浏览器遮挡**：弹窗打开时自动隐藏原生 WebContentsView，关闭后恢复

### 调整
- 移除标题栏 Tool call 侧边面板按钮
- 「外嵌输出 BETA」关闭时隐藏终端外嵌切换按钮
- 浏览器元素拾取按钮 tooltip 补充快捷键说明 `(Ctrl+Shift+Q)`

---

## v0.7.18 (2026-05-28)

### 新功能 | New Features
- **终端刷新按钮**：终端标题栏新增 ↺ 刷新按钮，单击立即重绘终端画面；lazygit / vim 等 TUI 出现乱码时可快速恢复
- **所有弹窗/浮层自动置前**：`useFocusWindow` hook 扩展至所有 11 个覆盖层组件，打开设置、更新通知、热力图统计等界面时主窗口均自动浮到最前，防止被 detach DevTools 窗口遮挡

### 修复 | Bug Fixes
- **TUI 画面多项修复（lazygit / vim / htop）**：
  - 切换标签立即刷新 canvas（解决第一帧残留旧画面）
  - 交替屏幕标签强制发送 SIGWINCH（确保 TUI 正确响应尺寸）
  - 分屏布局切换后补一帧 `refresh()`（消除新分屏显示旧 lazygit 内容）
- **Windows ConPTY exit-259 修复**：打开调试浏览器后不再触发 PTY 意外断开（exit code 259 `STILL_ACTIVE`）；改为仅在窗口未聚焦时调用 `win.focus()`，移除 `win.moveTop()`

---

## v0.7.16 (2026-05-27)

### 新功能 | New Features
- **Ctrl+P 文件搜索**：文本编辑器内按 Ctrl+P 弹出浮动文件搜索框，输入关键词实时过滤当前项目下所有文件；文件名匹配优先于路径匹配，↑↓ 导航，Enter / 点击打开，Esc 关闭；文件列表首次加载后按项目缓存，再次打开即时显示，图片文件自动进入预览模式
- **官方配置（Official Profile）**：API 配置下拉新增「官方配置」虚拟选项，选中后启动 Claude Code 不注入任何 `ANTHROPIC_*` 环境变量，使用 `~/.claude/` 中自身存储的凭证（兼容 `claude login` OAuth 流程）
- **TUI 应用显示修复（lazygit / vim / htop 等）**：切换标签或唤醒浮窗时不再强制滚动终端视口，彻底解决普通屏幕 scrollback 透过交替屏幕造成的乱码问题
- **分屏弹窗遮挡修复**：新增 `app:focusWindow` IPC，分屏目录选择弹窗打开时自动将主窗口移至最前，防止被 detach DevTools 窗口遮挡

### 修复 | Bug Fixes
- 官方配置 `__official__` 作为 profileId 传入主进程时直接解析为官方 profile，不再错误回退到全局激活配置
- 官方配置启动 PTY 时保留 `CLAUDE_CODE_OAUTH_TOKEN`，OAuth 登录凭证正常生效

---

## v0.7.15 (2026-05-27)

### 性能 | Performance
- **文本编辑器大幅提速**：修复打开大文件时按键明显卡顿的问题
  - 行号渲染：从每行一个 React `<div>`（万行文件 = 万个 DOM 节点）改为单一文本节点，按键重渲染开销降至接近零
  - Ctrl+F 查找：匹配坐标计算从 O(n×m) 改为单次 O(n) 扫描（n=文件长度，m=匹配数），搜索高频字符（如 "a"）不再卡顿
  - 光标位置：回调不再依赖 `content` state，每次按键不重建函数，改用简单计数循环
  - 文件大小：不再每次按键运行 `TextEncoder` 对全文编码，改用字符数估算

---

## v0.7.14 (2026-05-26)

### 新功能 | New Features
- **图片预览**：文件树双击 png / jpg / jpeg / gif / webp / svg / avif / bmp / ico / tiff 等格式，在分屏窗格内直接预览；与文本编辑器共用同一分屏布局，支持左右 / 上下切换方向、Esc 关闭
- **文本编辑器增强**：
  - 保存失败红色提示条（权限不足等原因不再静默丢失）
  - 底部状态栏：行 / 列 / 总行数 / 文件大小（参考 VSCode 底部栏）
  - Header 新增"从磁盘重新加载"按钮，外部修改文件后可一键 reload
  - 行号显示，宽度随文件行数自动伸缩
  - Ctrl+F 内联查找：精准字符级高亮（绝对定位色块，测量实际字符宽度）、Enter/F3 翻页、当前匹配更亮
  - Tab 键插入 2 个空格，保持光标位置

### 修复 | Bug Fixes
- **查找高亮位置偏移**：高亮色块改为绝对定位 div，启动时从 textarea 计算真实字符宽度；关闭折行（`wrap="off"`）保证每行高度恒定，彻底解决长行导致的偏移问题
- **分屏对话框"打开文本文件"**：新建分屏时底部新增直接按钮，可在编辑器打开文本文件，无需退出对话框再操作

---

## v0.7.13 (2026-05-12)

### 新功能 | New Features
- **文本文件编辑器**：文件树双击文本文件在右侧分栏打开；支持语法高亮、行号显示、Ctrl+F 搜索、保存状态栏、未保存关闭警告、一键重载；与浏览器预览面板独立分栏，互不遮挡

### 修复 | Bug Fixes
- **外嵌进程退出检测**：PTY 进程退出或异常时底部出现红色提示条，输入框自动禁用，提供「重启 Claude」按钮一键恢复会话

### 性能 | Performance
- **外嵌历史水合限速**：打开外嵌时只读最近 25 个 JSONL 文件（按 mtime）且总量不超过 8 MB；修复长期使用后目录积累数百文件导致打开外嵌卡顿的问题

---

## v0.7.12 (2026-05-12)

### 新功能 | New Features
- **OfficeCLI 内置 MCP**：自动下载 office-cli 二进制并注册为 MCP，支持 docx/xlsx/pptx 读写；MCP 设置面板新增状态卡片，显示版本号、下载进度，支持一键检查更新
- **宠物进食动画**：喂食时根据食物播放专属动画 —— 小饼干 3 帧轻快啃咬、小鱼干 4 帧热情猛嚼、豪华套餐 4 帧慢享盛宴；猫咪/机器人/龙/幽灵各有专属帧；台词从多句随机抽取
- **外嵌进程退出检测**：PTY 进程 `exited`/`error` 时底部出现红色提示，输入框自动禁用，「重启 Claude」按钮一键重启 PTY 并原地恢复会话
- **外嵌上下文用量环形图**：输入框右侧显示上下文占用百分比环形图；优先读取状态栏 N/M 精确值，次选百分比，兜底 JSONL 累计估算；75% 变橙、92% 变红

### 修复 | Bug Fixes
- **Agent 工具调用完整显示**：外嵌转录中 Agent/Explore 历史调用不再显示红色「no call data」；toolInput 现直接写入 transcript entry，不依赖 toolCallStore 跨存储查询；prompt 最多展示 600 字符
- **外嵌代码框主题适配**：bash/Agent prompt/通用参数框改用 CSS 变量 (`--theme-tool-bg` 等)，浅色主题下颜色正常
- **宠物食物扣费重启复原**：`lastCoinSyncCost` 加入持久化；修复重启后基准归零导致 `syncGameCoins` 把已消耗游戏币全部补回、购物相当于免费的 bug

### 改进 | Improvements
- 宠物 ASCII 全面升级：4 行格式、等级分档尺寸、饥饿系统与食物商店、颜色对比度提升、气泡浮动弹出
- 宠物内容库改为每周批量拉取 40 条，集成 Claude Code 使用技巧

---

## v0.7.9 (2026-05-13)

### 新功能 | New Features
- **Office 文件预览**：侧栏新增 Office 标签页，双击 docx/xlsx/pptx 文件打开右侧浮层预览；支持文件树拖拽与 MCP 工具触发
- **PPT 高保真渲染**：PPTX 优先走 office-cli SVG 渲染，保留原始背景、渐变、字体与颜色；全部幻灯片纵向排列一页浏览，16:9 自动缩放
- **元素/单元格选择器**：预览面板顶部 @ 按钮进入拾取模式，点击 PPT 形状 / Excel 单元格即可将 `@path#Slide N / Shape M` 引用注入外嵌输入框
- **宠物 21 点 Blackjack 小游戏**：token 消耗量换算为游戏币，支持 10/50/100/ALL 下注、要牌/停牌/加倍，即时胜负结算

### 修复 | Bug Fixes
- **流式 token 统计膨胀**：跳过 intermediate streaming snapshot（output=0 & cache=0），input token 不再被重复计数
- **分屏输入框异常**：面板宽度变化时 textarea 宽度为 0 导致 scrollHeight 异常；新增 ResizeObserver 监听宽度后重新测量高度
- **BP 模式下 ! 命令失效**：shell 命令在 bracketed paste 模式下被当作纯文本粘贴不触发执行，现已跳过
- **@ 路径外嵌发送失败**：含 @ 的文本发送时不再用 BP 转义序列包裹，改用尾部空格阻止 @ 自动补全，确保正确送达 PTY

---

## v0.7.7 (2026-05-12)

### 修复 | Bug Fixes
- **大历史项目外嵌卡死**：外嵌转录面板首次打开时默认只扫描尾部窗口，不再全量过滤/聚合数千条历史；搜索时才进入全量范围
- **历史标记写入优化**：assistant/thinking 的“已播放”状态改为批量写一次 localStorage，并限制持久化数量，避免首帧同步写入过多导致卡死

### 诊断 | Diagnostics
- 增加外嵌性能日志：`[embed-toggle]`、`[transcript:hydrate]`、`[transcript-store:replace]`、`[transcript-pane:filter]`、`[transcript-pane:aggregate]`、`[transcript-pane:pre-reveal]`

---

## v0.7.6 (2026-05-12)

### 修复 | Bug Fixes
- **外嵌卡住（特定项目）**：含失败 MCP 服务器的项目，Claude Code 进入 `idle` 后仍可能有延迟 PTY_OUTPUT 携带 `?1049h`（Ink TUI 初始化噪声）。由于 `PTY_OUTPUT` 与 `PTY_STATUS` 经不同 IPC 通道传输、渲染端收到顺序无保证，该 `?1049h` 会把备用屏标志置为 `true`，导致外嵌输入框永久禁用。修复方案：`idle` 后 1500 ms 宽限期内收到 `?1049h` 视作噪声丢弃，不触发备用屏锁定
- **外嵌备用屏误检逃生门**：备用屏提示横幅新增「强制恢复」按钮，直接重置前端状态，无需向 PTY 发送任何按键，供误检场景快速恢复

---

## v0.7.5 (2026-05-13)

### 修复 | Bug Fixes
- **外嵌卡住（生产版）**：安装版 preload 在 minify 模式下每次 PTY 输出都抛 `m is not defined`，外嵌收不到数据卡死；本版 preload `minify: false` 正式生效，问题消除
- **`/**` 注释无法发送**：JSDoc 开头文本不再被误判为斜杠命令，走普通消息通道正常提交
- **多行块提交**：正文与最终 Enter 分两帧（80 ms 延迟）发送，TUI 能正确识别提交意图
- **路径首 `/` 转义**：非斜杠命令但首字符为 `/` 时自动补空格，防 CLI 解析歧义
- **Bracketed Paste 防弹窗**：检测 xterm BP 模式并用 `\x1b[200~...\x1b[201~` 包裹，彻底杜绝 `/` 触发补全弹窗

### 改进 | Improvements
- 清理所有调试 `console.log`（`[submitEmbed]`、`[pty-input-ack]`、`[bp]`、`[embed-mcp]` 等），生产包无噪声日志

---

## v0.7.4 (2026-05-13)

### 改进 | Improvements
- **本地字体**：`@fontsource` 随包分发 woff2，去掉 Google Fonts 外链；严格 CSP 下正常显示
- **CSP**：恢复仅 `'self'` 的 style/font 策略（不再依赖 fonts.googleapis.com / gstatic）

### 修复 | Bug Fixes
- **Preload**：关闭 preload 产物压缩，避免个别构建链下 IPC 回调报 `m is not defined`
- **Preload 类型**：`GitUpdateWorktree*` 导入补全

---

## v0.7.3 (2026-05-12)

### 改进 | Improvements
- **PTY 输入 ACK**：写入 PTY 后主进程回传确认（可选 `traceId`），便于排查外嵌多行/粘贴是否送达
- **外嵌多行提交**：正文与提交回车分两帧发送（延迟 `\r`），修复 TUI 吞 Enter、无法从多行编辑退出的问题
- **斜杠识别**：`/^\/[a-zA-Z]/`；`/**` 等不再当作斜杠命令
- **首行 `/` 转义**：非斜杠命令时对首行 `/` 加前导空格，减少 CLI 误解析
- **Bracketed Paste 检测**：独立模块供发送路径使用

### 修复 | Bug Fixes
- **外嵌斜杠模式**：去掉「强制退出」，与「中断」合并为单一出口；阻塞提示文案同步

---

## v0.7.2 (2026-05-11)

### 新功能 | New Features
- **外嵌输入框 UI 重构**：去掉转录区顶部 header，提示区移到输入框上方；输入框默认单行、可向下拖拽展开；搜索框回归转录区右上角与发送/显示终端按钮同行
- **快捷键说明默认折叠**：首次打开时收起说明区，点击后展开，减少界面干扰
- **原始终端按钮常驻**：不再依赖 `nativeTerminalNeeded` 状态，按钮始终显示，方便随时切换

### 修复 | Bug Fixes
- **外嵌滚动跳顶**：打开终端浮层后内容不足一屏时，滚动事件误触发历史加载导致画面跳回顶部；增加 `scrollHeight ≤ clientHeight` 守卫
- **中断按钮不显示**：Agent 等长工具调用期间 PTY 状态可能短暂变为 idle，导致中断按钮消失；改用转录尾部 thinking/tool 条目检测实际工作状态
- **Loading 栏 token 未清零**：新一轮问答开始时记录基线 token，loading 栏显示本轮增量而非累计值
- **WorkGroupBlock 无最大高度（Fallout 主题）**：恢复 `fo-wg-scroll` 的 `max-height: 400px` 与纵向滚动
- **Loading 栏隐藏（Sprouting 等未知状态词）**：PTY 状态正则改为有 spinner 字符时接受任意大写开头的词，彻底覆盖 Claude Code 未来新增的状态词
- **图片临时文件过早删除**：改为保留 2 分钟再清理（原 5 秒太短）

---

## v0.7.1 (2026-05-09)

### 改进 | Improvements
- **Fallout 主题字体优化**：转录区正文改用 Share Tech Mono，小字号下比 VT323 更锐利清晰；VT323 保留给 loading bar、LEVEL UP 横幅等大字号装饰元素

---

## v0.7.0 (2026-05-09)

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

## v0.6.9 (2026-05-08)

### 新功能 | New Features
- **新版本介绍弹窗**：升级或安装后首次打开应用时弹出当前版本更新摘要，点「知道了」后按版本号记录，同一版本不再重复出现
- **Telegram 配对与路径**：安装说明中配对灰框改为更短的用户指引；从标签栏打开说明时优先解析状态目录（不依赖会话内 Telegram 开关），避免仍显示 `<STATE_DIR>` 时 Claude 误读 `channels/telegram`

### 修复 | Bug Fixes
- **Windows 进程清理**：关闭会话或退出应用时对 PTY 使用 `taskkill /PID … /T /F`，减少 Bun、Claude Code 子进程在任务管理器中残留

---

## v0.6.8 (2026-05-09)

### 新功能 | New Features

#### Telegram 多 Bot 预设与一键切换 | Multi-Bot Presets & Quick Switch
- 支持添加多条 Telegram Bot 预设，每条独立配置 Token 与状态目录
- 标签栏下拉框一键切换 Bot，切换后自动重启会话并应用新的 Bot Token
- 每个 Bot 的配对状态、访问控制隔离在独立目录 `~/.claude/channels/<id>/`
- 自动清理残留 bot.pid，解决退出重开后 --continue 导致 Bot 无法连接的问题

#### 外嵌界面 Beta 重大升级 | Embed Output Beta Major Upgrade
- **@ 文件/目录自动补全**：输入 `@` 弹出文件列表，支持模糊搜索，Tab/Enter 选中插入 `@path` 引用
- **Claude 转录回显**：会话 JSONL 消息实时渲染，替代传统终端查看对话历史
- **斜杠命令 TUI 支持**：/mcp 等交互菜单在外嵌面板中正常渲染，支持键盘导航
- **Fallout 磷光主题**：新增 CRT 怀旧风格的 Fallout 终端主题（参考 indeed-flow-git RobCo 绿光）
- 工具回执过滤、MCP 权限弹窗检测、中断/发送一致性等多项修复

#### 设置面板改进 | Settings Panel Improvements
- 保存/更新按钮固定在底部，不再随内容滚动

### v0.6.7 (2026-05-06)

### 新功能 | New Features

#### 持久化 Shell 会话 | Persistent Shell Sessions
- 空控制台现在通过后台守护进程保持运行，关闭 app 后 PTY 继续存活
- Shell-only consoles now survive Electron restarts via a detached background daemon
- 重启 app 后自动重连，恢复 lazygit、htop 等 TUI 程序的完整状态（含历史输出回放）
- On reopen, the app reconnects and replays scrollback — lazygit and other TUI programs resume exactly where you left off
- 跨平台支持：Windows 使用命名管道（Named Pipe），macOS/Linux 使用 Unix Socket
- Cross-platform: Named Pipe on Windows, Unix Socket on macOS/Linux
- 零依赖，无需安装 tmux / zellij 等外部工具
- Zero external dependencies — no tmux or zellij required

#### browser-tools MCP 修复 | browser-tools MCP Fix
- 内嵌浏览器未打开时，CDP 代理（端口 9223）返回空列表导致 MCP 报错
- CDP proxy (port 9223) returned empty when embedded browser wasn't open, breaking browser-tools MCP
- 现在首次请求时自动打开浏览器，MCP 可正常使用
- Browser now auto-opens on first CDP request, MCP works without manual intervention

---

## v0.6.6 (2026-05-02)

### 修复 | Bug Fixes

#### MCP 配置路径修正 | MCP Config Path Fix
- 修复 user-scope MCP 写入到错误路径（`~/.claude/.mcp.json`），现正确写入 `~/.claude/.claude.json`
- Fixed user-scope MCP being written to wrong path; now correctly targets `~/.claude/.claude.json`
- visual-agent、browser-tools 等 MCP 现在可被 Claude Code CLI 正确识别
- MCP servers (visual-agent, browser-tools, etc.) are now properly recognized by Claude Code CLI
- 启动时自动从旧路径恢复 MCP 配置（含 env 变量），无需手动重新配置
- On startup, MCP config (including env vars) is automatically recovered from legacy paths

#### Worktree 创建修复 | Worktree Create Fix
- 修复 `git worktree add` 参数顺序错误导致 `fatal: invalid reference` 报错
- Fixed argument order in `git worktree add` causing `fatal: invalid reference` error
- 改用 `worktreeList` 返回的 `mainPath` 替代 `sess.workdir`，从 worktree 子会话中也能正确创建
- Now uses `mainPath` from `worktreeList` instead of `sess.workdir`, works correctly from worktree sub-sessions
- baseBranch 无法解析时自动回退到 HEAD
- Falls back to HEAD when baseBranch cannot be resolved

#### Worktree 删除确认框 | Worktree Delete Confirmation
- 将原生 `window.confirm()` 替换为内联确认行，消除弹窗导致的窗口失焦问题
- Replaced native `window.confirm()` with inline confirmation UI, eliminating window defocus issue

### 新功能 | New Features

#### Worktree 已有分支模式 | Existing Branch Worktree Mode
- 分屏 Worktree 对话框新增「已有分支」tab
- Added "Existing Branch" tab to the Split Worktree dialog
- 可将本地未被其他 worktree 占用的分支直接挂载，无需新建
- Mount any local branch not already used by another worktree, no need to create a new one

---

## v0.6.3 (2026-04-29)

### 修复 | Bug Fixes

#### CLAUDE_CONFIG_DIR 修复 | CLAUDE_CONFIG_DIR Fix
- 将 `CLAUDE_CONFIG_DIR` 改为用户全局 `~/.claude` 目录
- `CLAUDE_CONFIG_DIR` changed to user's global `~/.claude` directory
- 修复技能（`~/.claude/commands/`）、MCP 配置（`.claude.json`）、OAuth 凭据不可见的问题
- Fixed skills, MCP config, and OAuth credentials not being read by Claude Code
- GUI 和 Claude CLI 共享同一配置目录，彻底解决双向不同步
- GUI and Claude CLI now share the same config directory, eliminating sync issues

#### 旧隔离目录迁移 | Legacy Isolated Directory Migration
- 首次启动自动将 `data/claude-session` 中的会话/插件/文件历史数据合并到 `~/.claude`
- First launch automatically merges session/plugin/file-history data from `data/claude-session` to `~/.claude`

---

## v0.6.2 (2026-04-29)

### 新功能 | New Features

#### 开发者模式 | Developer Mode
- 设置面板新增「开发者模式」开关
- Settings: new "Developer Mode" toggle
- 开启后侧边栏显示日志标签页，可查看应用日志
- Shows a Logs tab in sidebar when enabled, displaying app logs
- 支持一键打开 Chrome DevTools（detached 模式）
- One-click to open Chrome DevTools (detached mode)
- Token 用量全链路日志输出
- Full-chain token usage logging

#### 终端主题跟随 | Terminal Theme Sync
- 终端背景色和 xterm 主题跟随应用主题（暗色/亮色）
- Terminal background and xterm theme now follow app theme (dark/light)
- 默认暗色主题
- Default is dark theme

#### 技能系统增强 | Skills System Enhancements
- 额外技能目录 (`sharedSkillAddDir`) 支持根目录 `skills/` 和 `commands/` 文件夹（自动创建 junction）
- Extra skill directory now supports root-level `skills/` and `commands/` folders with automatic junction creation
- 修复额外技能目录扫描逻辑（不再因目录不存在提前退出）
- Fixed scan logic (no longer exits early when a directory doesn't exist)
- 文件夹技能支持编辑和保存（写入 `SKILL.md`）
- Folder skills can now be edited and saved (writes `SKILL.md`)
- 来源标签区分 global/extra 技能
- Source badges distinguish global vs extra skills

#### MCP 配置改进 | MCP Configuration Improvements
- MCP 面板支持 `streamable-http` 传输类型
- MCP Panel now supports `streamable-http` transport type
- 配置写入 `.claude.json`（Claude Code CLI 正确读取位置）
- Config now writes to `.claude.json` (correct CLI read location)
- 自动从 `settings.json` 迁移旧配置
- Auto-migration from old `settings.json` format

### 改进 | Improvements
- **插件安装状态检测**：已启用插件正确显示「已安装」标签
- Plugin installed badge now shows correctly for enabled plugins
- **侧边栏 UI 优化**：宠物面板子标签栏不透明度提升，分隔线颜色优化
- PetPanel sub-tab bar opacity improved, divider colors optimized
- **列表分隔线**：行分隔线从 `/50` 降至 `/20`，减少视觉突兀感
- Row dividers reduced from `/50` to `/20` opacity
- **统计面板重设计**：新增按 profile 分布的饼图
- Stats panel redesigned with per-profile distribution pie chart
- **14 天图表优化**：横向可滚动，日期标签完整显示
- 14-day chart horizontally scrollable with full date labels
- **工作区删除分支**：改进错误处理，更好处理 worktree 活跃分支
- Better error handling for deleting active worktree branches

### 修复 | Bug Fixes
- 修复保存设置时覆盖主题的问题
- Fixed theme being overwritten when saving settings
- 修复主题设置持久化（重启后不再重置）
- Fixed theme persistence (no longer resets after restart)
- 修复 token 用量统计中 total/today 数据损坏
- Fixed corrupted total/today input/output from perProfile data
- 修复 `history.lastUserPrompt` 中的 ANSI 转义字符残留
- Fixed ANSI escape artifacts in `history.lastUserPrompt`
- 修复自动更新器 CDN 传播期间 404 噪声
- Suppressed 404 noise from auto-updater during CDN propagation
- 修复 anti-FOUC 脚本暗色模式设置
- Fixed anti-FOUC script for dark mode

---

## v0.6.1 (2026-04-27)

### 新功能 | New Features
- **宠物对话功能**：可配置触发概率和 API，自动触发技术点评
- Pet dialog feature with configurable trigger probability and API
- **多 API 配置**：支持多个 API profile，一键切换
- Multi-API profile support with one-click switching

### 改进 | Improvements
- userData 目录重定向到安装目录（便携版）
- Redirect userData to install directory for portable builds

---

## v0.5.2 (2026-04-28)

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
