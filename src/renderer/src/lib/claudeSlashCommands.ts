/**
 * Claude Code 内置 `/` 命令摘要（Anthropic Commands 文档主表）。
 * 实际会话中可按 `/` 查看完整列表（含项目技能、插件、MCP 动态命令）。
 * @see https://docs.anthropic.com/en/docs/claude-code/commands
 */
export interface SlashCommandItem {
  /** 必须以 / 开头 */
  command: string
  /** 简短说明（中文） */
  description: string
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    command: '/add-dir',
    description: '添加当前会话可访问的工作目录（多数项目内 .claude 配置不会从这里加载）'
  },
  {
    command: '/agents',
    description: '管理 Subagent（子代理）配置'
  },
  {
    command: '/autofix-pr',
    description: '基于 Web 会话监视 PR，CI 失败或有 review 评论时自动推送修复（需 gh CLI）'
  },
  {
    command: '/batch',
    description: '[Skill] 大范围并行重构：拆分任务、多 worktree、各开 PR（需 git 仓库）'
  },
  {
    command: '/branch',
    description: '从当前会话创建分支对话；等价 /fork；可用 /resume 切回主线'
  },
  {
    command: '/btw',
    description: '侧栏式快速追问，不占主会话上下文'
  },
  {
    command: '/chrome',
    description: '配置 Claude in Chrome 浏览器集成'
  },
  {
    command: '/claude-api',
    description: '[Skill] 载入 Anthropic API / SDK 参考（依项目语言）'
  },
  {
    command: '/clear',
    description: '清空上下文开始新对话（旧会话仍可在 /resume）'
  },
  {
    command: '/color',
    description: '设置提示条颜色（红/蓝/绿等）'
  },
  {
    command: '/compact',
    description: '压缩对话摘要以腾出上下文；可附加说明摘要侧重点'
  },
  {
    command: '/config',
    description: '打开设置界面（主题、模型、输出风格等）；别名 /settings'
  },
  {
    command: '/context',
    description: '可视化当前上下文占用与优化建议'
  },
  {
    command: '/copy',
    description: '复制最近助手回复到剪贴板；可指定第 N 条'
  },
  {
    command: '/cost',
    description: '查看 Token 用量统计'
  },
  {
    command: '/debug',
    description: '[Skill] 开启调试日志并分析会话问题（可选问题描述）'
  },
  {
    command: '/desktop',
    description: '在 Claude Code 桌面应用中继续当前会话（macOS / Windows）'
  },
  {
    command: '/diff',
    description: '交互式查看未提交改动与各轮对话 diff'
  },
  {
    command: '/doctor',
    description: '诊断 Claude Code 安装与配置（可按 f 尝试自动修复）'
  },
  {
    command: '/effort',
    description: '设置模型 effort 档位（low/medium/high/xhigh/max）'
  },
  {
    command: '/exit',
    description: '退出 CLI；别名 /quit'
  },
  {
    command: '/export',
    description: '导出当前会话为文本；可指定文件名'
  },
  {
    command: '/extra-usage',
    description: '配置超额用量（限额用尽后仍可继续）'
  },
  {
    command: '/fast',
    description: '开关 Fast mode'
  },
  {
    command: '/feedback',
    description: '提交反馈；别名 /bug'
  },
  {
    command: '/fewer-permission-prompts',
    description: '[Skill] 扫描会话并为项目生成权限白名单以减少询问'
  },
  {
    command: '/focus',
    description: '切换焦点视图（全屏渲染下）'
  },
  {
    command: '/heapdump',
    description: '导出 JS 堆快照到桌面（排查内存）'
  },
  {
    command: '/help',
    description: '帮助与可用命令列表'
  },
  {
    command: '/hooks',
    description: '查看 Hook 配置'
  },
  {
    command: '/ide',
    description: 'IDE 集成状态与管理'
  },
  {
    command: '/init',
    description: '初始化项目 CLAUDE.md；可设 CLAUDE_CODE_NEW_INIT=1 走交互向导'
  },
  {
    command: '/insights',
    description: '生成会话使用分析报告'
  },
  {
    command: '/install-github-app',
    description: '为仓库配置 Claude GitHub Actions 应用'
  },
  {
    command: '/install-slack-app',
    description: '安装 Claude Slack 应用（浏览器 OAuth）'
  },
  {
    command: '/keybindings',
    description: '打开或创建快捷键配置'
  },
  {
    command: '/login',
    description: '登录 Anthropic 账号'
  },
  {
    command: '/logout',
    description: '登出账号'
  },
  {
    command: '/loop',
    description: '[Skill] 定时/循环执行提示（维护检查或自定义 interval）'
  },
  {
    command: '/mcp',
    description: '管理 MCP 服务与 OAuth'
  },
  {
    command: '/memory',
    description: '编辑 CLAUDE.md、开关 auto-memory、查看条目'
  },
  {
    command: '/mobile',
    description: '显示移动端 App 下载二维码'
  },
  {
    command: '/model',
    description: '选择或切换模型（无参打开选择器）'
  },
  {
    command: '/passes',
    description: '分享免费试用资格（账号需符合）'
  },
  {
    command: '/permissions',
    description: '管理允许/询问/拒绝等工具权限规则；别名 /allowed-tools'
  },
  {
    command: '/plan',
    description: '进入 Plan 模式；可跟任务描述'
  },
  {
    command: '/plugin',
    description: '管理 Claude Code 插件'
  },
  {
    command: '/powerup',
    description: '交互式功能导览教程'
  },
  {
    command: '/privacy-settings',
    description: '隐私设置（部分订阅计划）'
  },
  {
    command: '/recap',
    description: '生成当前会话一行摘要'
  },
  {
    command: '/release-notes',
    description: '交互式查看各版本更新说明'
  },
  {
    command: '/reload-plugins',
    description: '热重载插件无需重启会话'
  },
  {
    command: '/remote-control',
    description: '允许从 claude.ai 远程控制本会话；别名 /rc'
  },
  {
    command: '/remote-env',
    description: '配置 --remote Web 会话的默认远程环境'
  },
  {
    command: '/rename',
    description: '重命名会话并在提示条显示'
  },
  {
    command: '/resume',
    description: '按 ID/名称恢复会话或打开选择器；别名 /continue'
  },
  {
    command: '/review',
    description: '在本地会话中 Review PR'
  },
  {
    command: '/rewind',
    description: '回滚对话或代码检查点；别名 /checkpoint /undo'
  },
  {
    command: '/sandbox',
    description: '切换沙箱模式（平台支持时）'
  },
  {
    command: '/schedule',
    description: '创建/管理例行任务（routines）；别名 /routines'
  },
  {
    command: '/security-review',
    description: '基于当前分支 diff 做安全漏洞分析'
  },
  {
    command: '/setup-bedrock',
    description: 'Bedrock 向导（需 CLAUDE_CODE_USE_BEDROCK=1）'
  },
  {
    command: '/setup-vertex',
    description: 'Vertex AI 向导（需 CLAUDE_CODE_USE_VERTEX=1）'
  },
  {
    command: '/simplify',
    description: '[Skill] 并行审查近期改动并简化、修复代码质量'
  },
  {
    command: '/skills',
    description: '列出可用技能（按 t 可按 token 排序）'
  },
  {
    command: '/stats',
    description: '用量、会话历史与偏好可视化'
  },
  {
    command: '/status',
    description: '打开设置中的状态页（版本、模型、账户）'
  },
  {
    command: '/statusline',
    description: '配置 Claude Code 状态栏输出'
  },
  {
    command: '/stickers',
    description: '订购 Claude Code 贴纸（趣味）'
  },
  {
    command: '/tasks',
    description: '列出后台任务；等价别名 /bashes'
  },
  {
    command: '/team-onboarding',
    description: '根据近期用法生成团队上手文档'
  },
  {
    command: '/teleport',
    description: '把 Web 云端会话拉到当前终端（需订阅）'
  },
  {
    command: '/terminal-setup',
    description: '终端快捷键配置（VS Code/Cursor 等）'
  },
  {
    command: '/theme',
    description: '切换配色主题（含自动跟随终端明暗）'
  },
  {
    command: '/tui',
    description: '切换终端 UI 渲染（default / fullscreen）'
  },
  {
    command: '/ultraplan',
    description: 'Ultraplan：浏览器审计划再远端或拉回终端执行'
  },
  {
    command: '/ultrareview',
    description: '云端多代理深度 Code Review（PR）'
  },
  {
    command: '/upgrade',
    description: '打开升级订阅页面'
  },
  {
    command: '/usage',
    description: '套餐用量与限速状态'
  },
  {
    command: '/voice',
    description: '语音听写开关与模式（需 Claude.ai）'
  },
  {
    command: '/web-setup',
    description: '用本地 gh 凭据连接 GitHub 与 Web Claude Code'
  }
]
