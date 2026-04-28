export const zh = {
  // Sidebar tabs
  sidebar: {
    files: '文件',
    history: '历史',
    commands: '命令',
    stats: '统计',
    plugins: '插件',
    skills: 'Skills',
    mcp: 'MCP',
    guide: '指南',
    settings: '设置'
  },
  // Common actions
  common: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    search: '搜索',
    loading: '加载中...',
    confirm: '确认',
    confirmDelete: '确认删除',
    close: '关闭',
    create: '创建',
    refresh: '刷新',
    enable: '启用',
    disable: '禁用',
    enabled: '已启用',
    disabled: '已禁用',
    noResults: '无匹配结果',
    empty: '暂无数据',
    openFolder: '在文件管理器中打开',
    name: '名称',
    type: '类型',
    optional: '可选',
    error: '错误'
  },
  // Token usage widget
  token: {
    title: 'Token 用量',
    today: '今日',
    total: '累计',
    addBudget: '+ 预算',
    budgetTitle: '设置 Token 预算',
    budgetPlaceholder: '例：100M · 50K · 5000000',
    budgetInvalid: '格式无效',
    confirmReset: '确认重置?',
    resetTitle: '重置累计统计',
    footerHint: '开关立即生效，新会话重启后加载插件'
  },
  // History panel
  history: {
    search: '搜索历史...',
    empty: '暂无历史记录',
    deleteConfirm: '确认删除',
    resume: '恢复上次对话',
    openNew: '新建会话'
  },
  // Plugins panel
  plugins: {
    market: '市场',
    enabled: '已启用',
    searchPlaceholder: '搜索插件...',
    noEnabled: '未启用任何插件',
    noMatch: '无匹配插件',
    installed: '已安装',
    new: 'NEW',
    refreshTitle: '拉取最新插件',
    footerHint: '开关立即生效，新会话重启后加载插件',
    officialMarket: '官方市场',
    custom: '自定义'
  },
  // MCP panel
  mcp: {
    addServer: '添加服务器',
    editServer: '编辑',
    noServers: '暂无 MCP 服务器',
    addFirst: '点击添加',
    serverName: '名称',
    command: 'Command',
    args: 'Args（空格分隔）',
    url: 'URL',
    envVars: '环境变量（可选，每行 KEY=VALUE）',
    footerHint: '开关立即生效 · 重启会话后生效',
    enabledCount: '{enabled}/{total} 已启用',
    noServersEmpty: '无服务器'
  },
  // Skills panel
  skills: {
    searchPlaceholder: '搜索 skill...',
    createFirst: '创建第一个 Skill',
    newSkill: '新建 Skill',
    editSkill: '编辑',
    skillName: '命令名称（生成 /name 命令）',
    content: '内容（Markdown）',
    chars: '字符',
    emptyDir: '~/.claude/commands/ 为空',
    noMatch: '无匹配结果',
    footerSkillCount: '{count} 个 skill · ',
    folderBadge: 'folder'
  },
  // Stats panel
  stats: {
    title: 'Token 用量趋势',
    inputTokens: '输入',
    outputTokens: '输出',
    cacheRead: '缓存读',
    cacheCreate: '缓存写',
    noData: '暂无数据',
    days: '天',
    today: '今日',
    total: '累计'
  },
  // Settings panel
  settings: {
    title: '设置',
    language: '界面语言',
    languageZh: '中文',
    languageEn: 'English',
    authToken: 'Auth Token',
    baseUrl: 'API Base URL',
    model: '默认模型',
    permissionPreset: '权限模式',
    permissionAcceptEdits: '接受编辑（推荐）',
    permissionBypass: '跳过所有确认（危险）',
    sharedSkillDir: '共享 Skill 目录',
    save: '保存设置',
    saved: '已保存',
    pricing: '定价（$/百万 token）',
    pricingInput: '输入',
    pricingOutput: '输出',
    pricingCacheCreate: '缓存写',
    pricingCacheRead: '缓存读',
    pricingReset: '重置默认',
    disableExperimentalBetas: '禁用实验性功能',
    // [2026-04-28] API Profile 管理
    profileTitle: 'API 配置',
    profileAdd: '添加配置',
    profileEdit: '编辑配置',
    profileDelete: '删除配置',
    profileName: '配置名称',
    profileDefault: '默认',
    profileActive: '当前使用',
    profileCannotDeleteLast: '无法删除最后一个配置',
    profileSwitchHint: '切换配置后，新创建的会话将使用新配置'
  },
  // Guide panel
  guide: {
    searchPlaceholder: '搜索技巧...',
    noResults: '无匹配结果',
    learnedButton: '已学习',
    markLearned: '标记为已学习',
    close: '关闭',
    footer: '条最佳实践 · 参考 shanraisshan/claude-code-best-practice',
    collapseHint: '点击分类展开',
    learned: '已学习',
    progress: '{learned}/{total} 已学习'
  },
  // Tab bar
  tabs: {
    newSession: '新建会话（选择文件夹）',
    closeTab: '关闭标签',
    restartSession: '重启会话'
  },
  // File tree
  files: {
    changeDir: '切换目录',
    empty: '空目录',
    loading: '加载中...'
  },
  // Session status
  session: {
    running: '运行中',
    idle: '空闲',
    waiting: '等待输入',
    error: '错误',
    exited: '已退出'
  }
} as const

// Widen all leaf string literals to `string` so en.ts (and future translations) can satisfy the type
type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends object ? DeepString<T[K]> : T[K]
}

export type Translations = DeepString<typeof zh>
