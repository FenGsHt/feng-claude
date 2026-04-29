# Changelog

All notable changes to this project will be documented in this file.

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