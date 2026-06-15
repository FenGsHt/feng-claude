# Feng Claude — 完整功能手册 / Full Feature Manual

[English](#english) | [中文](#中文)

---

## 中文

### 目录

1. [终端与会话](#1-终端与会话)
2. [文本编辑器](#2-文本编辑器)
3. [侧栏面板](#3-侧栏面板)
4. [API Profile 与模型切换](#4-api-profile-与模型切换)
5. [Token 统计与费用](#5-token-统计与费用)
6. [语音输入](#6-语音输入)
7. [Telegram Channel](#7-telegram-channel)
8. [调试浏览器](#8-调试浏览器)
9. [Git Worktree 支持](#9-git-worktree-支持)
10. [ASCII 宠物系统](#10-ascii-宠物系统)
11. [MCP 管理](#11-mcp-管理)
12. [Skills 管理](#12-skills-管理)
13. [插件系统](#13-插件系统)
14. [Guide 面板](#14-guide-面板)
15. [设置面板](#15-设置面板)
16. [快捷键速查](#16-快捷键速查)

---

### 1. 终端与会话

#### 多会话标签

- 点击顶部 `+` 按钮新建会话，选择工作目录后启动
- 每个会话独立运行 Claude Code CLI，互不干扰
- 会话标签显示当前工作目录名，悬浮查看完整路径
- 支持同时保持多个会话活跃（后台持续运行）

#### 新建会话选项

| 选项 | 说明 |
|------|------|
| 选择工作目录 | 从最近目录列表选，或浏览选择其他文件夹 |
| Resume 模式 | 恢复上次会话对话（等同于 `claude --continue`） |
| 空控制台模式 | 只启动 Shell，不启动 Claude Code |
| 打开文本文件 | 直接在编辑器中打开文件 |
| API Profile | 可指定本次会话使用的 Profile（默认用当前激活 Profile） |

#### 分屏终端

- **右侧分屏**：点击终端标题栏的 ⊞ 按钮，在右侧新开一个窗格
- **下方分屏**：点击 ⊟ 按钮，在下方新开一个窗格
- **拖拽调整**：拖动分屏中间的分隔线调整比例
- **嵌套分屏**：支持多层嵌套，横纵自由组合

#### 分屏间切换焦点

| 快捷键 | 说明 |
|--------|------|
| `Alt+←` | 切换到左侧窗格 |
| `Alt+→` | 切换到右侧窗格 |
| `Alt+↑` | 切换到上方窗格 |
| `Alt+↓` | 切换到下方窗格 |
| `Alt+E` | 切换到上一个会话（在标签列表中循环） |
| `Alt+R` | 切换到下一个会话（在标签列表中循环） |

#### 持久化 Shell（守护进程模式）

- 后台守护进程保持 Shell 运行，关闭 GUI 窗口不终止 Claude 任务
- 重新打开 GUI 后自动恢复连接，滚动缓冲区完整保留
- Settings → 持久化 Shell 可开关此功能

#### 终端操作

| 操作 | 说明 |
|------|------|
| `Ctrl+Shift+C` | 复制选中内容到剪贴板 |
| `Ctrl+C` | 发送 SIGINT 中断当前任务 |
| `Ctrl+V` | 粘贴文本 |
| 拖拽文件到终端 | 插入 `@/path/to/file` 引用 |
| 拖拽文件夹到终端 | 插入 `@/path/to/dir/` 引用 |
| 拖拽斜杠命令到终端 | 直接发送 `/command` |
| 拖拽 Office 文件 | 自动打开 Office 预览面板 |

---

### 2. 文本编辑器

- **双击文件树中的文本文件**：在右侧分栏打开文本编辑器
- **双击图片文件**（png/jpg/gif/webp/svg/avif 等）：在分栏中预览
- **双击 Office 文件**（docx/xlsx/pptx）：打开 Office 预览面板

#### 编辑器功能

| 功能 | 说明 |
|------|------|
| 行号显示 | 左侧行号，实时更新 |
| 未保存提示 | 有未保存改动时标题栏显示 `•` |
| 保存失败提示 | 写入失败时显示红色错误提示条 |
| 状态栏 | 底部显示行/列/文件大小 |
| 从磁盘重新加载 | 按钮手动从磁盘刷新文件内容 |
| `Ctrl+F` | 在文件内搜索，字符级精准高亮，↑↓ 导航 |
| `Ctrl+P` | 弹出文件搜索框，模糊匹配项目内所有文件，↑↓ 选择，`Enter` 打开 |

---

### 3. 侧栏面板

侧栏位于左侧，点击图标切换不同面板。

| 面板 | 说明 |
|------|------|
| **文件树**（Files） | 项目文件树，支持拖拽引用、文件预览 |
| **Todo 列表**（TodoList） | 实时展示 Claude 当前任务的 Todo 项 |
| **触发器**（Trigger） | 配置终端输出匹配自动触发规则 |
| **历史记录**（History） | 会话历史，支持标签/搜索/恢复 |
| **Slash Commands** | 管理 `~/.claude/commands/` 自定义命令 |
| **Token 统计**（Stats） | 用量图表，profile 对比，热力图 |
| **插件**（Plugins） | 管理 Claude HUD 插件 |
| **Skills** | 管理 Claude Code skills |
| **MCP** | MCP 服务器可视化管理 |
| **宠物**（Pet） | ASCII 宠物系统 |
| **Guide** | Claude Code 最佳实践技巧库 |
| **设置**（Settings） | 所有设置项 |
| **DevLog** | 任务摘要日志（仅开发者模式） |

#### 文件树（Files）

- 展示当前会话工作目录的文件结构
- **双击文本文件**：在右侧分栏打开编辑器
- **双击图片**：在分栏预览
- **双击 Office 文件**：打开 Office 预览
- **拖拽文件到终端**：自动生成 `@` 路径引用
- **全树搜索**：顶部搜索框递归遍历整个工作目录，深层文件（三级以上）也能搜到，结果显示文件名 + 相对路径
- **搜索结果右键"在文件树中定位"**：一键清空搜索并级联展开文件树到该项位置，平滑滚动并短暂高亮（菜单还含复制绝对路径、在文件管理器中打开、@ 引用）
- **自动刷新**：监听工作目录文件增删/重命名，自动刷新文件树（保留已展开文件夹状态）

#### 历史记录（History）

- 列出所有已保存会话历史
- 支持**标签标记**、**搜索**过滤
- 点击历史条目一键恢复（当前或新窗口）
- 不同窗口历史独立保存

#### Todo 列表（TodoList）

- 从 Claude 会话 JSONL 日志实时解析 Todo 项目
- 显示待完成/进行中/已完成状态，实时更新
- 点击条目可快速跳转到对应会话

#### 触发器（Trigger）

- 当终端输出匹配正则时自动执行命令
- 支持单次/循环触发，延迟执行

#### 开发日志（DevLog）

- 记录每次 Claude 任务的摘要日志（仅开发者模式）
- 按日期/会话过滤，快速回顾

---

### 4. API Profile 与模型切换

#### 多 Profile 配置

每个 Profile 独立保存：

| 字段 | 说明 |
|------|------|
| 名称 | Profile 显示名 |
| API Key | 服务商密钥 |
| Base URL | API 端点（留空为 Anthropic 官方） |
| 默认模型 | 新建会话使用的模型 |
| 定价 | 自定义每百万 token 的输入/输出/cacheCreate/cacheRead 价格（元） |

#### 预设 Profile

- **Anthropic 官方**：直连，Base URL 留空
- **阿里云 DashScope**：预置 `https://coding.dashscope.aliyuncs.com/apps/anthropic`
- **自定义**：任意兼容 Anthropic API 格式的服务

#### 切换 Profile

- Settings → API Profiles → 点击"设为激活"
- 新建会话自动使用当前激活 Profile
- 已有会话不受影响

---

### 5. Token 统计与费用

#### Token 统计面板（底部 Widget）

| 符号 | 含义 | 颜色 |
|------|------|------|
| `↑` | 输入 token | 默认 |
| `↓` | 输出 token | 默认 |
| `⚡` | cacheRead（缓存命中） | 天蓝色 |
| `☁` | cacheCreate（写入缓存，悬浮可见） | 橙色 |
| 金额 | 估算费用（元） | 琥珀色 |

- Today / 累计 两行汇总
- 点击展开 MODELS 分项，显示 Opus / Sonnet / Haiku 各自费用（官方 Profile 用 per-model 精确定价）
- `☁ cacheCreate` 默认隐藏，鼠标悬浮后出现

#### 统计面板（侧栏 Stats）

- **时间范围**：今日 / 本周 / 全部
- **汇总卡片**：token 总量、活跃天数、连续天数、最常用 Profile
- **各 Profile 占比饼图**
- **各 Profile 用量列表**（含费用）
- **近 14 天柱状图**（按 Profile 堆叠）：悬浮查看当日各 Profile 明细
- **点击热力图按钮**：打开 GitHub 风格贡献热力图（44 周 × 7 天）

#### 费用计算说明

| 模型 | 输入/M | 输出/M | cacheCreate/M | cacheRead/M |
|------|--------|--------|---------------|-------------|
| Opus | ¥35 | ¥175 | ¥43.75 | ¥3.50 |
| Sonnet | ¥21 | ¥105 | ¥26.25 | ¥2.10 |
| Haiku | ¥7 | ¥35 | ¥8.75 | ¥0.70 |
| Fable | ¥70 | ¥350 | ¥87.50 | ¥7.00 |

官方 Profile 用 per-model 精确定价，第三方 Profile 用 Profile 自定义定价。

---

### 6. 语音输入

- 点击终端标题栏的麦克风图标，或按 `Alt+M`（可在 Settings 中自定义热键）开始录音
- 支持浏览器内置 Web Speech API 和外部 Whisper API 两种模式
- 识别结果自动插入终端输入

#### 语音设置（Settings → 语音输入）

| 设置项 | 说明 |
|--------|------|
| 热键 | 默认 `Alt+M`，可自定义 |
| 引擎 | Web Speech API / Whisper（需填 API Key 和端点） |
| 语言 | 识别语言（如 `zh-CN`、`en-US`） |

---

### 7. Telegram Channel

#### 功能概览

通过 Telegram Bot 向 Claude 发消息，回复实时推送回 Telegram。

#### 多 Bot 预设

- Settings → Telegram Channel 添加多条 Bot Token
- 每条预设独立保存配对状态、访问控制白名单
- 标签栏**一键切换** Bot

#### 配置字段

| 字段 | 说明 |
|------|------|
| Bot Token | Telegram BotFather 发放的 Token |
| 白名单 | 允许发消息的 Telegram 用户 ID |
| stateDirId | 状态目录 ID（对应 `~/.claude/channels/<id>/`） |

#### 检测按钮

验证 Token 配置有效性，显示 Claude Code 版本。

#### 强制重连（↻）

- **场景**：出现 `-32000` 错误（旧 bot 进程 / 跨会话 PID 占用）
- **操作**：Settings → Telegram Channel → 点击 `↻`
- **效果**：SIGTERM 终止旧 bot → 删 bot.pid → 向终端发 `/plugin` 触发重连

#### 单会话锁

防止多个 Claude 进程争抢同一 bot（防 409 Conflict）。

---

### 8. 调试浏览器

#### 内嵌浏览器

- 应用内置 Chromium（Electron BrowserView）
- 通过侧栏或 MCP 工具打开
- 可调整浏览器/终端分栏比例
- **网页收藏**：导航栏 ☆/★ 按钮收藏/取消当前页；收藏栏（第三行）显示所有收藏，点击跳转，× 删除；持久化到本地
- **URL 历史下拉**：点击地址栏展开历史列表，支持实时过滤，键盘导航选择

#### 完整 MCP 工具列表（共 42 个）

Claude 可调用以下工具操作浏览器：

**导航与内容读取**

| 工具 | 说明 |
|------|------|
| `browser_navigate` | 跳转 URL |
| `browser_get_url` | 获取当前页面 URL |
| `browser_get_text` | 提取页面文字（可指定 CSS 选择器，最多 30000 字符） |
| `browser_get_html` | 获取页面或元素 HTML 源码 |
| `browser_get_forms` | 枚举页面所有表单和输入字段 |
| `browser_get_frames` | 列出所有 iframe 及其坐标 |
| `browser_get_cookies` | 获取当前 URL 的 Cookie |

**交互操作**

| 工具 | 说明 |
|------|------|
| `browser_click` | 点击 CSS 选择器匹配的元素 |
| `browser_click_at` | 点击页面坐标（支持跨域 iframe） |
| `browser_click_human` | 模拟人类点击（含抖动和延迟） |
| `browser_type` | 向输入框输入文字 |
| `browser_type_human` | 逐字符输入（含随机延迟，模拟人工） |
| `browser_hover` | 悬浮元素（触发 tooltip/效果） |
| `browser_select` | 设置 `<select>` 下拉值 |
| `browser_check` | 勾选/取消勾选 checkbox 或 radio |
| `browser_key` | 发送键盘按键（Enter/Tab/Escape/方向键等） |
| `browser_scroll` | 滚动页面（相对 deltaY 或绝对坐标） |
| `browser_drag` | 模拟拖拽（贝塞尔曲线路径，仿人工） |
| `browser_wait_for` | 等待 CSS 选择器出现在 DOM 中 |

**截图与对比**

| 工具 | 说明 |
|------|------|
| `browser_screenshot` | 截取当前视口截图（PNG base64） |
| `browser_screenshot_element` | 截取指定元素（裁剪） |
| `browser_screenshot_full` | 全页截图（自动滚动拼接） |
| `browser_screenshot_diff` | 逐像素对比两张 PNG，返回相似度 % 和差异图 |

**JavaScript 执行**

| 工具 | 说明 |
|------|------|
| `browser_eval` | 在页面上下文执行 JS（支持同源 iframe） |
| `browser_eval_in_frame` | 在跨域 iframe 的 CDP 隔离世界中执行 JS |

**历史与控制台**

| 工具 | 说明 |
|------|------|
| `browser_back` | 返回上一页 |
| `browser_forward` | 前进下一页 |
| `browser_reload` | 刷新页面 |
| `browser_console` | 获取控制台日志（log/warn/error/info/debug） |

**UI 控制**

| 工具 | 说明 |
|------|------|
| `browser_show` | 显示内嵌浏览器 |
| `browser_hide` | 隐藏内嵌浏览器 |
| `browser_devtools` | 开关 DevTools（控制台/网络/元素） |

**标签页管理**

| 工具 | 说明 |
|------|------|
| `browser_tab_list` | 列出当前会话的所有标签页 |
| `browser_tab_new` | 新建标签页（可指定 URL） |
| `browser_tab_select` | 切换到指定标签页 |
| `browser_tab_close` | 关闭标签页 |

**网站克隆**

| 工具 | 说明 |
|------|------|
| `browser_capture_resources` | 下载页面所有资源（HTML/CSS/JS/图片/字体）到本地，生成 manifest.json |
| `browser_site_pages` | 发现站点所有内部页面/路由 |
| `browser_clone_page` | 克隆单个页面：下载资源、导出 CSS、重写 URL、接线导航 |
| `browser_clone_site` | 克隆整站：自动发现路由，录制 API 响应，启动预览服务器，计算视觉相似度 |
| `browser_wire_navigation` | 将 href 链接重写为本地克隆文件路径 |
| `browser_serve_local` | 启动本地 HTTP 服务器预览克隆 HTML |
| `browser_patch_element` | 提取元素的 computed style（含伪元素），自动写入克隆文件 |

**Routine 录制/回放**

| 工具 | 说明 |
|------|------|
| `browser_routine_list` | 列出当前项目的所有录制 routine |
| `browser_routine_record_start` | 开始录制（点击/输入/导航） |
| `browser_routine_record_stop` | 停止录制，保存为 routine JSON |
| `browser_routine_run` | 回放 routine（支持 `${var}` 模板参数，返回变量/状态） |
| `browser_routine_delete` | 删除 routine |

**Office 文件**

| 工具 | 说明 |
|------|------|
| `office_preview` | 在内置预览面板中打开 Office 文件（.docx/.xlsx/.pptx） |

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

- Routine 中使用 `${变量名}` 占位符
- 回放时传入实际值，`evaluate` 步骤可把结果写回变量供后续步骤使用

---

### 9. Git Worktree 支持

#### 创建 Worktree

1. 终端标题栏点击 Worktree 图标
2. 选"New branch"（新分支）或"Existing branch"（已有分支）
3. 点击"创建 Worktree"，自动在新分屏中打开

#### Worktree 面板功能

| 功能 | 说明 |
|------|------|
| 列出所有 worktree | 显示分支名、路径、未合并提交数 |
| 在分屏中打开 | 点击即在新终端中打开对应目录 |
| 合并到主分支 | 一键 merge 回主仓库 |
| 从主分支更新 | 把主仓库最新内容同步到 worktree |
| 删除 worktree | 删除目录和分支（含确认） |
| 未合并提交徽章 | 自动提示有未合并提交的 worktree |

---

### 10. ASCII 宠物系统

#### 开启宠物

侧栏 → Pet 图标。

#### 13 种空闲活动

`look` / `blink` / `sleep` / `play` / `curious` / `yawn` / `stretch` / `hungry` / `sneeze` / `groom` / `wiggle` / `tilt` / `doze` / `walk`

#### 互动

- **点击宠物**：触发 happy 动画和随机回复
- **自动触发**：Claude 完成任务后，以可调概率（0–100%）触发宠物技术点评
- 触发概率在 Settings → 宠物设置中调整

---

### 11. MCP 管理

#### 自动注册

应用启动时注册到 `~/.claude/.claude.json`：

| MCP | 功能 |
|-----|------|
| `office-cli` | Office 文档处理（docx/xlsx/pptx） |
| `browser-tools` | 内嵌浏览器 42 个操作工具 |
| `visual-agent` | 本地图片分析（调用配置的多模态 API） |

#### MCP 面板操作

- 查看所有 MCP 服务器及其状态
- 单独开关（临时禁用不删配置）
- 刷新重新扫描配置文件

---

### 12. Skills 管理

- 对应 `~/.claude/` 下的 skills 目录
- 列出、查看、编辑、新建、删除 skill 文件
- 点击"打开目录"在文件管理器中打开

---

### 13. 插件系统

- 安装 / 卸载 / 更新 Claude HUD 插件
- 列出已安装插件的版本和状态

---

### 14. Guide 面板

- 内置 Claude Code 最佳实践技巧库
- 分类展示（提示技巧 / 工作流 / 常见问题）
- 点击技巧复制到剪贴板或直接插入终端

---

### 15. 设置面板

侧栏 → 设置图标打开。

| 分类 | 设置项 |
|------|--------|
| 常规 | 语言（中/英）、权限预设 |
| API Profiles | 新增/编辑/删除 Profile，字段：名称/Key/Base URL/模型/定价 |
| 默认模型 | 下拉或手动输入 model id |
| Telegram Channel | Bot Token 预设、检测、强制重连 |
| 语音输入 | 热键、引擎（Web Speech / Whisper）、语言 |
| 宠物设置 | 开关、自动触发概率、动画速度 |
| 持久化 Shell | 开关守护进程模式 |
| 开发者模式 | 开启后侧栏显示 DevLog 面板 |

---

### 16. 快捷键速查

#### 终端

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+C` | 复制终端选中内容 |
| `Ctrl+C` | 发送 SIGINT（中断当前任务） |
| `Ctrl+V` | 粘贴文本 |
| `Shift+Enter` | 外嵌模式下输入换行（不发送） |

#### 分屏与会话导航

| 快捷键 | 功能 |
|--------|------|
| `Alt+←` | 切换到左侧分屏 |
| `Alt+→` | 切换到右侧分屏 |
| `Alt+↑` | 切换到上方分屏 |
| `Alt+↓` | 切换到下方分屏 |
| `Alt+E` | 切换到上一个会话（标签列表循环） |
| `Alt+R` | 切换到下一个会话（标签列表循环） |

#### 语音输入

| 快捷键 | 功能 |
|--------|------|
| `Alt+M` | 切换语音录音（可在 Settings 中自定义） |

#### 文本编辑器

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+F` | 在文件内查找（字符级高亮） |
| `Ctrl+P` | 打开文件搜索框（模糊匹配项目文件） |
| `↑` / `↓` | 在搜索结果中导航 |
| `Enter` | 打开选中文件 |
| `Escape` | 关闭搜索框/弹窗 |

#### 文件引用

| 操作 | 功能 |
|------|------|
| 拖拽文件到终端 | 插入 `@/path/to/file` |
| 拖拽文件夹到终端 | 插入 `@/path/to/dir/` |
| 拖拽 Office 文件到终端 | 打开 Office 预览面板 |
| 在文件树中双击文本文件 | 在分栏打开编辑器 |
| 在文件树中双击图片 | 在分栏预览 |

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
2. [Text Editor](#2-text-editor)
3. [Sidebar Panels](#3-sidebar-panels)
4. [API Profiles & Model Switching](#4-api-profiles--model-switching)
5. [Token Stats & Cost](#5-token-stats--cost)
6. [Voice Input](#6-voice-input)
7. [Telegram Channel](#7-telegram-channel-1)
8. [Debug Browser](#8-debug-browser)
9. [Git Worktree Support](#9-git-worktree-support)
10. [ASCII Pet System](#10-ascii-pet-system)
11. [MCP Management](#11-mcp-management)
12. [Skills Management](#12-skills-management)
13. [Plugin System](#13-plugin-system)
14. [Guide Panel](#14-guide-panel)
15. [Settings Panel](#15-settings-panel)
16. [Keyboard Shortcuts Reference](#16-keyboard-shortcuts-reference)

---

### 1. Terminal & Sessions

#### Multi-session Tabs

- Click `+` to create a new session; choose a working directory
- Each session runs an independent Claude Code CLI instance
- Tab shows the working directory name; hover for the full path
- Multiple sessions can run simultaneously in the background

#### New Session Options

| Option | Description |
|--------|-------------|
| Working directory | Pick from recent dirs or browse |
| Resume mode | Resume last conversation (`claude --continue`) |
| Shell-only mode | Launch bare shell without Claude Code |
| Open text file | Open a file directly in the editor |
| API Profile | Override the profile for this session |

#### Split Terminal

- **Split right**: click ⊞ in the pane header
- **Split down**: click ⊟ in the pane header
- **Drag to resize**: drag the divider between panes
- **Nested splits**: supports multiple levels, horizontal and vertical

#### Switch Focus Between Panes

| Shortcut | Action |
|----------|--------|
| `Alt+←` | Focus left pane |
| `Alt+→` | Focus right pane |
| `Alt+↑` | Focus upper pane |
| `Alt+↓` | Focus lower pane |
| `Alt+E` | Switch to previous session (cyclic) |
| `Alt+R` | Switch to next session (cyclic) |

#### Persistent Shell (Daemon Mode)

- Background daemon keeps the shell alive when GUI closes
- Reconnects automatically on reopen; scroll buffer fully preserved
- Toggle in Settings → Persistent Shell

#### Terminal Operations

| Action | Description |
|--------|-------------|
| `Ctrl+Shift+C` | Copy selection to clipboard |
| `Ctrl+C` | Send SIGINT to interrupt current task |
| `Ctrl+V` | Paste text |
| Drag file to terminal | Inserts `@/path/to/file` |
| Drag folder to terminal | Inserts `@/path/to/dir/` |
| Drag slash command | Sends `/command` directly |
| Drag Office file | Auto-opens Office preview panel |

---

### 2. Text Editor

- **Double-click a text file** in the file tree → opens in a split pane editor
- **Double-click an image** (png/jpg/gif/webp/svg/avif…) → previews in split pane
- **Double-click an Office file** (.docx/.xlsx/.pptx) → opens Office preview

#### Editor Features

| Feature | Description |
|---------|-------------|
| Line numbers | Left gutter, always visible |
| Unsaved indicator | `•` in title when there are unsaved changes |
| Save error bar | Red banner if write fails |
| Status bar | Line / column / file size at the bottom |
| Reload from disk | Button to manually refresh from disk |
| `Ctrl+F` | In-file search with character-level highlight, ↑↓ navigate |
| `Ctrl+P` | Fuzzy file picker for all project files; ↑↓ to navigate, `Enter` to open |

---

### 3. Sidebar Panels

| Panel | Description |
|-------|-------------|
| **File Tree** (Files) | Project file tree; drag-to-reference, file preview |
| **Todo List** | Real-time Claude task todos parsed from JSONL |
| **Trigger** | Auto-trigger rules on terminal output |
| **History** | Session history with labels/search/restore |
| **Slash Commands** | Manage `~/.claude/commands/` |
| **Token Stats** (Stats) | Usage charts, profile breakdown, heatmap |
| **Plugins** | Claude HUD plugin manager |
| **Skills** | Claude Code skills manager |
| **MCP** | Visual MCP server management |
| **Pet** | ASCII pet system |
| **Guide** | Claude Code best practices |
| **Settings** | All settings |
| **DevLog** | Task summary log (developer mode only) |

---

### 4. API Profiles & Model Switching

#### Multiple Profiles

Each profile independently stores:

| Field | Description |
|-------|-------------|
| Name | Display name |
| API Key | Provider key |
| Base URL | Endpoint (blank = Anthropic official) |
| Default Model | Model used for new sessions |
| Pricing | Custom ¥/M for input/output/cacheCreate/cacheRead |

#### Preset Profiles

- **Anthropic Official**: blank Base URL
- **Alibaba DashScope**: pre-configured endpoint
- **Custom**: any Anthropic-compatible API

---

### 5. Token Stats & Cost

#### Token Widget (bottom bar)

| Symbol | Meaning | Color |
|--------|---------|-------|
| `↑` | Input tokens | Default |
| `↓` | Output tokens | Default |
| `⚡` | cacheRead (cache hit) | Sky blue |
| `☁` | cacheCreate (hover to show) | Orange |
| Amount | Estimated cost (¥) | Amber |

- Today / Total summary rows
- Expand MODELS for per-model breakdown (Opus/Sonnet/Haiku with accurate per-model pricing)

#### Stats Panel (sidebar)

- Time range: Today / This Week / All
- Summary cards: tokens, active days, streaks, favorite profile
- Per-profile pie chart and usage list
- 14-day stacked bar chart (hover for daily detail)
- Contribution heatmap (44 weeks × 7 days)

#### Official Pricing (CNY)

| Model | Input/M | Output/M | cacheCreate/M | cacheRead/M |
|-------|---------|----------|---------------|-------------|
| Opus | ¥35 | ¥175 | ¥43.75 | ¥3.50 |
| Sonnet | ¥21 | ¥105 | ¥26.25 | ¥2.10 |
| Haiku | ¥7 | ¥35 | ¥8.75 | ¥0.70 |
| Fable | ¥70 | ¥350 | ¥87.50 | ¥7.00 |

---

### 6. Voice Input

- Click the microphone icon in the pane header, or press `Alt+M` (configurable)
- Supports Web Speech API (browser built-in) and Whisper API
- Recognized text is inserted into the terminal input

#### Voice Settings

| Setting | Description |
|---------|-------------|
| Hotkey | Default `Alt+M`, configurable |
| Engine | Web Speech API or Whisper (requires API key + endpoint) |
| Language | Recognition language (e.g. `zh-CN`, `en-US`) |

---

### 7. Telegram Channel

#### Overview

Send messages to Claude via a Telegram Bot; Claude replies in real time.

#### Multi-bot Presets

- Add multiple Bot Tokens in Settings → Telegram Channel
- Each preset stores its own pairing state and access-control whitelist
- One-click tab switching between bots

#### Force Reconnect (↻)

- **When**: `-32000` error (stale bot process / cross-session PID conflict)
- **How**: click `↻` in Settings
- **Effect**: SIGTERM old bot → delete bot.pid → send `/plugin` to reconnect

---

### 8. Debug Browser

#### Embedded Browser

- Built-in Chromium (Electron BrowserView)
- Adjustable browser/terminal split ratio

#### Complete MCP Tool List (42 tools)

**Navigation & Content**

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL |
| `browser_get_url` | Get current page URL |
| `browser_get_text` | Extract text (CSS selector optional, max 30k chars) |
| `browser_get_html` | Get HTML source (full page or element) |
| `browser_get_forms` | Enumerate all forms and inputs |
| `browser_get_frames` | List all iframes with coordinates |
| `browser_get_cookies` | Get cookies for current URL |

**Interaction**

| Tool | Description |
|------|-------------|
| `browser_click` | Click element by CSS selector |
| `browser_click_at` | Click at page coordinates (works on cross-origin iframes) |
| `browser_click_human` | Realistic click with jitter/delay |
| `browser_type` | Type text into input |
| `browser_type_human` | Type character-by-character with random delays |
| `browser_hover` | Hover to trigger tooltips/effects |
| `browser_select` | Set `<select>` dropdown value |
| `browser_check` | Check/uncheck checkbox or radio |
| `browser_key` | Send keyboard key (Enter/Tab/Escape/Arrow etc.) |
| `browser_scroll` | Scroll page (relative deltaY or absolute coords) |
| `browser_drag` | Simulate drag with Bezier curve path |
| `browser_wait_for` | Wait for CSS selector to appear in DOM |

**Screenshots & Diff**

| Tool | Description |
|------|-------------|
| `browser_screenshot` | Capture viewport (PNG base64) |
| `browser_screenshot_element` | Capture specific element (cropped) |
| `browser_screenshot_full` | Full-page screenshot (auto-scroll & stitch) |
| `browser_screenshot_diff` | Pixel-by-pixel diff of two PNGs, returns similarity % |

**JavaScript**

| Tool | Description |
|------|-------------|
| `browser_eval` | Run JS in page context (same-origin iframe supported) |
| `browser_eval_in_frame` | Run JS in cross-origin iframe via CDP isolated world |

**History & Console**

| Tool | Description |
|------|-------------|
| `browser_back` | Go back |
| `browser_forward` | Go forward |
| `browser_reload` | Reload page |
| `browser_console` | Get console logs (log/warn/error/info/debug) |

**UI Control**

| Tool | Description |
|------|-------------|
| `browser_show` | Show embedded browser |
| `browser_hide` | Hide embedded browser |
| `browser_devtools` | Toggle DevTools |

**Tab Management**

| Tool | Description |
|------|-------------|
| `browser_tab_list` | List all tabs in this session |
| `browser_tab_new` | Open new tab (optional URL) |
| `browser_tab_select` | Switch to tab |
| `browser_tab_close` | Close tab |

**Website Cloning**

| Tool | Description |
|------|-------------|
| `browser_capture_resources` | Download all page resources (HTML/CSS/JS/images/fonts) + manifest.json |
| `browser_site_pages` | Discover all internal pages/routes |
| `browser_clone_page` | Clone single page: resources, CSS export, URL rewrite, navigation wiring |
| `browser_clone_site` | Clone entire site: auto-discover routes, record API responses, preview server, visual similarity score |
| `browser_wire_navigation` | Rewrite href links to local cloned file paths |
| `browser_serve_local` | Start local HTTP server to preview cloned HTML |
| `browser_patch_element` | Extract element computed styles (incl. pseudo-elements), write into clone |

**Routine Recording/Playback**

| Tool | Description |
|------|-------------|
| `browser_routine_list` | List recorded routines for current project |
| `browser_routine_record_start` | Start recording (clicks/inputs/navigation) |
| `browser_routine_record_stop` | Stop and save as routine JSON |
| `browser_routine_run` | Replay routine (`${var}` placeholders, returns variables/status) |
| `browser_routine_delete` | Delete a routine |

**Office**

| Tool | Description |
|------|-------------|
| `office_preview` | Open Office file in the built-in preview panel |

#### Routine — 7 Supported Action Types

| Action | Description |
|--------|-------------|
| `navigate` | Go to URL |
| `click` | Click element |
| `type` | Type text |
| `select` | Select dropdown option |
| `sleep` | Wait N milliseconds |
| `wait_for` | Wait for selector to appear |
| `evaluate` | Run JS; result stored in `${variable}` |

---

### 9. Git Worktree Support

#### Create a Worktree

1. Click the Worktree icon in the pane header
2. Choose "New branch" or "Existing branch"
3. Click "Create" — opens in a new split pane automatically

#### Worktree Panel Features

| Feature | Description |
|---------|-------------|
| List all worktrees | Shows branch name, path, unmerged commit count |
| Open in split | Opens directory in a new terminal pane |
| Merge to main | One-click merge back to main repo |
| Update from main | Pull latest from main into worktree |
| Delete worktree | Removes directory and branch (with confirm) |
| Unmerged badge | Automatically flags branches with unmerged commits |

---

### 10. ASCII Pet System

#### 13 Idle Activities

`look` / `blink` / `sleep` / `play` / `curious` / `yawn` / `stretch` / `hungry` / `sneeze` / `groom` / `wiggle` / `tilt` / `doze` / `walk`

#### Interactions

- **Click the pet**: triggers happy animation and a random reply
- **Auto-trigger**: after Claude completes a task, the pet may comment with adjustable probability (0–100%)

---

### 11. MCP Management

#### Auto-registered MCPs

| MCP | Purpose |
|-----|---------|
| `office-cli` | Office document processing |
| `browser-tools` | 42 embedded browser tools |
| `visual-agent` | Local image analysis (multimodal API) |

---

### 12. Skills Management

- Manages the skills directory under `~/.claude/`
- List / view / edit / create / delete skill files
- "Open Directory" opens the folder in the file explorer

---

### 13. Plugin System

- Install / uninstall / update Claude HUD plugins
- Shows installed plugins with version and status

---

### 14. Guide Panel

- Built-in Claude Code best practices library
- Organized by category
- Click to copy to clipboard or insert into terminal

---

### 15. Settings Panel

| Category | Settings |
|----------|----------|
| General | Language (zh/en), permission preset |
| API Profiles | Add/edit/delete profiles (key, URL, model, pricing) |
| Default Model | Dropdown or manual model ID |
| Telegram Channel | Bot Token presets, check, force reconnect |
| Voice Input | Hotkey, engine (Web Speech / Whisper), language |
| Pet | Toggle, auto-trigger probability, animation speed |
| Persistent Shell | Enable/disable daemon mode |
| Developer Mode | Enables DevLog panel in sidebar |

---

### 16. Keyboard Shortcuts Reference

#### Terminal

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+C` | Send SIGINT (interrupt task) |
| `Ctrl+V` | Paste text |
| `Shift+Enter` | Insert newline in embed input (no send) |

#### Split Panes & Session Navigation

| Shortcut | Action |
|----------|--------|
| `Alt+←` | Focus left pane |
| `Alt+→` | Focus right pane |
| `Alt+↑` | Focus upper pane |
| `Alt+↓` | Focus lower pane |
| `Alt+E` | Switch to previous session (cyclic) |
| `Alt+R` | Switch to next session (cyclic) |

#### Voice Input

| Shortcut | Action |
|----------|--------|
| `Alt+M` | Toggle voice recording (configurable in Settings) |

#### Text Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | In-file search (character-level highlight) |
| `Ctrl+P` | Fuzzy file picker for project files |
| `↑` / `↓` | Navigate search results |
| `Enter` | Open selected file |
| `Escape` | Close search / modal |

#### File References

| Action | Result |
|--------|--------|
| Drag file to terminal | `@/path/to/file` |
| Drag folder to terminal | `@/path/to/dir/` |
| Drag Office file to terminal | Opens Office preview panel |
| Double-click text file in tree | Opens in editor split pane |
| Double-click image in tree | Preview in split pane |

#### UI

| Action | Result |
|--------|--------|
| Title bar `?` | Open this document on GitHub |
| Title bar GitHub icon | Open project repository |
| Title bar update button | Check for updates |
| Title bar `—` `□` `✕` | Minimize / Maximize / Close |
