/**
 * Claude Code 内置 / 命令 — 与官方文档对齐，供外嵌输入框补全（终端内 `/` 菜单的静态映射）。
 * @see https://code.claude.com/docs/en/commands
 * [2026-05-06]
 */

export interface ClaudeSlashItem {
  /** 插入到 PTY 的文本，一般以 `/name` 或 `/name ` 开头 */
  insert: string
  /** 用于筛选匹配的键（不含 `/`，小写） */
  matchKey: string
  /** 简述（英文摘自文档） */
  description: string
}

/** matchKey + insert + description；insert 与 Claude Code 识别一致 */
const RAW: ReadonlyArray<readonly [string, string, string]> = [
  ['add-dir', '/add-dir ', 'Add a working directory for file access during the session'],
  ['agents', '/agents', 'Manage agent configurations'],
  ['autofix-pr', '/autofix-pr ', 'Spawn web session to watch PR and push fixes when CI fails'],
  ['batch', '/batch ', 'Orchestrate large-scale codebase changes (bundled skill)'],
  ['branch', '/branch ', 'Create a conversation branch; alias /fork'],
  ['fork', '/fork ', 'Alias of /branch (unless CLAUDE_CODE_FORK_SUBAGENT set)'],
  ['btw', '/btw ', 'Side question without adding to conversation'],
  ['chrome', '/chrome', 'Configure Claude in Chrome'],
  ['claude-api', '/claude-api ', 'Claude API reference skill; try migrate or managed-agents-onboard'],
  ['clear', '/clear', 'New conversation with empty context; aliases /reset /new'],
  ['reset', '/reset', 'Alias of /clear'],
  ['new', '/new', 'Alias of /clear'],
  ['color', '/color ', 'Set prompt bar color for session'],
  ['compact', '/compact ', 'Summarize conversation to free context'],
  ['config', '/config', 'Open Settings; alias /settings'],
  ['settings', '/settings', 'Alias of /config'],
  ['context', '/context', 'Visualize context usage grid'],
  ['copy', '/copy ', 'Copy last assistant response to clipboard'],
  ['cost', '/cost', 'Alias for /usage'],
  ['debug', '/debug ', 'Enable debug logging for session'],
  ['desktop', '/desktop', 'Continue session in Claude Code Desktop; alias /app'],
  ['app', '/app', 'Alias of /desktop'],
  ['diff', '/diff', 'Interactive diff viewer'],
  ['doctor', '/doctor', 'Diagnose Claude Code installation'],
  ['effort', '/effort ', 'Set model effort level'],
  ['exit', '/exit', 'Exit CLI; alias /quit'],
  ['quit', '/quit', 'Alias of /exit'],
  ['export', '/export ', 'Export conversation as plain text'],
  ['extra-usage', '/extra-usage', 'Configure extra usage when rate limited'],
  ['fast', '/fast ', 'Toggle fast mode'],
  ['feedback', '/feedback ', 'Submit feedback; alias /bug'],
  ['bug', '/bug ', 'Alias of /feedback'],
  ['fewer-permission-prompts', '/fewer-permission-prompts', 'Skill: reduce permission prompts via allowlist'],
  ['focus', '/focus', 'Toggle focus view (fullscreen)'],
  ['heapdump', '/heapdump', 'Write JS heap snapshot for memory diagnosis'],
  ['help', '/help', 'Show help and available commands'],
  ['hooks', '/hooks', 'View hook configurations'],
  ['ide', '/ide', 'Manage IDE integrations'],
  ['init', '/init', 'Initialize project with CLAUDE.md'],
  ['insights', '/insights', 'Analyze sessions report'],
  ['install-github-app', '/install-github-app', 'Set up Claude GitHub Actions app'],
  ['install-slack-app', '/install-slack-app', 'Install Claude Slack app'],
  ['keybindings', '/keybindings', 'Open keybindings config'],
  ['login', '/login', 'Sign in to Anthropic'],
  ['logout', '/logout', 'Sign out'],
  ['loop', '/loop ', 'Run prompt repeatedly; alias /proactive'],
  ['proactive', '/proactive ', 'Alias of /loop'],
  ['mcp', '/mcp', 'Manage MCP servers and OAuth'],
  ['memory', '/memory', 'Edit CLAUDE.md memory / auto-memory'],
  ['mobile', '/mobile', 'QR for mobile app; aliases /ios /android'],
  ['ios', '/ios', 'Alias of /mobile'],
  ['android', '/android', 'Alias of /mobile'],
  ['model', '/model ', 'Select or change AI model'],
  ['passes', '/passes', 'Share free week of Claude Code (if eligible)'],
  ['permissions', '/permissions', 'Manage tool permission rules; alias /allowed-tools'],
  ['allowed-tools', '/allowed-tools', 'Alias of /permissions'],
  ['plan', '/plan ', 'Enter plan mode with optional description'],
  ['plugin', '/plugin', 'Manage plugins'],
  ['powerup', '/powerup', 'Interactive feature lessons'],
  ['privacy-settings', '/privacy-settings', 'Privacy settings (Pro/Max)'],
  ['recap', '/recap', 'One-line session summary'],
  ['release-notes', '/release-notes', 'Changelog version picker'],
  ['reload-plugins', '/reload-plugins', 'Reload active plugins'],
  ['remote-control', '/remote-control', 'Remote control from claude.ai; alias /rc'],
  ['rc', '/rc', 'Alias of /remote-control'],
  ['remote-env', '/remote-env', 'Default remote env for --remote web sessions'],
  ['rename', '/rename ', 'Rename current session'],
  ['resume', '/resume ', 'Resume conversation; alias /continue'],
  ['continue', '/continue ', 'Alias of /resume'],
  ['review', '/review ', 'Review a pull request locally'],
  ['rewind', '/rewind', 'Rewind conversation/code; aliases /checkpoint /undo'],
  ['checkpoint', '/checkpoint', 'Alias of /rewind'],
  ['undo', '/undo', 'Alias of /rewind'],
  ['sandbox', '/sandbox', 'Toggle sandbox mode'],
  ['schedule', '/schedule ', 'Create/list routines; alias /routines'],
  ['routines', '/routines ', 'Alias of /schedule'],
  ['security-review', '/security-review', 'Security review of branch diff'],
  ['setup-bedrock', '/setup-bedrock', 'Bedrock wizard (when CLAUDE_CODE_USE_BEDROCK=1)'],
  ['setup-vertex', '/setup-vertex', 'Vertex AI wizard (when CLAUDE_CODE_USE_VERTEX=1)'],
  ['simplify', '/simplify ', 'Skill: simplify recently changed files'],
  ['skills', '/skills', 'List available skills'],
  ['stats', '/stats', 'Alias for /usage'],
  ['status', '/status', 'Settings Status tab: version, model, account'],
  ['statusline', '/statusline ', 'Configure status line'],
  ['stickers', '/stickers', 'Order Claude Code stickers'],
  ['tasks', '/tasks', 'Background tasks; also /bashes'],
  ['bashes', '/bashes', 'Alias of /tasks'],
  ['team-onboarding', '/team-onboarding', 'Generate team onboarding guide'],
  ['teleport', '/teleport', 'Pull web session into terminal; alias /tp'],
  ['tp', '/tp', 'Alias of /teleport'],
  ['terminal-setup', '/terminal-setup', 'Terminal keybindings setup'],
  ['theme', '/theme', 'Change color theme'],
  ['tui', '/tui ', 'Set TUI renderer default|fullscreen'],
  ['ultraplan', '/ultraplan ', 'Draft plan in ultraplan session'],
  ['ultrareview', '/ultrareview ', 'Deep multi-agent PR review'],
  ['upgrade', '/upgrade', 'Open plan upgrade page'],
  ['usage', '/usage', 'Session cost and limits; /cost /stats aliases'],
  ['voice', '/voice ', 'Voice dictation mode'],
  ['web-setup', '/web-setup', 'Connect GitHub for Claude Code on the web']
]

export const CLAUDE_SLASH_COMMANDS: ClaudeSlashItem[] = RAW.map(([matchKey, insert, description]) => ({
  matchKey,
  insert,
  description
}))

/** MCP 动态命令占位说明（真实条目形如 /mcp__server__prompt，无法在离线表枚举） */
export const MCP_SLASH_HINT: ClaudeSlashItem = {
  matchKey: 'mcp-dynamic',
  insert: '/mcp',
  description:
    'MCP servers may add commands like /mcp__server__name — connect MCP first, then type /mcp in terminal for full list.'
}

export function filterSlashCommands(queryWithoutSlash: string): ClaudeSlashItem[] {
  const q = queryWithoutSlash.trim().toLowerCase()
  if (!q) {
    const preferredOrder = [
      'help',
      'clear',
      'compact',
      'model',
      'resume',
      'permissions',
      'mcp',
      'skills',
      'usage',
      'status',
      'config',
      'branch',
      'plan',
      'diff',
      'memory',
      'agents',
      'debug',
      'doctor',
      'theme',
      'login',
      'logout'
    ]
    const seen = new Set<string>()
    const out: ClaudeSlashItem[] = []
    for (const k of preferredOrder) {
      const item = CLAUDE_SLASH_COMMANDS.find((i) => i.matchKey === k)
      if (item && !seen.has(item.matchKey)) {
        seen.add(item.matchKey)
        out.push(item)
      }
    }
    for (const item of CLAUDE_SLASH_COMMANDS) {
      if (out.length >= 36) break
      if (!seen.has(item.matchKey)) {
        seen.add(item.matchKey)
        out.push(item)
      }
    }
    /* [2026-05-06] 已有正式 /mcp 项时不再追加 MCP_SLASH_HINT，避免两条相同 insert 点击困惑 */
    if (!seen.has('mcp')) out.push(MCP_SLASH_HINT)
    return out
  }

  const ranked = CLAUDE_SLASH_COMMANDS.map((item) => {
    const mk = item.matchKey
    const desc = item.description.toLowerCase()
    let rank = -1
    if (mk === q) rank = 300
    else if (mk.startsWith(q)) rank = 200
    else if (mk.includes(q)) rank = 120
    else if (desc.includes(q)) rank = 40
    if (rank < 0) return null
    return { item, rank }
  }).filter(Boolean) as { item: ClaudeSlashItem; rank: number }[]

  ranked.sort((a, b) => b.rank - a.rank || a.item.matchKey.localeCompare(b.item.matchKey))
  const result = ranked.slice(0, 40).map((r) => r.item)
  if (
    (q.includes('mcp') || 'mcp'.startsWith(q)) &&
    !result.some((x) => x.matchKey === 'mcp') &&
    !result.some((x) => x.matchKey === MCP_SLASH_HINT.matchKey)
  ) {
    result.push(MCP_SLASH_HINT)
  }
  return result
}

/** [2026-05-06] 鼠标点选补全时下拉按钮可导致 textarea blur，cursor 不可靠；首行 /^\\/…/ 作后备 */
export function resolveSlashInsertRange(text: string, cursorPos: number): { start: number; end: number } | null {
  const primary = getSlashCompletionAtStart(text, cursorPos)
  if (primary) return { start: primary.start, end: primary.end }
  const nl = text.indexOf('\n')
  const head = nl === -1 ? text : text.slice(0, nl)
  const m = head.match(/^\/([\w-]*)/)
  if (!m) return null
  return { start: 0, end: m[0].length }
}

/** 是否在消息开头输入 `/…`（与 Claude Code「命令仅在消息开头识别」一致，仅第一行） */
export function getSlashCompletionAtStart(text: string, cursor: number): { start: number; end: number; query: string } | null {
  const before = text.slice(0, cursor)
  if (before.includes('\n')) return null
  const m = before.match(/^\/([\w-]*)$/)
  if (!m) return null
  return { start: 0, end: cursor, query: (m[1] ?? '').toLowerCase() }
}
