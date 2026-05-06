# Fallout 主题（indeed-flow-git）→ claude-gui

## 源项目文件

| 说明 | 路径 |
|------|------|
| 主题主样式 | `D:\git2\python_file\python_file\openclaw\indeed-flow-git\src\themes\fallout.css` |
| 与 Nexus 共用布局 | `...\src\themes\nexus.css`（`:is([data-theme="nexus"], [data-theme="fallout"])`） |
| 运行时：Canvas 命令行背景、Pip-Boy 注入 | `...\src\theme-engine.js`（`#fo-bg-canvas`、`#fo-pipboy`、`activateFallout` / `deactivateFallout`） |
| HTML 入口 | `...\index.html`（链入 `fallout.css`，主题切换 `data-theme="fallout"`） |

## 本仓库落地文件

| 文件 | 用途 |
|------|------|
| `indeed-fallout-source.css` | 从 indeed 复制的**原始**样式备份；类名针对游戏库页面，本应用 DOM 不同，勿直接整文件 import。 |
| `fallout-port.css` | 已接入：把磷光配色映射到 `--claude-*`，CRT 叠加在 `html`，由 `globals.css` import。 |
| `hooks/useTheme.ts` 内 `FALLOUT_THEME` | xterm.js ANSI 配色（磷光绿终端）。 |

## 设计摘要（indeed）

- **主色**：`#2aff4d`（正文/强调）；次要 `#1baa30`；高亮黄绿 `#aaff44`、`#88ee22`。
- **背景**：`#020502` / 面板 `#040904`，边框 `rgba(42,255,77,0.28)`。
- **字体**：Google Fonts `VT323`，`--font-ui` / `--font-display` 均为 VT323。
- **发光**：`--phosphor` / `--phosphor-dim` / `--phosphor-heavy` 多层 `text-shadow`、`box-shadow`（rgba 42,255,77）。
- **CRT**：无位图；`::before` 扫描亮带动画 `fo-scanroll`，`::after` 扫描线 + RGB 细缝 + `fo-flicker` 闪烁。
- **JS**：Canvas 随机 RobCo 风格字符（绿字）；侧边栏注入 Pip-Boy 装饰 HTML（本应用未移植，需要时可 React 化）。

## 在本应用中启用

1. **设置 → 主题模式 → Fallout**（写入 `theme: 'fallout'`）。
2. 或调试：`document.documentElement.setAttribute('data-theme', 'fallout')`。

自动模式（auto）不会切换到 Fallout；需显式选择。

## 后续可扩展

- 将 `theme-engine.js` 中 Canvas / Pip-Boy 做成 React 组件，在挂载 Fallout 时注入、`useEffect` 清理。
- indeed 全站 `text-transform: uppercase`，本端口默认未启用，以免代码与路径难读；若需要可在 `fallout-port.css` 对单一容器开启。
- 如需更接近 indeed 的卡片/按钮形态，从 `indeed-fallout-source.css` 按需摘录选择器并改为匹配本应用的 Tailwind 外壳类名。
