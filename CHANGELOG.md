# Changelog

All notable changes to this project will be documented in this file.

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