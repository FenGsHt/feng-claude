import type { SlashCommandItem } from './claudeSlashCommands'

/** Codex TUI 的 `/` 指令摘要，不能与 Claude Code 专属命令混用。 */
export const CODEX_SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  { command: '/help', description: '查看 Codex TUI 的帮助和可用指令' },
  { command: '/new', description: '新建一个空上下文的会话' },
  { command: '/resume', description: '选择并恢复已保存的 Codex 会话' },
  { command: '/fork', description: '从当前会话分叉出新会话' },
  { command: '/model', description: '选择 Codex 使用的模型' },
  { command: '/reasoning', description: '调整推理强度' },
  { command: '/approval', description: '查看或调整工具执行的审批方式' },
  { command: '/status', description: '查看登录、模型、配置与会话状态' },
  { command: '/compact', description: '压缩当前上下文以继续长对话' },
  { command: '/diff', description: '查看当前工作区改动' },
  { command: '/review', description: '对当前改动或指定目标执行代码审查' },
  { command: '/init', description: '初始化项目指令文件 AGENTS.md' },
  { command: '/skills', description: '查看当前可用的 Codex Skills' },
  { command: '/mcp', description: '查看和管理 MCP 连接' },
  { command: '/plan', description: '切换或配置规划协作模式' },
  { command: '/logout', description: '退出 Codex 登录状态' },
  { command: '/quit', description: '退出 Codex CLI；别名 /exit' }
]
