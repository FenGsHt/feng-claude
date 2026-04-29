import { v4 as uuidv4 } from 'uuid'

/**
 * 对应 `claude --permission-mode`，见 Claude Code 文档 permission modes。
 * - acceptEdits：多数编辑与常用文件系统命令自动批准，其它仍询问（「大部分」）。
 * - bypassPermissions：跳过绝大多数权限确认（「允许所有行动」，敏感目录写入仍可能提示）。
 */
export type ClaudePermissionPreset = 'acceptEdits' | 'bypassPermissions'

export type AppLanguage = 'zh' | 'en'

/**
 * [2026-04-28] API 配置 - 支持多配置切换
 * 每个 profile 包含完整的 API 连接参数
 */
export interface ApiProfile {
  /** UUID */
  id: string
  /** 显示名称 */
  name: string
  /** API Token */
  authToken: string
  /** API Base URL */
  baseUrl: string
  /** 默认模型 */
  model: string
  /** Sonnet 模型 */
  sonnetModel: string
  /** Haiku 模型 */
  haikuModel: string
  /** Opus 模型 */
  opusModel: string
  /** 子代理模型 */
  subagentModel: string
  /** 模型上下文窗口大小（K tokens, e.g. 200 = 200K） */
  contextWindow?: number
  /** 禁用实验性 Beta */
  disableExperimentalBetas: boolean
  /** [2026-04-28] 费用估算（每百万 token 价格） */
  pricing?: {
    inputPerM: number
    outputPerM: number
    cacheCreatePerM: number
    cacheReadPerM: number
  }
}

export type ThemeMode = 'dark' | 'light' | 'auto'

export interface ClaudeSettings {
  language: AppLanguage
  permissionPreset: ClaudePermissionPreset
  /** [2026-04-29] UI 主题，存入 electron-store 以便跨重启持久化 */
  theme?: ThemeMode
  /** 开启后侧边栏显示「日志」tab，可查看应用日志并打开 DevTools */
  devMode?: boolean
  /**
   * 填项目根路径（内含 `.claude/skills`）。非空时启动 Claude 附加 `--add-dir`，
   * 任意 cwd 会话也会合并该目录下的 skills（见 Claude Code 文档）。
   */
  sharedSkillAddDir: string
  /**
   * 为 true 时同步到 `CLAUDE_CONFIG_DIR/settings.json` 的 `skipDangerousModePermissionPrompt`，
   * 使用 bypass 等模式时不再每次出现「Yes, I accept」确认（仅限可信环境）。
   */
  skipDangerousModePermissionPrompt: boolean
  /** [2026-04-28] 所有 API 配置 */
  profiles: ApiProfile[]
  /** [2026-04-28] 当前激活的配置 ID */
  activeProfileId: string
  /** [2026-04-28] 宠物专用 API 配置（独立于主配置） */
  petApi?: {
    /** 宠物 API Token */
    authToken: string
    /** 宠物 API Base URL */
    baseUrl: string
    /** 宠物使用的模型 */
    model: string
    /** 请求头格式：'anthropic' | 'openai' | 'anthropic-bearer' */
    format?: 'anthropic' | 'openai' | 'anthropic-bearer'
  }
}

/** 默认 API 配置 */
export function createDefaultProfile(name: string, id: string): ApiProfile {
  return {
    id,
    name,
    authToken: '',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    model: 'glm-5',
    sonnetModel: 'glm-5',
    haikuModel: 'glm-5',
    opusModel: 'glm-5',
    subagentModel: 'glm-5',
    disableExperimentalBetas: true,
    pricing: {
      inputPerM: 3,
      outputPerM: 15,
      cacheCreatePerM: 3.75,
      cacheReadPerM: 0.30
    }
  }
}

/** [2026-04-28] 默认费用估算 */
export const DEFAULT_PRICING = {
  inputPerM: 3,
  outputPerM: 15,
  cacheCreatePerM: 3.75,
  cacheReadPerM: 0.30
}

const DEFAULT_PROFILE_ID = 'default'

export const DEFAULT_SETTINGS: ClaudeSettings = {
  language: 'zh',
  permissionPreset: 'acceptEdits',
  sharedSkillAddDir: '',
  skipDangerousModePermissionPrompt: false,
  profiles: [createDefaultProfile('Default', DEFAULT_PROFILE_ID)],
  activeProfileId: DEFAULT_PROFILE_ID
}

/**
 * [2026-04-28] 从旧版扁平配置迁移到 profile 格式
 * 用于兼容旧版 claude-settings.json
 */
export function migrateOldSettings(old: Record<string, unknown>): ClaudeSettings {
  const migratedProfile: ApiProfile = {
    id: 'migrated-' + uuidv4(),
    name: 'Default (Migrated)',
    authToken: String(old.authToken ?? ''),
    baseUrl: String(old.baseUrl ?? DEFAULT_SETTINGS.profiles[0].baseUrl),
    model: String(old.model ?? DEFAULT_SETTINGS.profiles[0].model),
    sonnetModel: String(old.sonnetModel ?? DEFAULT_SETTINGS.profiles[0].sonnetModel),
    haikuModel: String(old.haikuModel ?? DEFAULT_SETTINGS.profiles[0].haikuModel),
    opusModel: String(old.opusModel ?? DEFAULT_SETTINGS.profiles[0].opusModel),
    subagentModel: String(old.subagentModel ?? DEFAULT_SETTINGS.profiles[0].subagentModel),
    disableExperimentalBetas: Boolean(old.disableExperimentalBetas ?? true)
  }
  return {
    language: String(old.language ?? 'zh') as AppLanguage,
    permissionPreset: String(old.permissionPreset ?? 'acceptEdits') as ClaudePermissionPreset,
    sharedSkillAddDir: String(old.sharedSkillAddDir ?? ''),
    skipDangerousModePermissionPrompt: Boolean(old.skipDangerousModePermissionPrompt),
    profiles: [migratedProfile],
    activeProfileId: migratedProfile.id
  }
}