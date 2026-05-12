# Changelog

All notable changes to this project will be documented in this file.

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