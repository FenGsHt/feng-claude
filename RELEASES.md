# Releases

> 每次版本更新时，将以下内容复制到 GitHub Release 中。
> Copy this content to GitHub Release on each version bump.

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
