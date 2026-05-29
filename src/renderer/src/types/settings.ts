import { v4 as uuidv4 } from 'uuid'

/**
 * 对应 `claude --permission-mode`，见 Claude Code 文档 permission modes。
 * - acceptEdits：多数编辑与常用文件系统命令自动批准，其它仍询问（「大部分」）。
 * - bypassPermissions：跳过绝大多数权限确认（「允许所有行动」，敏感目录写入仍可能提示）。
 */
export type ClaudePermissionPreset = 'acceptEdits' | 'bypassPermissions'

export type AppLanguage = 'zh' | 'en'

/**
 * [2026-04-30] 备用 API 配置（容灾）
 */
export interface FallbackConfig {
  /** UUID */
  id: string
  /** 显示名称 */
  name: string
  /** 是否启用 */
  enabled: boolean
  /** 备用 Base URL */
  baseUrl: string
  /** 备用 API Token */
  authToken: string
  /** 备用默认模型 */
  model?: string
  /** 备用 Sonnet 模型 */
  sonnetModel?: string
  /** 备用 Haiku 模型 */
  haikuModel?: string
  /** 备用 Opus 模型 */
  opusModel?: string
  /** 备用子代理模型 */
  subagentModel?: string
  /** [2026-04-30] 请求格式：'anthropic' 使用 x-api-key，'openai' 使用 Authorization: Bearer */
  format?: 'anthropic' | 'openai'
}

/** 官方配置的固定 ID，不存入 profiles 数组，仅用于 activeProfileId */
export const OFFICIAL_PROFILE_ID = '__official__'

/** 官方配置虚拟对象，不注入任何 ANTHROPIC_* 环境变量，Claude Code 使用自身存储的 credentials */
export const OFFICIAL_PROFILE = {
  id: OFFICIAL_PROFILE_ID,
  name: '官方配置',
  authToken: '',
  baseUrl: '',
  model: '',
  sonnetModel: '',
  haikuModel: '',
  opusModel: '',
  subagentModel: '',
  disableExperimentalBetas: false,
  isOfficial: true as const,
} as const satisfies Partial<ApiProfile> & { id: string; name: string; isOfficial: true }

/**
 * [2026-04-28] API 配置 - 支持多配置切换
 * 每个 profile 包含完整的 API 连接参数
 */
export interface ApiProfile {
  /** 官方配置标记：true 时不注入任何 ANTHROPIC_* 环境变量 */
  isOfficial?: boolean
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
  /** [2026-04-30] 多级备用配置（容灾）— 按顺序依次尝试 */
  fallbacks?: FallbackConfig[]
  /** [2026-04-30] 请求格式：'anthropic' 使用 x-api-key，'openai' 使用 Authorization: Bearer */
  format?: 'anthropic' | 'openai'
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackBaseUrl?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackAuthToken?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackModel?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackSonnetModel?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackHaikuModel?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackOpusModel?: string
  /** [2026-04-30] @deprecated 旧版单备用配置，已迁移到 fallbacks[0] */
  fallbackSubagentModel?: string
}

/** [2026-05-06] fallout：indeed-flow-git RobCo 磷光绿（见 styles/FALLOUT_THEME_REFERENCE.md） */
export type ThemeMode = 'dark' | 'light' | 'auto' | 'fallout' | 'claude-code'

/** [2026-05-08] 每条预设自带 Token + State Dir，无「全局默认」概念 */
export interface TelegramBotPreset {
  id: string
  name: string
  botToken: string
  stateDirId: string
}

export interface TelegramChannelGlobalSettings {
  /** 是否启用 Telegram Channel（开启且填写 Token 后新建会话会套用） */
  enabled: boolean
  /** 全局 Bot Token；保存时同步生成单条 botPresets 供标签栏切换 */
  defaultBotToken?: string
  /** [2026-05-08] 对应 ~/.claude/channels/<id>，默认 telegram */
  defaultStateDirId?: string
  /** @deprecated 旧版「新建会话默认启用」；已由 enabled + Token 替代，读取时可忽略 */
  enableForNewSessions?: boolean
  /** 与 defaultBotToken 同步的单预设或多预设（标签栏） */
  botPresets?: TelegramBotPreset[]
}

export interface TelegramChannelSessionConfig {
  /** 当前会话是否启用官方 Telegram Channel */
  enabled: boolean
  /** [2026-05-08] 旧版遗留：曾为 true 时读全局 defaultBotToken；新保存不再写入 */
  useGlobalDefault?: boolean
  /** 本会话 Bot Token（启用时必填，除非仍为遗留 useGlobalDefault） */
  botToken?: string
  /** 稳定状态目录 ID，用于隔离 access.json / .env / pairing 状态 */
  stateDirId?: string
}

export interface ClaudeSettings {
  language: AppLanguage
  permissionPreset: ClaudePermissionPreset
  /** [2026-04-29] UI 主题，存入 electron-store 以便跨重启持久化 */
  theme?: ThemeMode
  /** 开启后侧边栏显示「日志」tab，可查看应用日志并打开 DevTools */
  devMode?: boolean
  /**
   * [2026-05-06] Beta：用应用内面板展示 Claude Code 会话 JSONL 中的对话摘要（需开启后才解析与推送，不影响默认终端）
   */
  embedClaudeOutputBeta?: boolean
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
  /** [2026-05-01] 用户手动禁用的插件 ID 列表（存储在 Feng Claude 本地，不受 Claude Code 覆盖） */
  disabledPluginIds?: string[]
  /** [2026-04-30] 开启本地 API 容灾代理 */
  enableApiProxy?: boolean
  /** [2026-05-01] 任务完成时发送系统通知 */
  enableNotifications?: boolean
  /** [2026-05-29] 禁止 Claude Code CLI 自动更新（注入 DISABLE_AUTOUPDATER=1） */
  disableAutoUpdate?: boolean
  /** [2026-05-08] 官方 Telegram Channel 默认配置；每个会话可覆盖 */
  telegramChannel?: TelegramChannelGlobalSettings
  /** [2026-05-06] 终端配置 */
  terminal?: {
    /** 自定义 Shell 路径（空 = 平台默认：Windows cmd.exe / Unix $SHELL） */
    shell?: string
    /** 空控制台会话用 tmux 包裹，实现关闭后再打开可恢复 */
    useTmux?: boolean
  }
  /** [2026-05-02] 语音识别配置 */
  speech?: {
    /** 是否在工具栏显示麦克风按钮（默认隐藏） */
    enabled: boolean
    /** 识别引擎 */
    engine: 'webSpeech' | 'whisper'
    /** 识别语言 */
    language: 'zh-CN' | 'en-US' | 'auto'
    /** 触发快捷键，格式如 "Alt+M" */
    shortcut: string
    /** Whisper API endpoint */
    whisperEndpoint: string
    /** Whisper API token */
    whisperToken: string
    /** Whisper 模型名 */
    whisperModel: string
    /** 麦克风设备 ID（空字符串=系统默认） */
    micDeviceId?: string
    /** Whisper prompt，用于引导输出风格（如简体中文） */
    whisperPrompt?: string
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
  activeProfileId: DEFAULT_PROFILE_ID,
  embedClaudeOutputBeta: false,
  telegramChannel: {
    enabled: false,
    defaultStateDirId: 'telegram',
    botPresets: []
  }
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