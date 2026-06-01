# Changelog

All notable changes to this project will be documented in this file.

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