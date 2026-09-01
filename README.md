# Feng Claude

[English](#english) | [中文](#中文)

---

## 中文

一个基于 Electron + React 构建的 [Claude Code CLI](https://github.com/anthropics/claude-code) 第三方 GUI 包装器。

### v0.7.93 主要更新

- **macOS Finder 拖放修复**：Finder 文件可再次直接拖入终端；复制文件后按 `Command+V` 和消息代理输入框粘贴文件也会正确插入 Claude 的 `@路径` 引用

### v0.7.92 主要更新

- **发布包精简**：仅发布 Windows 安装包和 macOS Apple Silicon（arm64）DMG，不再构建 Linux、Windows portable 或 macOS Intel（x64）版本
- **中文路径 Token 统计修复**：中文工作目录可正确匹配 Claude Code 会话 JSONL，新的 token 用量恢复统计
- **macOS 快捷键修复**：`Option+E/R/F/M` 不再输出特殊字符；内嵌浏览器/DevTools 里也可使用 `Command+Shift+D/Q`

### v0.7.91 主要更新

- **macOS 应用内下载修复**：正确识别更新包真实大小，完整 DMG 不再被误判为下载不完整
- **进度显示修复**：不再出现 `0 KB` 总大小或异常百分比；未知大小会显示不确定进度

### v0.7.90 主要更新

- **macOS 会话创建修复**：避免 Gatekeeper 单独拦截 `node-pty` 内部辅助程序，创建和重启会话恢复正常
- **自动回退内嵌终端**：iTerm2 或持久终端启动失败时不再卡住，自动切回软件内终端
- **PTY 错误诊断**：守护进程失败会立即显示真实原因，不再固定等待超时

### v0.7.89 主要更新

- **消息代理模式**：外嵌聊天通过 Claude Code 结构化 JSON 流通信，不再模拟键盘或解析终端控制码
- **macOS 应用内更新**：直接下载匹配 Apple Silicon/Intel 的 DMG，显示进度并自动打开安装包
- **Dock 退出修复**：右键选择「退出」会可靠清理 PTY 和后台服务，不再需要强制退出

### v0.7.88 主要更新

- **macOS 安装不再提示已损坏**：DMG/ZIP 中的应用现在具有完整 ad-hoc 签名
- **只需系统设置放行**：首次打开被拦截后，进入「隐私与安全性」点击「仍要打开」即可，无需执行 `xattr`
- **签名完整性保护**：应用本体、Electron Framework 或 Helper 校验失败时，打包会立即中止

### v0.7.87 主要更新

- **macOS 更新不再卡住**：发现新版后提供适合 Apple Silicon 或 Intel 的 DMG 下载按钮，不再尝试未签名应用无法可靠完成的静默自动安装
- **更新资源链接修复**：统一 DMG、ZIP 与更新元数据的文件名，避免 GitHub Release 下载地址 404
- **更新错误可追踪**：失败信息保持显示，并写入本地更新日志

### v0.7.85 主要更新

- **跨平台打包恢复**：CI 升级至 Node.js 22.12 并更新 Electron 重建工具，修复 Electron 43.2.0 的原生模块 ABI 识别失败
- **构建任务独立执行**：单个平台失败不再自动取消 Windows、macOS 和 Linux 的其他打包任务

### v0.7.84 主要更新

- **macOS 终端启动可靠性**：zsh/bash 直接执行 Claude，修复控制码竞争导致 `claude` 被截成 `ude`
- **历史滚屏安全回放**：过滤鼠标追踪和终端查询等副作用序列，新会话不再显示 `^[[?...R` / `^[[<...M`
- **内嵌/iTerm2 行为修复**：开发版固定使用内嵌终端，打包版 iTerm2 修复路径转义与失败回退
- **开发热更新修复**：拆分终端组件和运行时模块，消除 Vite Fast Refresh 刷屏

### v0.7.83 主要更新

- **macOS 窗口恢复**：`Command+W` 隐藏并保留现有会话，从程序坞重新打开时恢复原窗口
- **开发进程可靠退出**：停止 `npm run dev` 时清理 PTY daemon 与残留的 Electron Dock 图标
- **终端稳定性修复**：解决刷新控制码、重复 IPC handler、Claude 启动命令被截断等问题
- **第三方 API 环境修复**：避免重复认证变量和异常输出预算，保留可靠的 1M 上下文配置

### v0.7.82 主要更新

- **iTerm2 集成（macOS 打包版）**：设置中新增「使用 iTerm2」选项，启用后在 iTerm2 中打开终端。采用 daemon + relay 架构，保留 session 管理、token 统计等功能
- **Claude 运行时误判修复**：进度条、权限菜单、思考状态不再被误判为 shell prompt，解决重复启动问题
- **macOS 交通灯按钮适配**：TitleBar 和侧边栏标题栏在 macOS 下左侧增加 padding，避免遮挡
- **`posix_spawnp failed` 修复**：修复 node-pty 权限问题，增加 shell 路径验证和 workdir 回退

### v0.7.78 主要更新

- **新用户无法替换第三方 API 地址修复**：Claude CLI 的 `~/.claude/settings.json` 若有 `env` 块硬编码了 `ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY`（常来自第三方中转教程），会覆盖软件注入的环境变量，导致换配置也「改不动」、请求打到旧地址报错。现在启动时自动剥离这三个冲突键（保留其它变量并备份原文件），软件内配置成为唯一真相源

### v0.7.77 主要更新

- **单终端只填一半高度修复（v0.7.76 回归）**：外层容器补上 `flex flex-col`，终端恢复撑满
- **重启后分屏组被拆成独立 tab 修复**：持久化并恢复停泊的分屏组（`parkedLayouts`），重启后分屏不再丢失

### v0.7.76 主要更新

- **打开文本编辑器时左侧终端变黑修复**：`TerminalPanel` 改为始终保持同一树位置，开/关 txt 不再重挂载终端导致变黑
- **两终端切换后地址栏显示旧 URL 修复**：地址栏更新改按「当前实际显示的浏览器 view」判断，不再受前台会话错位影响

### v0.7.75 主要更新

- **Token 归属修复（同目录多窗口 / shell-only）**：同目录开官方窗口 + 仅跑 lazygit 的第三方配置窗口时，claude token 被错记到该第三方配置桶。修复：shell-only 会话不再抢占 token 归因 primary，且 claude token 被标到非 claude 配置时归回官方

### v0.7.74 主要更新

- **TabBar 满宽 + 调试浏览器/Office 面板下移到 TabBar 之下**：调试浏览器/Office 面板出现时不再把 TabBar 挤成一块，TabBar 横跨整行，两个右侧面板排到它下方

### v0.7.73 主要更新

- **收藏当前页修复**：「收藏」改由主进程从实时页面解析 URL+标题，修复 SPA 路由切换后收藏成旧页面/bing 首页
- **配置/Telegram 徽章迁移到终端头部**：两枚药丸从 tab 移到 pane 头部标题右侧（作用于该 pane 会话），tab 瘦身、窗口可更窄

### v0.7.72 主要更新

- **模型 1M 上下文声明**：API 配置的 默认/Sonnet/Opus 行新增「1M」勾选，注入时给模型名追加 `[1m]` 后缀向 Claude Code 声明 1M 上下文（发给上游前自动剥掉）。仅第三方配置生效
- **非 CC 终端不自动创建调试浏览器**：浏览器面板打开时切到 shell-only 终端不再自动建浏览器 tab
- **标签组互切终端显旧内容修复**：`XTerminal` cleanup 摘除旧会话的终端 DOM 元素，修复无 key 复用组件导致的旧元素残留
- **移除失效的「上下文窗口」字段**：该数字框从未注入 Claude Code，已删除

### v0.7.51 主要更新

- **FEATURES.md 全面补全**：完整收录所有 42 个浏览器 MCP 工具（标签页管理、网站克隆、截图差异对比、JS 执行、Routine 录制/回放）；补全缺失快捷键 Alt+E/R、Alt+↑/↓、Alt+M（语音）、Ctrl+P（文件搜索）、Ctrl+F（文件内查找）、Shift+Enter（嵌入换行）；新增文本编辑器专区与语音输入专区
- **Token 归属修复**：同目录多 session 共享 watcher 时全局 token 归因改为跟踪最近创建的 session，修复重启会话后 token 误计入旧 profile 的问题
- **会话重启保留调试浏览器**：新增 `migrateSessionBrowser`，重启时把旧 session 的浏览器 tab 迁移到新 session，避免调试浏览器被重置到初始页面
- **分屏拖动同步**：拖动分屏分隔线时同步更新所有后台 session 的调试浏览器位置
- **DevTools 重载不抢前台**：调试浏览器 DevTools 重新加载页面时抑制主窗口 focus 激活
- **useDragResize hook**：AppShell 三处拖动缩放抽取为通用 hook

### 内置 MCP 与上游说明

应用启动时会向 Claude Code 使用的 MCP 配置（用户级 `~/.claude/.claude.json`）**自动注册**下列项（可在侧栏 MCP 面板查看或开关）。第三方以各项目许可证为准。

| MCP 名称 | 作用 | 上游 / 实现 |
|----------|------|-------------|
| `office-cli` | 处理 Office 文档（如 docx / xlsx / pptx）等 | 二进制与能力来自 **[iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)**；本应用负责下载、更新与写入 MCP 配置 |
| `browser-tools` | 内嵌浏览器：导航、截图、点击、输入等 | **本仓库** [`scripts/browser-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/browser-mcp-server.js)，经 `node` 以 stdio 启动，与主进程内置浏览器 HTTP 接口通信 |
| `visual-agent` | 本地图片分析（走所配置的 Anthropic 兼容多模态 API） | **本仓库** [`scripts/visual-agent-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/visual-agent-mcp-server.js)，经 `node` 以 stdio 启动 |

GUI 本体还依赖 Electron、xterm.js、node-pty 等常见技术栈，详见 `package.json`。

### 核心亮点

#### 🔄 多 API 配置一键切换

支持配置多个 API Profile，一键切换不同服务商：

- **Anthropic 官方 API** - 直连 Anthropic
- **阿里云 DashScope** - 预设 `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **自定义第三方 API** - 任意兼容 Anthropic API 格式的服务

每个配置独立保存：API Key、Base URL、默认模型、费用定价等。切换后新建会话自动使用新配置。

#### 📊 实时 Token 统计 + 费用估算

- 从 Claude Code JSONL 日志精确解析 token 用量（按 message.id 去重）
- 每日/累计统计，per-model 费用细分（Opus/Sonnet/Haiku 各自定价）
- cacheCreate（☁）/ cacheRead（⚡）分开显示，悬浮可查 cache 写入成本
- 自定义费用定价（¥/百万 token），自动计算花费
- 300 级进度系统，直观展示用量等级

#### 📱 Telegram Channel

- **多 Bot 预设**：添加多条 Bot Token，每条独立配对状态与访问控制
- **标签栏一键切换** Bot，自动应用新 Token
- **强制重连按钮**：Settings 里 `↻` 一键 kill 旧 bot 进程并重连，解决跨会话残留问题
- **单会话锁**：防止多个 Claude 进程争抢同一 bot 消息

#### 🌐 内嵌调试浏览器

- 内嵌 Chromium，支持导航、截图、点击、输入等 MCP 工具
- **Routine 录制/回放**：把浏览器操作录成项目级 routine，支持 7 种动作（navigate/click/type/select/sleep/wait_for/evaluate）
- `${var}` 参数化模板，evaluate 抓数据回传变量
- 5 个 MCP 工具：record_start/stop、list/run/delete

#### 🖥️ 分屏终端 + Git Worktree

- **分屏布局**：水平/垂直分割，可拖拽调整大小
- **Git Worktree 支持**：一键创建 worktree 并在新分屏打开，并行开发不同分支
- **持久化 Shell**：后台守护进程，重启应用不中断会话

#### 🐱 ASCII 宠物系统

- **13 种空闲活动**：look、blink、sleep、play、curious、yawn、stretch、hungry、sneeze、groom、wiggle、tilt、doze、walk
- **加权随机切换**：自然的活动过渡，带冷却规则
- **抚摸互动**：点击触发 happy 动画和随机回复
- **自动触发**：Claude 回答后概率触发技术点评（可调 0-100%）

### 功能一览

| 功能 | 描述 |
|------|------|
| **终端集成** | xterm.js + node-pty，支持分屏、多会话、持久化 shell（后台守护进程） |
| **文件树** | 浏览项目文件，拖拽生成 `@` 引用 |
| **外嵌界面 Beta** | `@` 文件自动补全、会话 JSONL 转录、斜杠 TUI |
| **Telegram Channel** | 多 Bot 预设，强制重连，独立 Token/配对状态/访问控制 |
| **调试浏览器** | 内嵌 Chromium + Routine 录制回放 + 7 种 MCP 操作工具 |
| **历史记录** | 会话历史，支持标签、搜索、快速恢复（多窗口独立保存） |
| **Token 统计** | per-model 费用细分，cacheCreate/cacheRead 分别显示 |
| **Slash Commands** | 管理 `~/.claude/commands/` 自定义命令 |
| **MCP 面板** | 可视化管理 MCP 服务器连接 |
| **Skills 面板** | 管理 Claude Code skills/slash 命令 |
| **插件系统** | 安装管理 Claude HUD 插件 |
| **多语言** | 中文/英文界面切换 |
| **Guide 面板** | Claude Code 最佳实践技巧库 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+C` | 复制终端选中内容 |
| `Ctrl+C` | 发送 SIGINT（中断） |
| `Ctrl+V` | 粘贴文本 |
| `Alt+←/→` | 在终端分屏间切换 |
| `Ctrl+Tab` | 切换会话标签 |

### 安装

#### 前置要求

- Node.js 18+
- Claude Code CLI (`npm install -g @anthropics/claude-code`)

#### 开发

```bash
npm install
npm run rebuild  # 编译原生模块 (node-pty)
npm run dev
```

#### 构建

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
npm run build:root-exe  # Windows 便携版
```

### 项目结构

```
feng-claude/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── index.ts         # 入口
│   │   ├── ptyManager.ts    # PTY 管理
│   │   ├── ipcHandlers.ts   # IPC
│   │   ├── settingsStore.ts # 设置持久化
│   │   └── claudeSessionWatcher.ts # Token 解析
│   ├── renderer/       # React 前端
│   │   ├── components/
│   │   │   ├── sidebar/     # 侧栏面板
│   │   │   ├── terminal/    # 终端组件
│   │   │   └── settings/    # 设置面板
│   │   ├── store/           # Zustand 状态
│   │   ├── hooks/           # React hooks
│   │   ├── lib/             # 工具函数
│   │   └── i18n/            # 多语言
│   └── preload/        # 预加载脚本
├── .githooks/          # Git hooks
└── scripts/            # 构建脚本
```

### 配置

设置保存在 `%APPDATA%/feng-claude/claude-settings.json`：

```json
{
  "language": "zh",
  "permissionPreset": "acceptEdits",
  "profiles": [
    {
      "id": "default",
      "name": "阿里云 DashScope",
      "authToken": "your-api-key",
      "baseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      "model": "glm-5",
      "pricing": { "inputPerM": 3, "outputPerM": 15 }
    }
  ],
  "activeProfileId": "default"
}
```

### 许可证

MIT

---

## English

A third-party GUI wrapper for [Claude Code CLI](https://github.com/anthropics/claude-code) built with Electron + React.

### v0.7.93 Highlights

- **macOS Finder drag-and-drop fix**: files dropped from Finder, copied with `Command+V`, or pasted into the message gateway now correctly insert an `@path` reference for Claude

### v0.7.92 Highlights

- **Simplified release assets**: ships only the Windows installer and the Apple Silicon (arm64) macOS DMG; Linux, Windows portable, and macOS Intel (x64) builds are no longer produced
- **Token tracking for non-ASCII paths**: Chinese workspaces now resolve to Claude Code's JSONL project directory correctly, so new usage is counted again
- **macOS shortcut fixes**: `Option+E/R/F/M` no longer inserts special characters; `Command+Shift+D/Q` also works while the embedded browser or DevTools has focus

### v0.7.91 Highlights

- **Fixed in-app macOS downloads**: correctly reads the installer size so complete DMGs are no longer rejected as incomplete
- **Reliable progress display**: no more `0 KB` totals or invalid percentages; unknown-size downloads use an indeterminate indicator

### v0.7.90 Highlights

- **macOS session creation fix**: avoids Gatekeeper separately blocking node-pty's nested helper after the main app has been approved
- **Automatic embedded-terminal fallback**: failed iTerm2 or persistent-terminal startup now falls back in-app instead of stalling
- **Actionable PTY diagnostics**: daemon startup failures return their real cause immediately instead of ending in a generic timeout

### v0.7.89 Highlights

- **Message gateway mode**: embedded chat now uses Claude Code structured JSON streams instead of simulated keystrokes or terminal-control parsing
- **In-app macOS updates**: downloads the matching Apple Silicon/Intel DMG with progress and opens it automatically when ready
- **Reliable Dock quit**: quitting from the Dock now cleans up PTYs and background services without requiring Force Quit

### v0.7.88 Highlights

- **No more false “app is damaged” warning on macOS**: apps inside the DMG/ZIP now carry a complete ad-hoc signature
- **Privacy & Security override works**: after the first blocked launch, users can click “Open Anyway” without running `xattr`
- **Signature integrity guard**: packaging stops if the app, Electron Framework, or any Helper fails verification

### v0.7.87 Highlights

- **macOS updates no longer stall**: update notices now offer the matching Apple Silicon or Intel DMG instead of attempting an unreliable silent install for unsigned builds
- **Consistent release asset URLs**: DMG, ZIP, and update metadata now use matching filenames, preventing GitHub Release 404 errors
- **Visible update diagnostics**: failures remain visible and are also written to a local update log

### v0.7.85 Highlights

- **Cross-platform packaging restored**: CI now uses Node.js 22.12 and an updated Electron rebuild toolchain, fixing native-module ABI detection for Electron 43.2.0
- **Independent platform jobs**: a failure on one platform no longer cancels the remaining Windows, macOS, and Linux builds

### v0.7.84 Highlights

- **Reliable macOS terminal startup**: zsh/bash launches Claude directly, preventing terminal-control races from truncating `claude` to `ude`
- **Safe scrollback replay**: filters mouse tracking and terminal queries so restored history cannot inject `^[[?...R` / `^[[<...M` sequences into a new shell
- **Embedded/iTerm2 behavior fixes**: development builds always use the embedded terminal; packaged iTerm2 mode now handles path escaping and fallback cleanup correctly
- **Development HMR fix**: separates the terminal React component from its runtime helpers, eliminating Vite Fast Refresh invalidation spam

### v0.7.83 Highlights

- **macOS window restoration**: `Command+W` hides the window while preserving PTY sessions; Dock activation restores the existing window
- **Reliable development shutdown**: stopping `npm run dev` cleans up PTY daemons and stale Electron Dock processes
- **Terminal stability fixes**: prevents refresh control-code noise, duplicate IPC handlers, and truncated Claude launch commands
- **Third-party API environment fixes**: avoids duplicate credentials and oversized output budgets while preserving 1M context configuration

### v0.7.82 Highlights

- **iTerm2 integration (macOS packaged)**: new "Use iTerm2" option opens the terminal in iTerm2 instead of the built-in xterm. Uses a daemon + relay architecture, preserving session management, token stats, etc. Only visible in packaged macOS builds
- **Fix: false shell prompt detection triggering repeated relaunches**: Claude's progress bars (`16%`), permission menus, and thinking states (`Thought for`/`Waiting.` etc.) are no longer misdetected as shell prompts
- **macOS traffic light button adaptation**: TitleBar and sidebar panel headers now have left padding on macOS to avoid being covered by traffic light buttons
- **Fix: `posix_spawnp failed` error**: fixed node-pty `spawn-helper` permissions; added shell path validation and workdir fallback logic

### v0.7.78 Highlights

- **Fix: new users can't override the third-party API URL**: if Claude CLI's `~/.claude/settings.json` has an `env` block hard-coding `ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY` (common in third-party proxy guides), it overrode the per-session env vars this app injects, so changing the API config in the app had no effect and requests kept hitting the old URL (e.g. 400). The app now strips those three conflicting keys on startup (keeping any other custom vars, backing up the file first), making the in-app config the single source of truth

### v0.7.77 Highlights

- **Fix: terminal only fills half the height with a single terminal (v0.7.76 regression)**: the wrapper now has `flex flex-col`, so the terminal fills the full height again
- **Fix: split groups broken into separate tabs after restart**: parked split groups (`parkedLayouts`) are now persisted and restored, so a two-terminal split survives a restart

### v0.7.76 Highlights

- **Fix: left terminal goes black when opening the text editor**: `TerminalPanel` now stays at one stable tree position, so toggling the editor no longer remounts the terminal (which left it black)
- **Fix: stale URL in the debug browser's address bar after switching terminals**: the address bar now tracks the actually-displayed browser view instead of `foregroundSessionId`, so it no longer freezes on the old URL

### v0.7.75 Highlights

- **Token attribution fix (same-dir multi-window / shell-only)**: with an official window and a same-directory third-party-profile window used only for lazygit, Claude tokens were mis-attributed to that third-party profile. Fixed: shell-only sessions no longer claim the token-attribution primary, and `claude-*` tokens labeled under a non-claude profile are re-attributed to official

### v0.7.74 Highlights

- **Full-width TabBar + debug browser/Office panel moved below the TabBar**: opening the debug browser or Office panel no longer squeezes the TabBar into a corner — the TabBar spans the full row and both right-side panels drop below it

### v0.7.73 Highlights

- **Bookmark fix**: "bookmark" now resolves the URL + title in main from the live page, fixing bookmarking the old page / bing homepage after SPA route changes
- **Profile/Telegram badges moved to the terminal header**: both pills moved out of each tab into the pane header (next to the title), scoped to that pane's session — tabs slim down and the window can shrink further

### v0.7.72 Highlights

- **Per-model 1M context declaration**: the Default/Sonnet/Opus model rows in an API profile now have a "1M" checkbox; when checked, a `[1m]` suffix is appended to the model name in the injected env to declare 1M context to Claude Code (stripped before reaching your provider). Third-party profiles only
- **Shell-only terminals no longer auto-spawn the debug browser**: switching to a shell-only terminal while the browser panel is open no longer creates a new browser tab for it
- **Fix: terminal showing another session's stale content on tab-group switch**: `XTerminal` cleanup now detaches the old session's terminal DOM element from its container, fixing the stale element left behind when React reuses the keyless component
- **Removed the dead "Context Window" field**: it was never injected into Claude Code; use the new "1M" checkbox to declare context capability

### v0.7.51 Highlights

- **FEATURES.md rewritten**: now covers all 42 browser MCP tools (tab management, site cloning, screenshot diff, JS execution, routine record/replay); adds missing shortcuts (Alt+E/R, Alt+↑/↓, Alt+M, Ctrl+P, Ctrl+F, Shift+Enter); new Text Editor & Voice Input sections, session creation options (Resume / Shell-only)
- **Token attribution fix**: per-profile global token tracking now follows the most-recently-created session (`primarySessionId`) when multiple sessions share a watcher for the same workdir — fixes tokens being mis-attributed to the old profile after a session restart
- **Session restart preserves debug browser**: new `migrateSessionBrowser` transfers browser tabs from old to new session ID on restart, so the debug browser stays on its current page instead of resetting to the initial URL
- **Split drag syncs all sessions**: dragging the split divider now updates the debug browser bounds for every background session, not just the foreground one
- **DevTools reload no longer steals focus**: when the debug browser's DevTools reloads the inspected page, the app stays in the background instead of being popped to the foreground
- **useDragResize hook**: three drag-resize handlers in AppShell (sidebar, editor split, debug browser panel) extracted into a shared hook

### Bundled MCPs & upstream

On launch, the app **auto-registers** these MCP entries in the Claude Code user config (`~/.claude/.claude.json`). You can toggle them in the sidebar MCP panel. Third-party components follow their own licenses.

| MCP name | Purpose | Upstream / implementation |
|----------|---------|---------------------------|
| `office-cli` | Office documents (e.g. docx / xlsx / pptx) | Binaries and behavior from **[iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)**; this app downloads, updates, and writes the MCP entry |
| `browser-tools` | Embedded browser: navigate, screenshot, click, type, … | **This repo**: [`scripts/browser-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/browser-mcp-server.js), stdio via `node`, talking to the app's built-in browser HTTP API |
| `visual-agent` | Local image analysis (Anthropic-compatible multimodal API from your profile) | **This repo**: [`scripts/visual-agent-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/visual-agent-mcp-server.js), stdio via `node` |

The GUI stack (Electron, xterm.js, node-pty, etc.) is listed in `package.json`.

### Key Features

#### 🔄 Multi-API Profile Switching

Configure multiple API profiles and switch with one click:

- **Anthropic Official API** - Direct connection
- **Alibaba DashScope** - Pre-configured endpoint
- **Custom Third-party APIs** - Any Anthropic-compatible service

Each profile stores: API Key, Base URL, default model, pricing, etc. New sessions use the active profile.

#### 📊 Real-time Token Tracking + Cost Estimation

- Precise parsing from Claude Code JSONL logs (deduplicated by message.id)
- Daily/total statistics, per-model cost breakdown (Opus/Sonnet/Haiku priced separately)
- cacheCreate (☁) / cacheRead (⚡) shown separately; hover to reveal cache write cost
- Custom pricing (¥/M tokens), auto cost calculation
- 300-level progression system

#### 📱 Telegram Channel

- **Multi-bot presets**: multiple bot tokens with isolated pairing state & access control
- **Tab bar quick switch**, auto-applies new token
- **Force reconnect button**: `↻` in Settings kills the old bot process and reconnects, fixing cross-session PID conflicts
- **Single-session lock**: prevents multiple Claude processes competing for the same bot

#### 🌐 Embedded Debug Browser

- Embedded Chromium with navigate, screenshot, click, type MCP tools
- **Routine recording/playback**: record browser sessions as project-level routines with 7 action types (navigate/click/type/select/sleep/wait_for/evaluate)
- `${var}` parameterized templates, evaluate steps can capture data into variables
- 5 MCP tools: record_start/stop, list/run/delete

#### 🖥️ Split Terminal + Git Worktree

- **Split layout**: horizontal/vertical, draggable resize
- **Git Worktree**: create and open in split pane for parallel development
- **Persistent shell**: background daemon survives app restarts

#### 🐱 ASCII Pet System

- **13 idle activities**: look, blink, sleep, play, curious, yawn, stretch, hungry, sneeze, groom, wiggle, tilt, doze, walk
- **Weighted random transitions** with cooldown rules
- **Petting interaction**: click for happy animation
- **Auto-trigger**: probability-based tech comments after Claude replies (0-100%)

### Feature Overview

| Feature | Description |
|---------|-------------|
| **Terminal Integration** | xterm.js + node-pty, split panes, multi-session, persistent shell daemon |
| **File Tree** | Browse files, drag to create `@` references |
| **Embed Output Beta** | `@` autocomplete, JSONL transcript, slash TUI |
| **Telegram Channel** | Multi-bot presets, force reconnect, isolated pairing & access control |
| **Debug Browser** | Embedded Chromium + Routine recording/playback + 7 MCP action tools |
| **History** | Session history with labels, search, quick resume (multi-window independent) |
| **Token Stats** | Per-model cost breakdown, cacheCreate/cacheRead separately displayed |
| **Slash Commands** | Manage `~/.claude/commands/` |
| **MCP Panel** | Visual MCP server management |
| **Skills Panel** | Manage Claude Code skills |
| **Plugins** | Claude HUD plugin support |
| **Multi-language** | Chinese/English UI |
| **Guide Panel** | Claude Code best practices |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+C` | Send SIGINT |
| `Ctrl+V` | Paste text |
| `Alt+←/→` | Navigate between split panes |
| `Ctrl+Tab` | Switch session tabs |

### Installation

#### Prerequisites

- Node.js 18+
- Claude Code CLI (`npm install -g @anthropics/claude-code`)

#### Development

```bash
npm install
npm run rebuild
npm run dev
```

#### Build

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
npm run build:root-exe  # Windows portable
```

### License

MIT
