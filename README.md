# Feng Claude

[English](#english) | [中文](#中文)

---

## 中文

一个基于 Electron + React 构建的 [Claude Code CLI](https://github.com/anthropics/claude-code) 第三方 GUI 包装器。

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
| **终端集成** | xterm.js + node-pty，支持分屏、多会话 |
| **文件树** | 浏览项目文件，拖拽生成 `@` 引用 |
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
| **Terminal Integration** | xterm.js + node-pty, split panes, multi-session |
| **File Tree** | Browse files, drag to create `@` references |
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