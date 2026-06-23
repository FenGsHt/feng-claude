# 配置/Telegram 徽章从 TabBar 迁移到 PaneHeader — 设计文档

日期：2026-06-22
状态：已批准设计，待实现

## 背景与问题

当前每个会话 tab（`TabBar.tsx`）里都内嵌了「API 配置切换药丸」(显示 profile 名，如 `官方配置`/`qwen3.7-plus`) 和「Telegram 频道药丸」(如 `未关联`)。这两个药丸让每个 tab 都很宽，抬高了窗口的最小宽度。

目标：把这两个药丸从 tab 内移到下方 `TerminalPaneHeader`（`claude-gui` 那一行）标题右侧，按所在 pane 的会话作用。tab 随之大幅瘦身，窗口可以更窄。

## 现状结构

垂直三栏：`TitleBar`（Feng Claude）→ `TabBar`（每会话一个 tab，含两个药丸）→ `TerminalPaneHeader`（每 pane 一行，含标题 + 动作图标）。

药丸相关逻辑目前全部在 `TabBar.tsx`：
- 组件：`ProfileDropdown`、`TelegramPresetDropdown`（均为 portal + fixed 定位，避免被 overflow 裁剪）
- 辅助：`telegramTabBadgeLabel`、`getProfileName`
- 处理：`handleProfileSwitch`→`restartSession(sessionId, profileId)`、`handleTelegramPresetSwitch`、`handleTelegramClear`
- 状态：`settings`、`telegramPresets`、`dropdownAnchor`、`telegramDropdownAnchor`、`showTelegramSetupGuide`、`telegramGuideSessionId`、`badgeRefs`、`telegramBadgeRefs`
- 弹窗：`TelegramSetupGuideDialog`

`TerminalPaneHeader.tsx:415` 有历史注释，表明 Telegram 配置曾在 pane header 附近，后被移到 tab 栏——本次相当于迁回，符合既有脉络。

## 设计

### 1. 新组件 `SessionConfigBadges.tsx`

新建 `src/renderer/src/components/terminal/SessionConfigBadges.tsx`，自包含承载两枚药丸及其全部交互：

- **Props**：`{ sessionId: string; focused: boolean }`
- **内部**：
  - 加载 settings + 订阅 `onSettingsChanged`（与现有多处组件一致的 `settings.get()` 模式）
  - 维护两个 dropdown 的 anchor 状态、setup guide 弹窗状态
  - 渲染：配置药丸按钮 + Telegram 药丸按钮 + 两个 portal dropdown + `TelegramSetupGuideDialog`
- **显示条件**（不变）：
  - 配置药丸：`settings.profiles.length > 0`
  - Telegram 药丸：`settings.telegramChannel?.enabled === true`
- **行为**（不变，仅触发入口迁移）：
  - 选配置 → `restartSession(sessionId, profileId)`
  - 选 Telegram 预设 → 从 electron-store 拉最新预设 → `updateSessionTelegramChannel` → `restartSession(sessionId, undefined, cfg)`
  - 清除 Telegram → `restartSession(sessionId, undefined, { enabled:false })`
  - profile 名解析复用 `getProfileName`（优先 `sess.profileName` 快照，回退按 settings 解析）

从 `TabBar.tsx` 迁入本文件：`ProfileDropdown`、`TelegramPresetDropdown`、`telegramTabBadgeLabel`、`getProfileName`、相关 handlers。

样式沿用原 tab 药丸：`focused` 为真用激活配色（amber/sky 高亮），否则用静默配色。

### 2. PaneHeader 接入

`TerminalPaneHeader.tsx` 头部内层结构调整为左右两组：

```
[左组 flex-1 min-w-0]  状态点 + 标题(truncate) + <SessionConfigBadges sessionId focused/>
[右组 shrink-0]        动作图标(embed/refresh/split/worktree/mic/browser/close)
```

效果：
```
● claude-gui  [官方配置][未关联]            ↻ ▯▯ □ ✕
```

标题从 `flex-1` 改为在左组内 `min-w-0 truncate`，徽章紧随其后 `shrink-0`；左组整体 `flex-1` 把右侧动作图标推到最右。徽章 dropdown 仍用 portal，向下展开到终端区（z-9999）。

### 3. TabBar 瘦身

从 `TabBar.tsx` 删除：
- 两枚药丸按钮 JSX 及 `badgeRefs`/`telegramBadgeRefs`
- 两个 dropdown portal 渲染、`TelegramSetupGuideDialog`
- 迁出的组件/辅助/handlers/state：`ProfileDropdown`、`TelegramPresetDropdown`、`telegramTabBadgeLabel`、`getProfileName`、`handleProfileSwitch`、`handleBadgeClick`、`handleTelegramBadgeClick`、`handleTelegramPresetSwitch`、`handleTelegramClear`、`dropdownAnchor`、`telegramDropdownAnchor`、`showTelegramSetupGuide`、`telegramGuideSessionId`、`telegramGuideResolvedDir`、`settings`、`telegramPresets` 及其加载 effect
- 不再使用的 import

tab 保留：状态点、文件夹图标、标题、重启按钮、关闭按钮。tab 自然宽度大幅下降。

> 注：迁出后需确认 `TabBar` 不再引用 `settings`/telegram 相关符号；若有遗留引用一并清理。

### 4. 行为/范围变化

- 徽章作用于**所在 pane 的会话**；分屏时每个 pane header 各显示各自会话的配置（比原来更直观）。
- 后台未激活 tab 想换配置：先点开该 tab 再操作（为瘦身付出的取舍，已与用户确认）。
- 切换/重启/Telegram 预设流程逻辑不变。

### 范围外

- 不动 `TitleBar`，不合并行（本次只迁移徽章，目标是收窄 tab）。
- 不改 dropdown 的定位实现（继续用 portal + getBoundingClientRect）。

## 单元边界

- `SessionConfigBadges`：输入 `sessionId`/`focused`，自管理 settings 与弹窗，输出对该会话的配置/Telegram 切换副作用。可独立理解与复用。
- `TerminalPaneHeader`：仅新增一处子组件渲染 + 标题区布局微调。
- `TabBar`：纯删减，职责收敛为「会话列表 + 新建/切换/关闭/重启」。

## 测试

无单测框架，靠构建 + 手动验证：
1. 构建通过（`npm run build`）。
2. 单 pane：header 标题右侧出现配置/Telegram 药丸；点击弹出 dropdown，切换配置触发会话重启并应用新 profile。
3. 分屏：每个 pane header 显示各自会话的药丸，互不串。
4. tab 栏不再有药丸，tab 明显变窄；窗口可拉得更窄。
5. Telegram 全局未启用时不显示 Telegram 药丸；无 profile 时不显示配置药丸。
6. Telegram 设置说明弹窗仍可从 dropdown 打开，stateDir 解析正确。

## 验收标准

1. 配置/Telegram 药丸出现在 PaneHeader 标题右侧，作用于该 pane 会话。
2. TabBar 的 tab 不再含这两个药丸，且无残留死代码/未用 import。
3. 切换配置、切换/清除 Telegram 预设、打开设置说明等功能行为与迁移前一致。
4. 分屏下各 pane 互不干扰。
5. 构建通过。
