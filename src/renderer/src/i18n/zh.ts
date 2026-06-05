export const zh = {
  // Sidebar tabs
  sidebar: {
    files: '文件',
    todolist: '待办',
    history: '历史',
    commands: '命令',
    stats: '统计',
    plugins: '插件',
    skills: 'Skills',
    petGrowth: '宠物',
    mcp: 'MCP',
    guide: '指南',
    settings: '设置',
    test: '测试',
    devlog: '日志',
    office: 'Office'
  },
  // TodoList 面板
  todolist: {
    empty: '暂无待办，添加一条开始',
    add: '添加',
    placeholder: '输入待办事项…',
    noSession: '请先打开一个会话',
    clearDone: '清除已完成',
    syncFromFile: '从文件同步',
    syncHint: '读取 .feng-todos.md 的勾选状态',
    editHint: '双击编辑',
    start: '让 Claude 执行',
    startTitle: '把当前项目的待办发送给 Claude 逐项执行',
    failed: '失败',
    retryHint: '无法完成 — 点击重置为待办以重试'
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
    clear: '清空',
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
    error: '错误',
    embedSendBlockedAlt: '全屏终端界面中已暂停外嵌发送：退出 TUI、点中断，或等空闲后再试。',
    embedSendBlockedSlash: '斜杠命令交互中：请先点「中断」退出或完成上方终端内操作。'
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
    total: '累计',
    thisWeek: '这周',
    todayDetail: '今日明细',
    periodDetail: '{period}明细',
    profileShare: '各配置占比',
    profileUsage: '各配置用量',
    recentDays: '近 {n} 天',
    peak: '最高',
    tokensPerDay: 'tokens/天',
    chartModeBars: '柱',
    chartModeHeat: '热力',
    chartModeStacked: '堆叠',
    chartOther: '未归属',
    chartStackLegend: '各配置（近 14 天合计）',
    chartViewGroup: '近 14 天图表视图',
    overviewTabOverview: '总览',
    overviewTabModels: '模型',
    overviewTabsAria: '用量总览与按配置',
    overviewScopeAll: '全部',
    overviewScope30d: '30 天',
    overviewScope7d: '7 天',
    overviewStatSessions: '会话',
    overviewStatMessages: '消息',
    overviewStatTokens: '总 tokens',
    overviewStatActiveDays: '活跃天',
    overviewStatCurStreak: '连续',
    overviewStatLongStreak: '最长连续',
    overviewStatPeakHour: '高峰时段',
    overviewStatFavorite: '常用配置',
    overviewMsgsUnavailable: '—',
    overviewMsgsHint: '暂无全局消息条数统计',
    overviewPeakHint: '暂无按小时统计',
    overviewSessionsHint: '无历史记录时为当前打开的标签数',
    overviewHeatmapOpen: '热力图总览',
    overviewHeatmapDialogTitle: '用量热力与总览',
    overviewHeatmapDialogDesc: '按日贡献格、会话与 streak 等指标（与近 14 天柱图统计同源）',
    overviewHeatmapCaption:
      '每格表示一个自然日：纵列为「一周」（周一在上、周日在下），从左到右由旧到新。浅灰为当日无用量；蓝色越深表示当日总 tokens（输入+输出+缓存）越高。'
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
    profileSwitchHint: '切换配置后，新创建的会话将使用新配置',
    terminalTitle: '终端',
    terminalShell: '自定义 Shell',
    terminalShellPlaceholder: '留空使用平台默认（Windows: cmd.exe / Unix: $SHELL）',
    terminalUseTmux: '持久化 Shell 会话',
    terminalUseTmuxDesc: '空控制台在后台保持运行，重启 app 后自动恢复 lazygit 等 TUI 程序（跨平台，无需额外依赖）',
    /** [2026-05-08] Telegram 官方插件依赖 Bun；与主进程 augmentPathWithBunInstallDirs 说明一致 */
    telegramBunHint:
      '官方 Telegram Channel 插件依赖 Bun。安装：https://bun.sh（Windows PowerShell：irm bun.sh/install.ps1 | iex）。Feng 会自动将用户目录下的 .bun/bin 加入内嵌终端 PATH；若 Bun 装在其他目录，请将该 bin 加入系统 PATH 并重启 Feng。',
    /** [2026-05-08] 弹窗内分步说明；命令单独组件展示勿合并进长句 */
    telegramDialogSetupTitle: '使用前必读（按顺序操作）',
    telegramStepBunTitle: '① 安装 Bun（缺少会导致插件无法启动）',
    telegramStepBunDoc: '官网：https://bun.sh',
    telegramStepBunWinLabel: 'Windows PowerShell 一键安装：',
    telegramStepBunWinCmd: 'irm bun.sh/install.ps1 | iex',
    telegramStepBunFengNote:
      '默认装在「用户文件夹\\.bun\\bin」时，Feng 会自动把它加入内嵌终端 PATH。若装在别的路径，请把对应的 bin 目录加入系统环境变量 PATH，并重启 Feng。',
    telegramStepPluginTitle: '② 安装 Telegram 插件 — 在本窗口终端出现提示符后执行：',
    telegramStepPluginCmd: '/plugin install telegram@claude-plugins-official',
    /** [2026-05-10] 原分 ③ /telegram:access 与 ④ 多目录手动配对；合并为统一「复制给 Claude」流程（含首次 telegram 目录） */
    telegramStepPairUnifiedTitle: '③ 配对 Telegram Bot',
    /** [2026-05-08] 弹窗内不再展示；保留键以兼容旧引用 */
    telegramStepPairUnifiedIntro: '',
    /** [2026-05-08] 无 stateDir 兜底：末尾接六位码；路径手改 <STATE_DIR> */
    telegramMultiBotPairPromptZh: `在 Telegram 向 Bot 发消息取得六位码。复制本框全部内容，在末尾紧接六位码（勿加引号），一并发给 Claude 完成配对；勿在终端执行 /telegram:access。
（若路径中仍是 <STATE_DIR>，先改成设置里的「状态目录」再复制。）

本 Bot 状态目录：
Windows：%USERPROFILE%\\.claude\\channels\\<STATE_DIR>
macOS/Linux：$HOME/.claude/channels/<STATE_DIR>`,
    telegramMultiBotPairPromptEn: `Get the 6-character code from your bot in Telegram. Copy everything in this box, append the code right at the end (no quotes), and send it all to Claude to finish pairing. Do not run /telegram:access in the terminal.
(Replace <STATE_DIR> in paths with your preset state-dir id if needed.)

State dir for this bot:
Windows: %USERPROFILE%\\.claude\\channels\\<STATE_DIR>
macOS/Linux: $HOME/.claude/channels/<STATE_DIR>`,
    telegramPresetSectionTitle: 'Bot 预设',
    telegramPresetPlaceholder: '快捷：切换 Bot 预设',
    telegramPresetSaveAs: '将当前表单保存为预设',
    telegramPresetNamePh: '预设名称',
    telegramPresetSaveBtn: '保存预设',
    telegramPresetDeleteBtn: '删除所选预设',
    telegramPresetApplyHint: '选择预设会填入 Token / State Dir；保存并重启后生效。',
    telegramPresetListTitle: '已保存的 Bot 预设',
    telegramPresetColName: '名称',
    telegramPresetColStateDir: 'State Dir',
    telegramPresetRemove: '删除',
    /** [2026-05-08] 设置页：开关 + 多条预设；弹窗内配对见 telegramStepPairUnified* */
    telegramSimpleEnable: '启用 Telegram Channel',
    telegramSimpleTokenPlaceholder: 'TELEGRAM_BOT_TOKEN',
    telegramSimpleStateDirPlaceholder: 'State Dir（默认 telegram）',
    telegramPresetAddSection: '添加预设',
    telegramPresetAddNamePh: '预设名称',
    telegramPresetAddBtn: '添加预设',
    telegramPresetsMultiHint:
      '保存设置后生效。可配置多组 Bot：列表第一条为新建会话默认；下方可继续添加。标签栏药丸可切换到任一条。状态目录按预设名称自动生成（~/.claude/channels/<id>），改名会对应新目录；同名冲突会自动加 -2、-3。插件依赖 Bun。同一 Bot Token 请勿在多窗口同时复用。配对：从标签栏药丸打开「安装与配对说明」第③节，复制灰框全文后在末尾紧接六位码发给 Claude 即可。'
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
    restartSession: '重启会话',
    switchProfile: '切换 API 配置',
    /** [2026-05-08] 标签栏药丸：与 API 配置（模型）切换并列；默认未关联 Bot */
    telegramPresetSwitch:
      '切换 Telegram 预设（将重启本会话）。每条预设对应不同的状态目录；配对时请向该预设绑定的 Bot 发消息取码，勿混用另一个 Bot 的配对码。',
    telegramChannelNone: '未关联',
    telegramChannelCustom: '自定义',
    telegramChannelSetupGuide: '安装与配对说明…',
    telegramChannelOpenSettings: '打开设置管理预设…',
    telegramChannelEmptyPresets: '暂无 Bot 预设：请在设置 → Telegram Channel 中添加（填写 Token）。'
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
  },
  // Test panel
  test: {
    runnerMode: '独立模式',
    aiMode: 'AI 模式',
    detecting: '检测框架...',
    noFramework: '未检测到测试框架',
    runTests: '运行测试',
    running: '运行中...',
    cancel: '取消',
    noResults: '暂无测试结果',
    passed: '通过',
    failed: '失败',
    skipped: '跳过',
    coverage: '覆盖率',
    duration: '耗时',
    totalTests: '测试总数',
    askAi: '让 AI 分析测试结果'
  }
} as const

// Widen all leaf string literals to `string` so en.ts (and future translations) can satisfy the type
type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends object ? DeepString<T[K]> : T[K]
}

export type Translations = DeepString<typeof zh>
