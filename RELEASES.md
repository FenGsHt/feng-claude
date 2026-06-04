# Releases

> 每次版本更新时，将以下内容复制到 GitHub Release 中。
> Copy this content to GitHub Release on each version bump.

---

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
