# Releases

> 每次版本更新时，将以下内容复制到 GitHub Release 中。
> Copy this content to GitHub Release on each version bump.

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
