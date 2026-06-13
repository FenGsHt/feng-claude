# Feng Claude — 完整功能手册 / Full Feature Manual

[English](#english) | [中文](#中文)

---

## 中文

### 目录

1. [终端与会话](#1-终端与会话)
2. [侧栏面板](#2-侧栏面板)
3. [API Profile 与模型切换](#3-api-profile-与模型切换)
4. [Token 统计与费用](#4-token-统计与费用)
5. [Telegram Channel](#5-telegram-channel)
6. [调试浏览器](#6-调试浏览器)
7. [Git Worktree 支持](#7-git-worktree-支持)
8. [ASCII 宠物系统](#8-ascii-宠物系统)
9. [MCP 管理](#9-mcp-管理)
10. [Skills 管理](#10-skills-管理)
11. [插件系统](#11-插件系统)
12. [Guide 面板](#12-guide-面板)
13. [设置面板](#13-设置面板)
14. [快捷键速查](#14-快捷键速查)

---

### 1. 终端与会话

#### 多会话标签

- 点击顶部 `+` 按钮新建会话，选择工作目录后启动
- 每个会话独立运行 Claude Code CLI，互不干扰
- 会话标签显示当前工作目录名，悬浮查看完整路径
- 支持同时保持多个会话活跃（后台持续运行）

#### 分屏终端

- **水平分屏**：在会话中点击分屏按钮，或使用侧栏操作，横向并排两个终端
- **垂直分屏**：纵向上下分割
- **拖拽调整**：分屏中间拖动分隔线调整比例
- **分屏间切换**：`Alt+←` / `Alt+→` 在左右/上下分屏之间切换焦点

#### 持久化 Shell（守护进程模式）

- 后台守护进程保持 Shell 运行，关闭 GUI 窗口不终止 Claude 任务
- 重新打开 GUI 后自动恢复连接，滚动缓冲区完整保留
- Settings → 持久化 Shell 可开关此功能

#### 终端操作

| 操作 | 说明 |
|------|------|
| 鼠标选中文本 | 选中后自动进入复制待命状态 |
| `Ctrl+Shift+C` | 复制选中内容到剪贴板 |
| `Ctrl+C` | 发送 SIGINT 中断当前任务 |
| `Ctrl+V` | 粘贴文本 |
| 拖拽文件到终端 | 插入 `@/path/to/file` 引用 |
| 右键菜单 | 复制 / 粘贴 / 清屏等操作 |

---

### 2. 侧栏面板

侧栏位于左侧，点击图标切换不同面板。

#### 文件树（Files）

- 展示当前会话工作目录下的文件结构
- 点击文件显示预览（文本 / 图片 / Office）
- **拖拽文件到终端**：自动生成 `@/path/to/file` 路径引用
- 双击文件夹展开/折叠
- 顶部搜索框过滤文件名

#### 历史记录（History）

- 列出所有已保存的会话历史
- 支持**标签标记**（添加标签便于归类）
- **搜索**：按名称或标签过滤
- 点击历史条目一键恢复会话（在当前窗口或新窗口）
- 不同窗口的历史独立保存，互不覆盖

#### Slash Commands（斜杠命令）

- 展示 `~/.claude/commands/` 目录下的自定义命令
- 点击命令直接插入终端
- 支持创建、编辑、删除自定义命令

#### 设置（Settings）

详见 [第 13 节](#13-设置面板)。

#### Token 统计（Stats）

详见 [第 4 节](#4-token-统计与费用)。

#### 插件（Plugins）

详见 [第 11 节](#11-插件系统)。

#### Guide 面板

详见 [第 12 节](#12-guide-面板)。

#### MCP 面板

详见 [第 9 节](#9-mcp-管理)。

#### Skills 面板

详见 [第 10 节](#10-skills-管理)。

#### 宠物（Pet）

详见 [第 8 节](#8-ascii-宠物系统)。

#### Todo 列表（TodoList）

- 展示 Claude 在当前任务中生成的 Todo 项目（从 JSONL 日志解析）
- 实时更新，勾选状态同步
- 快捷跳转到对应会话

#### 触发器（Trigger）

- 配置自动触发规则：当终端输出匹配特定模式时自动执行命令
- 支持正则匹配、延迟触发、单次/循环触发

#### 开发日志（DevLog）

- 记录每次 Claude 任务的摘要日志
- 支持按日期/会话过滤，快速回顾历史工作

---

### 3. API Profile 与模型切换

#### 多 Profile 配置

每个 Profile 独立保存以下内容：

| 字段 | 说明 |
|------|------|
| 名称 | Profile 显示名 |
| API Key | 服务商密钥 |
| Base URL | API 端点（留空为 Anthropic 官方） |
| 默认模型 | 新建会话使用的模型 |
| 定价 | 自定义每百万 token 的输入/输出价格（元） |

#### 预设 Profile

- **Anthropic 官方**：直连，无需 Base URL
- **阿里云 DashScope**：预置 `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **自定义**：任意兼容 Anthropic API 格式的服务

#### 切换 Profile

- Settings → API Profiles → 点击 Profile 行右侧 "设为默认"
- **新建会话时**自动应用当前激活的 Profile
- 已有会话不受影响

#### 模型选择

- Settings → Default Model 下拉选择
- 支持手动输入任意 model id（兼容第三方）

---

### 4. Token 统计与费用

#### 统计面板

- 侧栏 Stats 图标打开统计面板
- 显示**今日**和**累计**两行汇总

#### 字段说明

| 符号 | 含义 | 颜色 |
|------|------|------|
| `↑` | 输入 token | 默认 |
| `↓` | 输出 token | 默认 |
| `⚡` | cacheRead（缓存命中） | 天蓝色 |
| `☁` | cacheCreate（写入缓存） | 橙色 |
| 金额 | 估算费用（元） | 琥珀色 |

> `☁ cacheCreate` 默认**不显示**，鼠标悬浮在 token 统计行时出现，用于查看缓存写入成本。

#### per-model 细分

- 点击汇总行展开，显示 Opus / Sonnet / Haiku 各自的 token 用量和费用
- 每个模型行同样支持悬浮查看 cacheCreate

#### 级别系统

- 累计用量对应 1–300 级，进度条直观展示
- 级别图标随等级变化

#### 定价说明（官方，人民币）

| 模型 | 输入/M | 输出/M | cacheCreate/M | cacheRead/M |
|------|--------|--------|---------------|-------------|
| Opus | ¥35 | ¥175 | ¥43.75 | ¥3.50 |
| Sonnet | ¥21 | ¥105 | ¥26.25 | ¥2.10 |
| Haiku | ¥1.75 | ¥8.75 | ¥2.19 | ¥0.18 |

自定义定价在 Settings → API Profiles 中配置。

---

### 5. Telegram Channel

#### 功能概览

通过 Telegram Bot 把消息发给 Claude，Claude 的回复实时推送回 Telegram。

#### 多 Bot 预设

- 在 Settings → Telegram Channel 中添加多条 Bot Token
- 每条预设独立保存配对状态、访问控制白名单
- 标签栏**一键切换** Bot，自动应用新 Token

#### 配置字段

| 字段 | 说明 |
|------|------|
| Bot Token | Telegram BotFather 发放的 Token |
| 白名单 | 允许发消息的 Telegram 用户 ID |
| 配对状态 | 显示 Bot 是否已连接并工作 |

#### 检测按钮

点击"检测"验证当前 Token 配置是否有效，并显示 Claude Code 版本。

#### 强制重连（↻）

- **场景**：出现 `-32000` 错误，通常是旧 bot 进程/跨会话 PID 占用
- **操作**：点击"↻"按钮
- **效果**：
  1. 读取当前会话的 `bot.pid` 文件
  2. 用 SIGTERM 终止旧 bot 进程（含 PID 复用保护）
  3. 删除 `bot.pid` 文件
  4. 向终端发送 `/plugin` 命令触发重连

#### 单会话锁

- 同一 bot 同时只允许一个 Claude 进程持有
- 多窗口并行使用时自动防止 409 Conflict

---

### 6. 调试浏览器

#### 内嵌浏览器

- 应用内置 Chromium 浏览器（Electron BrowserView）
- 通过侧栏浏览器图标或 MCP 工具操作打开
- 支持调整浏览器/终端分屏比例

#### MCP 工具（Claude 可调用）

| 工具 | 说明 |
|------|------|
| `browser_navigate` | 导航到 URL |
| `browser_screenshot` | 截图 |
| `browser_click` | 点击元素（CSS 选择器） |
| `browser_type` | 输入文字 |
| `browser_evaluate` | 执行 JS |
| `browser_scroll` | 滚动页面 |
| `browser_wait_for` | 等待元素出现 |

#### Routine 录制/回放

1. **开始录制**：`browser_routine_record_start`（或 UI 录制按钮）
2. **执行操作**：在浏览器中手动操作（点击/输入/导航等）
3. **停止录制**：`browser_routine_record_stop`，routine 保存到项目目录
4. **回放**：`browser_routine_run <name>`

#### Routine 支持的 7 种动作

| 动作 | 说明 |
|------|------|
| `navigate` | 跳转 URL |
| `click` | 点击元素 |
| `type` | 输入文字 |
| `select` | 下拉选择 |
| `sleep` | 等待指定毫秒 |
| `wait_for` | 等待选择器出现 |
| `evaluate` | 执行 JS，结果可存入 `${变量}` |

#### 参数化模板

- 在 routine 中使用 `${变量名}` 占位符
- 回放时传入实际值
- `evaluate` 步骤可把执行结果写回变量，供后续步骤使用

---

### 7. Git Worktree 支持

#### 创建 Worktree

1. 侧栏 Files 面板 → Git Worktree 标签
2. 选择已有分支或输入新分支名
3. 点击"创建 Worktree"
4. 自动在新分屏中打开 worktree 目录

#### Worktree 列表

- 列出当前仓库所有 worktree
- 显示分支名、路径、未合并提交数
- 点击"在分屏中打开"在新终端中打开对应目录

#### 合并 Worktree

- 选择 worktree → 合并到主分支
- 完成后可删除 worktree 目录

---

### 8. ASCII 宠物系统

#### 开启宠物

侧栏 → Pet 图标，或 Settings → 宠物设置中开启。

#### 13 种空闲活动

| 活动 | 说明 |
|------|------|
| `look` | 左右张望 |
| `blink` | 眨眼 |
| `sleep` | 睡觉（💤） |
| `play` | 玩耍 |
| `curious` | 好奇张望 |
| `yawn` | 打哈欠 |
| `stretch` | 伸懒腰 |
| `hungry` | 饿了（碗碗） |
| `sneeze` | 打喷嚏 |
| `groom` | 梳理毛发 |
| `wiggle` | 扭动 |
| `tilt` | 歪头 |
| `doze` | 打盹 |
| `walk` | 散步 |

#### 互动

- **点击宠物**：触发 happy 动画和随机回复
- **自动触发**：Claude 完成任务后，以可调概率（0–100%）触发宠物点评
- 触发概率在 Settings → 宠物设置中调整

---

### 9. MCP 管理

#### 自动注册 MCP

应用启动时自动注册到 `~/.claude/.claude.json`：

| MCP | 功能 |
|-----|------|
| `office-cli` | Office 文档处理（docx/xlsx/pptx） |
| `browser-tools` | 内嵌浏览器操作 |
| `visual-agent` | 本地图片分析（调用配置的多模态 API） |

#### MCP 面板操作

- **查看**所有已注册 MCP 服务器及其状态
- **开关**单个 MCP（临时禁用不删除配置）
- **刷新**：重新扫描配置文件

---

### 10. Skills 管理

- 对应 `~/.claude/` 下的 skills 目录（Claude Code skills/slash 命令）
- **列出**所有 skill 文件
- **查看 / 编辑** skill 内容
- **新建 / 删除** skill
- 点击"打开目录"在文件管理器中打开 skills 目录

---

### 11. 插件系统

- 支持安装 Claude HUD 插件
- 列出已安装插件，显示版本和状态
- **安装**：输入插件 ID 或从列表选择
- **卸载**：移除插件文件和配置
- **更新**：检查并下载新版本

---

### 12. Guide 面板

- 内置 Claude Code 最佳实践技巧库
- 分类展示（提示技巧 / 工作流 / 常见问题等）
- 点击技巧复制到剪贴板或直接插入终端

---

### 13. 设置面板

侧栏 → 设置图标（齿轮）打开。

#### 常规设置

| 设置项 | 说明 |
|--------|------|
| 语言 | 中文 / English |
| 主题 | 深色（目前仅深色主题） |
| 权限预设 | acceptEdits / autoApprove / askFirst 等 |

#### API Profiles

- 新增 / 编辑 / 删除 Profile
- 字段：名称、API Key、Base URL、默认模型、定价（输入/输出，元/百万 token）
- 点击"设为激活"切换当前使用的 Profile

#### 默认模型

- 下拉或手动输入 model id

#### Telegram Channel

- 添加/删除 Bot Token 预设
- 检测按钮：验证配置
- `↻` 强制重连按钮：kill 旧 bot 并重连

#### 宠物设置

- 开关宠物显示
- 调整自动触发概率（0–100%）
- 调整宠物活动速度

#### 持久化 Shell

- 开启/关闭守护进程模式
- 查看当前守护进程状态

---

### 14. 快捷键速查

#### 终端操作

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+C` | 复制终端选中内容 |
| `Ctrl+C` | 发送 SIGINT（中断当前任务） |
| `Ctrl+V` | 粘贴文本 |
| `Ctrl+L` | 清屏（等同于 `clear`） |

#### 分屏与会话

| 快捷键 | 功能 |
|--------|------|
| `Alt+←` | 切换到左侧/上方分屏 |
| `Alt+→` | 切换到右侧/下方分屏 |
| `Ctrl+Tab` | 切换到下一个会话标签 |
| `Ctrl+Shift+Tab` | 切换到上一个会话标签 |

#### 文件引用

| 操作 | 功能 |
|------|------|
| 拖拽文件到终端 | 插入 `@/path/to/file` 引用 |
| 在文件树中点击文件 | 预览文件内容 |

#### UI 操作

| 操作 | 功能 |
|------|------|
| 标题栏 `?` 按钮 | 打开本文档（GitHub） |
| 标题栏 GitHub 图标 | 打开项目仓库 |
| 标题栏更新按钮 | 检查更新 |
| 标题栏 `—` `□` `✕` | 最小化 / 最大化 / 关闭窗口 |

---

## English

### Table of Contents

1. [Terminal & Sessions](#1-terminal--sessions)
2. [Sidebar Panels](#2-sidebar-panels)
3. [API Profiles & Model Switching](#3-api-profiles--model-switching)
4. [Token Stats & Cost](#4-token-stats--cost)
5. [Telegram Channel](#5-telegram-channel-1)
6. [Debug Browser](#6-debug-browser)
7. [Git Worktree Support](#7-git-worktree-support)
8. [ASCII Pet System](#8-ascii-pet-system)
9. [MCP Management](#9-mcp-management)
10. [Skills Management](#10-skills-management)
11. [Plugin System](#11-plugin-system)
12. [Guide Panel](#12-guide-panel)
13. [Settings Panel](#13-settings-panel)
14. [Keyboard Shortcuts Reference](#14-keyboard-shortcuts-reference)

---

### 1. Terminal & Sessions

#### Multi-session Tabs

- Click `+` at the top to create a new session, choose a working directory
- Each session runs an independent Claude Code CLI instance
- Session tabs show the working directory name; hover for the full path
- Multiple sessions can run simultaneously in the background

#### Split Terminal

- **Horizontal split**: click the split button in a session, or use the sidebar action — places two terminals side by side
- **Vertical split**: top-and-bottom split
- **Drag to resize**: drag the divider between panes
- **Switch panes**: `Alt+←` / `Alt+→` to move focus between left/right or top/bottom

#### Persistent Shell (Daemon Mode)

- A background daemon keeps the shell alive when the GUI window is closed
- Reconnects automatically when the GUI reopens; scroll buffer is fully preserved
- Toggle in Settings → Persistent Shell

#### Terminal Operations

| Action | Description |
|--------|-------------|
| Select text | Entering copy-ready state |
| `Ctrl+Shift+C` | Copy selection to clipboard |
| `Ctrl+C` | Send SIGINT to interrupt current task |
| `Ctrl+V` | Paste text |
| Drag file to terminal | Inserts `@/path/to/file` reference |
| Right-click menu | Copy / Paste / Clear / etc. |

---

### 2. Sidebar Panels

The sidebar is on the left; click an icon to switch panels.

#### File Tree (Files)

- Shows the file structure of the current session's working directory
- Click a file for preview (text / image / Office documents)
- **Drag to terminal**: auto-generates `@/path/to/file` path reference
- Double-click folders to expand/collapse
- Search box at the top filters by filename

#### History

- Lists all saved session histories
- Support for **labels** (add tags to categorize)
- **Search**: filter by name or label
- Click a history entry to restore the session (in current or new window)
- Each window maintains its own independent history

#### Slash Commands

- Shows custom commands from `~/.claude/commands/`
- Click a command to insert it into the terminal
- Create, edit, and delete custom commands

#### Settings

See [Section 13](#13-settings-panel).

#### Token Stats

See [Section 4](#4-token-stats--cost).

#### Plugins

See [Section 11](#11-plugin-system).

#### Guide Panel

See [Section 12](#12-guide-panel).

#### MCP Panel

See [Section 9](#9-mcp-management).

#### Skills Panel

See [Section 10](#10-skills-management).

#### Pet

See [Section 8](#8-ascii-pet-system).

#### Todo List

- Shows Todo items generated by Claude in the current task (parsed from JSONL logs)
- Real-time updates, checkbox state synced
- Quick-jump to the corresponding session

#### Trigger

- Configure auto-trigger rules: when terminal output matches a pattern, execute a command automatically
- Supports regex matching, delayed trigger, one-shot/loop modes

#### DevLog

- Records a summary log of each Claude task
- Filter by date/session, quickly review past work

---

### 3. API Profiles & Model Switching

#### Multiple Profiles

Each profile independently stores:

| Field | Description |
|-------|-------------|
| Name | Profile display name |
| API Key | Service provider key |
| Base URL | API endpoint (blank = Anthropic official) |
| Default Model | Model used for new sessions |
| Pricing | Custom input/output price per million tokens (¥) |

#### Preset Profiles

- **Anthropic Official**: direct connection, no Base URL needed
- **Alibaba DashScope**: pre-configured endpoint `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **Custom**: any Anthropic-compatible API

#### Switching Profiles

- Settings → API Profiles → click "Set Active" on a profile row
- **New sessions** automatically use the currently active profile
- Existing sessions are not affected

#### Model Selection

- Settings → Default Model dropdown
- Supports manual entry of any model ID (for third-party compatibility)

---

### 4. Token Stats & Cost

#### Stats Panel

- Open via the Stats icon in the sidebar
- Shows **Today** and **Total** summary rows

#### Field Reference

| Symbol | Meaning | Color |
|--------|---------|-------|
| `↑` | Input tokens | Default |
| `↓` | Output tokens | Default |
| `⚡` | cacheRead (cache hit) | Sky blue |
| `☁` | cacheCreate (cache write) | Orange |
| Amount | Estimated cost (¥) | Amber |

> `☁ cacheCreate` is **hidden by default**; hover over the token row to reveal it and check cache write cost.

#### Per-Model Breakdown

- Expand the summary row to see Opus / Sonnet / Haiku token usage and cost individually
- Each model row also shows cacheCreate on hover

#### Level System

- Cumulative usage maps to levels 1–300, displayed as a progress bar
- Level icon changes as you level up

#### Official Pricing (CNY)

| Model | Input/M | Output/M | cacheCreate/M | cacheRead/M |
|-------|---------|----------|---------------|-------------|
| Opus | ¥35 | ¥175 | ¥43.75 | ¥3.50 |
| Sonnet | ¥21 | ¥105 | ¥26.25 | ¥2.10 |
| Haiku | ¥1.75 | ¥8.75 | ¥2.19 | ¥0.18 |

Custom pricing is configured in Settings → API Profiles.

---

### 5. Telegram Channel

#### Overview

Send messages to Claude via a Telegram Bot; Claude's replies are pushed back to Telegram in real time.

#### Multi-bot Presets

- Add multiple Bot Tokens in Settings → Telegram Channel
- Each preset independently stores its pairing state and access-control whitelist
- **One-click tab switching** between bots, new token applied automatically

#### Configuration Fields

| Field | Description |
|-------|-------------|
| Bot Token | Token issued by Telegram BotFather |
| Whitelist | Telegram user IDs allowed to send messages |
| Pairing state | Shows whether the bot is connected and working |

#### Check Button

Click "Check" to verify the current token configuration and display the Claude Code version.

#### Force Reconnect (↻)

- **When to use**: `-32000` error, usually caused by a stale bot process or cross-session PID conflict
- **How**: click the `↻` button
- **Effect**:
  1. Reads the current session's `bot.pid` file
  2. Terminates the old bot process with SIGTERM (with PID-reuse protection)
  3. Deletes the `bot.pid` file
  4. Sends `/plugin` to the terminal to trigger reconnection

#### Single-session Lock

- Only one Claude process may hold a given bot at a time
- Prevents 409 Conflict when multiple windows are running in parallel

---

### 6. Debug Browser

#### Embedded Browser

- Built-in Chromium browser (Electron BrowserView)
- Open via the sidebar browser icon or via MCP tool calls
- Adjustable browser/terminal split ratio

#### MCP Tools (Claude can call)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_screenshot` | Take a screenshot |
| `browser_click` | Click an element (CSS selector) |
| `browser_type` | Type text |
| `browser_evaluate` | Run JavaScript |
| `browser_scroll` | Scroll the page |
| `browser_wait_for` | Wait for an element |

#### Routine Recording / Playback

1. **Start recording**: `browser_routine_record_start` (or the UI record button)
2. **Perform actions**: manually operate the browser (click/type/navigate)
3. **Stop recording**: `browser_routine_record_stop` — routine saved to the project directory
4. **Playback**: `browser_routine_run <name>`

#### 7 Supported Routine Actions

| Action | Description |
|--------|-------------|
| `navigate` | Go to a URL |
| `click` | Click an element |
| `type` | Type text |
| `select` | Select a dropdown option |
| `sleep` | Wait N milliseconds |
| `wait_for` | Wait for a selector to appear |
| `evaluate` | Run JS; result can be stored in `${variable}` |

#### Parameterized Templates

- Use `${varName}` placeholders in routines
- Supply actual values at playback time
- `evaluate` steps can write results back to variables for subsequent steps

---

### 7. Git Worktree Support

#### Create a Worktree

1. Sidebar Files panel → Git Worktree tab
2. Choose an existing branch or enter a new branch name
3. Click "Create Worktree"
4. The worktree directory opens automatically in a new split pane

#### Worktree List

- Lists all worktrees for the current repo
- Shows branch name, path, number of unmerged commits
- Click "Open in split" to open the directory in a new terminal pane

#### Merge Worktree

- Select a worktree → merge to main branch
- After merging, optionally delete the worktree directory

---

### 8. ASCII Pet System

#### Enable the Pet

Sidebar → Pet icon, or Settings → Pet Settings.

#### 13 Idle Activities

| Activity | Description |
|----------|-------------|
| `look` | Look left and right |
| `blink` | Blink |
| `sleep` | Sleeping (💤) |
| `play` | Playing |
| `curious` | Curious glance |
| `yawn` | Yawning |
| `stretch` | Stretching |
| `hungry` | Hungry (bowl) |
| `sneeze` | Sneezing |
| `groom` | Grooming |
| `wiggle` | Wiggling |
| `tilt` | Head tilt |
| `doze` | Dozing |
| `walk` | Walking |

#### Interactions

- **Click the pet**: triggers happy animation and a random reply
- **Auto-trigger**: after Claude completes a task, the pet may comment with adjustable probability (0–100%)
- Probability configured in Settings → Pet Settings

---

### 9. MCP Management

#### Auto-registered MCPs

Registered automatically to `~/.claude/.claude.json` on launch:

| MCP | Purpose |
|-----|---------|
| `office-cli` | Office document processing (docx/xlsx/pptx) |
| `browser-tools` | Embedded browser actions |
| `visual-agent` | Local image analysis (using the configured multimodal API) |

#### MCP Panel Actions

- **View** all registered MCP servers and their status
- **Toggle** individual MCPs (disable temporarily without removing config)
- **Refresh**: re-scan the config file

---

### 10. Skills Management

- Corresponds to the skills directory under `~/.claude/` (Claude Code skills / slash commands)
- **List** all skill files
- **View / Edit** skill content
- **Create / Delete** skills
- Click "Open Directory" to open the skills folder in the file explorer

---

### 11. Plugin System

- Install and manage Claude HUD plugins
- Lists installed plugins with version and status
- **Install**: enter a plugin ID or select from the list
- **Uninstall**: remove plugin files and config
- **Update**: check for and download new versions

---

### 12. Guide Panel

- Built-in Claude Code best practices library
- Organized by category (prompt tips / workflows / FAQ, etc.)
- Click a tip to copy to clipboard or insert directly into the terminal

---

### 13. Settings Panel

Open via the Settings (gear) icon in the sidebar.

#### General

| Setting | Description |
|---------|-------------|
| Language | Chinese / English |
| Theme | Dark (currently only dark theme) |
| Permission preset | acceptEdits / autoApprove / askFirst, etc. |

#### API Profiles

- Add / Edit / Delete profiles
- Fields: name, API Key, Base URL, default model, pricing (input/output, ¥/M tokens)
- Click "Set Active" to switch the active profile

#### Default Model

- Dropdown or manual model ID entry

#### Telegram Channel

- Add/remove Bot Token presets
- Check button: verify configuration
- `↻` Force Reconnect: kill old bot and reconnect

#### Pet Settings

- Toggle pet visibility
- Adjust auto-trigger probability (0–100%)
- Adjust activity animation speed

#### Persistent Shell

- Enable/disable daemon mode
- View current daemon status

---

### 14. Keyboard Shortcuts Reference

#### Terminal

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+C` | Send SIGINT (interrupt current task) |
| `Ctrl+V` | Paste text |
| `Ctrl+L` | Clear screen (equivalent to `clear`) |

#### Split Panes & Sessions

| Shortcut | Action |
|----------|--------|
| `Alt+←` | Switch focus to left / top pane |
| `Alt+→` | Switch focus to right / bottom pane |
| `Ctrl+Tab` | Switch to next session tab |
| `Ctrl+Shift+Tab` | Switch to previous session tab |

#### File References

| Action | Result |
|--------|--------|
| Drag file to terminal | Inserts `@/path/to/file` reference |
| Click file in File Tree | Preview file content |

#### UI

| Action | Result |
|--------|--------|
| Title bar `?` button | Open this document on GitHub |
| Title bar GitHub icon | Open project repository |
| Title bar update button | Check for updates |
| Title bar `—` `□` `✕` | Minimize / Maximize / Close window |
