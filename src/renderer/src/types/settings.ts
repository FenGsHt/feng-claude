/**
 * 对应 `claude --permission-mode`，见 Claude Code 文档 permission modes。
 * - acceptEdits：多数编辑与常用文件系统命令自动批准，其它仍询问（「大部分」）。
 * - bypassPermissions：跳过绝大多数权限确认（「允许所有行动」，敏感目录写入仍可能提示）。
 */
export type ClaudePermissionPreset = 'acceptEdits' | 'bypassPermissions'

export interface ClaudeSettings {
  authToken: string
  baseUrl: string
  model: string
  sonnetModel: string
  haikuModel: string
  opusModel: string
  subagentModel: string
  disableExperimentalBetas: boolean
  permissionPreset: ClaudePermissionPreset
  /**
   * 填项目根路径（内含 `.claude/skills`）。非空时启动 Claude 附加 `--add-dir`，
   * 任意 cwd 会话也会合并该目录下的 skills（见 Claude Code 文档）。
   */
  sharedSkillAddDir: string
}

export const DEFAULT_SETTINGS: ClaudeSettings = {
  authToken: '',
  baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
  model: 'glm-5',
  sonnetModel: 'glm-5',
  haikuModel: 'glm-5',
  opusModel: 'glm-5',
  subagentModel: 'glm-5',
  disableExperimentalBetas: true,
  permissionPreset: 'acceptEdits',
  sharedSkillAddDir: ''
}
