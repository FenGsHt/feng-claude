# Feng Claude

[English](#english) | [中文](#中文)

---

## 中文

一个基于 Electron + React 构建的 [Claude Code CLI](https://github.com/anthropics/claude-code) 第三方 GUI 包装器。

### v0.7.3 主要更新

- **外嵌多行提交**：正文与回车分两帧发送，修复斜杠 TUI 下多行无法提交；PTY 写入增加 ACK 便于排查
- **斜杠识别与首行 `/`**：`/**` 等不再误判为命令；非命令时对首行 `/` 做转义
- **斜杠交互**：统一用「中断」，移除「强制退出」

### 内置 MCP 与上游说明

应用启动时会向 Claude Code 使用的 MCP 配置（用户级 `~/.claude/.claude.json`）**自动注册**下列项（可在侧栏 MCP 面板查看或开关）。第三方以各项目许可证为准。

| MCP 名称 | 作用 | 上游 / 实现 |
|----------|------|-------------|
| `office-cli` | 处理 Office 文档（如 docx / xlsx / pptx）等 | 二进制与能力来自 **[iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)**；本应用负责下载、更新与写入 MCP 配置 |
| `browser-tools` | 内嵌浏览器：导航、截图、点击、输入等 | **本仓库** [`scripts/browser-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/browser-mcp-server.js)，经 `node` 以 stdio 启动，与主进程内置浏览器 HTTP 接口通信 |
| `visual-agent` | 本地图片分析（走所配置的 Anthropic 兼容多模态 API） | **本仓库** [`scripts/visual-agent-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/visual-agent-mcp-server.js)，经 `node` 以 stdio 启动 |

GUI 本体还依赖 Electron、xterm.js、node-pty 等常见技术栈，详见 `package.json`。

### v0.6.8 主要更新

- **Telegram 多 Bot 预设**：支持添加多条 Bot Token 预设，每条约独立的配对状态与访问控制。标签栏一键切换 Bot，自动应用新 Token。
- **外嵌界面 Beta**：支持 `@` 文件/目录自动补全、会话 JSONL 转录回显、斜杠命令 TUI 交互、Fallout 磷光主题。
- **设置面板改进**：保存/更新按钮固定在底部，不再随内容滚动。

### 核心亮点

#### 🔄 多 API 配置一键切换

支持配置多个 API Profile，一键切换不同服务商：

- **Anthropic 官方 API** - 直连 Anthropic
- **阿里云 DashScope** - 预设 `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **自定义第三方 API** - 任意兼容 Anthropic API 格式的服务

每个配置独立保存：API Key、Base URL、默认模型、费用定价等。切换后新建会话自动使用新配置。

#### 📊 实时 Token 统计 + 费用估算

- 从 Claude Code JSONL 日志精确解析 token 用量
- 每日/累计统计，可视化趋势图表
- 自定义费用定价（$/百万 token），自动计算花费
- 300 级进度系统，直观展示用量等级

#### 🐱 ASCII 宠物系统

- **13 种空闲活动**：look、blink、sleep、play、curious、yawn、stretch、hungry、sneeze、groom、wiggle、tilt、doze、walk
- **加权随机切换**：自然的活动过渡，带冷却规则
- **抚摸互动**：点击触发 happy 动画和随机回复
- **走动动画**：水平移动，边界反弹
- **内容库**：预设笑话、技巧、新闻、闲聊；每日 API 更新
- **自动触发**：Claude 回答后概率触发技术点评（可调概率，最高 100%）
- **触发概率可调**：0-100%，可设为百分百触发

#### 🖥️ 分屏终端 + Git Worktree

- **分屏布局**：水平/垂直分割，可拖拽调整大小
- **Git Worktree 支持**：一键创建 worktree 并在新分屏打开，并行开发不同分支
- **合并提醒**：多个 worktree 存在时显示提示

#### 💾 工作区持久化 + 快速恢复

- 自动保存终端布局、分屏比例
- 重启后恢复上次工作状态（目录、会话、分屏）
- **侧边栏历史记录**：一键恢复任意 Claude Code 会话
- **多窗口支持**：不同工作目录的历史独立保存，任意恢复

### 功能一览

| 功能 | 描述 |
|------|------|
| **终端集成** | xterm.js + node-pty，支持分屏、多会话、持久化 shell（后台守护进程） |
| **文件树** | 浏览项目文件，拖拽生成 `@` 引用 |
| **外嵌界面 Beta** | `@` 文件自动补全、会话 JSONL 转录、斜杠 TUI、Fallout 主题 |
| **Telegram Channel** | 多 Bot 预设一键切换，独立 Token/配对状态/访问控制 |
| **历史记录** | 会话历史，支持标签、搜索、快速恢复（多窗口独立保存） |
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

### v0.7.3 Highlights

- **Embed multiline submit**: split body vs Enter with a short delay so slash TUIs accept submission; PTY input ACK for debugging
- **Slash detection & leading `/`**: `/**` blocks are not treated as slash commands; leading-space escape for non-command lines starting with `/`
- **Slash TUI UX**: single **Interrupt** control; removed separate “force exit”

### Bundled MCPs & upstream

On launch, the app **auto-registers** these MCP entries in the Claude Code user config (`~/.claude/.claude.json`). You can toggle them in the sidebar MCP panel. Third-party components follow their own licenses.

| MCP name | Purpose | Upstream / implementation |
|----------|---------|---------------------------|
| `office-cli` | Office documents (e.g. docx / xlsx / pptx) | Binaries and behavior from **[iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)**; this app downloads, updates, and writes the MCP entry |
| `browser-tools` | Embedded browser: navigate, screenshot, click, type, … | **This repo**: [`scripts/browser-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/browser-mcp-server.js), stdio via `node`, talking to the app’s built-in browser HTTP API |
| `visual-agent` | Local image analysis (Anthropic-compatible multimodal API from your profile) | **This repo**: [`scripts/visual-agent-mcp-server.js`](https://github.com/FenGsHt/feng-claude/blob/master/scripts/visual-agent-mcp-server.js), stdio via `node` |

The GUI stack (Electron, xterm.js, node-pty, etc.) is listed in `package.json`.

### v0.6.8 Highlights

- **Telegram Multi-Bot Presets**: Multiple bot tokens with isolated pairing state & access control. Quick switch via tab bar dropdown.
- **Embed Output Beta**: `@` file autocomplete, JSONL transcript rendering, slash command TUI support, Fallout CRT theme.
- **Persistent Shell Sessions**: Survive app restarts via background daemon, no tmux required.

### Key Features

#### 🔄 Multi-API Profile Switching

Configure multiple API profiles and switch with one click:

- **Anthropic Official API** - Direct connection
- **Alibaba DashScope** - Pre-configured endpoint
- **Custom Third-party APIs** - Any Anthropic-compatible service

Each profile stores: API Key, Base URL, default model, pricing, etc. New sessions use the active profile.

#### 📊 Real-time Token Tracking + Cost Estimation

- Precise parsing from Claude Code JSONL logs
- Daily/total statistics with trend charts
- Custom pricing ($/M tokens), auto cost calculation
- 300-level progression system

#### 🐱 ASCII Pet System

- **13 idle activities**: look, blink, sleep, play, curious, yawn, stretch, hungry, sneeze, groom, wiggle, tilt, doze, walk
- **Weighted random transitions** with cooldown rules
- **Petting interaction**: click for happy animation
- **Walking animation**: horizontal movement with bounce
- **Content library**: jokes, tips, news; daily API updates
- **Auto-trigger**: probability-based tech comments (adjustable 0-100%)

#### 🖥️ Split Terminal + Git Worktree

- **Split layout**: horizontal/vertical, draggable resize
- **Git Worktree**: create and open in split pane for parallel development
- **Merge reminder**: visual hint when multiple worktrees exist

#### 💾 Workspace Persistence + Quick Resume

- Auto-save terminal layout, split ratios
- Restore on restart (directories, sessions, splits)
- **Sidebar History**: one-click resume any Claude Code session
- **Multi-window Support**: separate history per working directory, resume any session

### Feature Overview

| Feature | Description |
|---------|-------------|
| **Terminal Integration** | xterm.js + node-pty, split panes, multi-session, persistent shell daemon |
| **File Tree** | Browse files, drag to create `@` references |
| **Embed Output Beta** | `@` autocomplete, JSONL transcript, slash TUI, Fallout theme |
| **Telegram Channel** | Multi-bot presets, quick switch, isolated pairing & access control |
| **History** | Session history with labels, search, quick resume (multi-window independent) |
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