# Feng Claude

[English](#english) | [中文](#中文)

---

## 中文

一个基于 Electron + React 构建的 [Claude Code CLI](https://github.com/anthropics/claude-code) 第三方 GUI 包装器。

### v0.7.61 主要更新

- **调试浏览器 Alt+E/R 修复**：DevTools/浏览器聚焦时也能用 Alt+E/R 切换会话（主进程拦截转发）
- **DevTools 切换会话保留**：DevTools 改为 per-tab 持久，切走再切回仍在，不再被强关
- **Telegram 多窗口消息投错窗口修复**：跨实例 owner 锁，同一 token 全局只一个窗口轮询；↻ 夺锁独占接收
- **Telegram -32000 根治**：强制重连清掉所有残留进程（含孤儿 server.ts），延时重连

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

### v0.7.61 Highlights

- **Debug browser Alt+E/R fix**: session switching with Alt+E/R works even when the browser or DevTools has focus (intercepted and forwarded by the main process)
- **DevTools persists across session switch**: DevTools is now per-tab — switch away and back and it's still open, no longer force-closed
- **Telegram multi-window misrouting fix**: cross-instance owner lock so only one window polls a given token; ↻ steals the lock for exclusive receipt
- **Telegram -32000 fix**: force-reconnect kills all leftover plugin processes (including orphan `server.ts`) and reconnects after a delay

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
