export interface Tip {
  id: string
  title: string
  brief: string
  detail: string
}

export interface Section {
  id: string
  title: string
  emoji: string
  tips: Tip[]
}

export const GUIDE_SECTIONS: Section[] = [
  {
    id: 'prompting',
    title: 'Prompting 技巧',
    emoji: '💬',
    tips: [
      {
        id: 'prompt-verify',
        title: '要求 Claude 验证改动',
        brief: '提交 PR 前让 Claude 确认改动确实有效',
        detail:
          '明确告诉 Claude："完成后运行测试并确认通过，再告诉我结果。" 这样能防止 Claude 实现功能后就停下，而忽略了验证步骤。在 CLAUDE.md 中把这条写成规则，所有任务自动适用。'
      },
      {
        id: 'prompt-elegant',
        title: '拒绝平庸的修复方案',
        brief: '让 Claude 抛弃凑合的方案，寻找优雅解法',
        detail:
          '当 Claude 给出 hack 式修复时，直接说："这个方案不够好，放弃它，重新思考一个优雅的实现。" 模型的自我修正能力很强，但默认倾向于快速给出答案。给它明确的信号可以激发更深入的推理。'
      },
      {
        id: 'prompt-independent',
        title: '放手让 Claude 独立解 Bug',
        brief: '不要过度微管理，给 Claude 足够的自主空间',
        detail:
          '告诉 Claude 问题背景和期望结果，然后说"自己想办法解决，不确定时查文档或运行测试"。过度引导会限制 Claude 找到你没想到的更好解法。让它先跑一圈，再来看结果。'
      }
    ]
  },
  {
    id: 'planning',
    title: 'Plan 模式与规格',
    emoji: '📋',
    tips: [
      {
        id: 'plan-mode',
        title: '始终从 Plan 模式开始',
        brief: '复杂任务先规划再执行，避免代价高昂的误操作',
        detail:
          '按 Shift+Tab 进入 Plan 模式。Claude 会先输出计划，等你确认后才开始修改文件。对于跨多个文件的重构或新功能，这能节省大量返工时间。计划可以当作检查清单，逐步跟踪进度。'
      },
      {
        id: 'plan-interview',
        title: '用 AskUserQuestion 做规格访谈',
        brief: 'Claude 主动提问，交互式澄清需求',
        detail:
          '让 Claude 使用 AskUserQuestion 工具逐步收集需求，而不是基于猜测开始编码。在 CLAUDE.md 中写："对于新功能，先用 AskUserQuestion 向我确认关键决策点再开始。" 这减少了反复修改的次数。'
      },
      {
        id: 'plan-phases',
        title: '分阶段门控计划',
        brief: '将大任务拆成阶段，每阶段设测试关卡',
        detail:
          '让 Claude 制定带有"测试门"的分阶段计划：第一阶段完成后跑单元测试，通过后才进入第二阶段。这样能在早期发现问题，而不是等到所有代码写完才发现基础假设错了。'
      },
      {
        id: 'plan-second-claude',
        title: '用第二个 Claude 审查计划',
        brief: '开新会话让另一个 Claude 以资深工程师视角审计计划',
        detail:
          '把 Claude 生成的计划复制到一个新会话，让它扮演"staff engineer"角色来找漏洞。两个上下文独立运作，第二个会发现第一个在自己语境下可能忽视的问题。'
      },
      {
        id: 'plan-spec',
        title: '写详细规格文档减少歧义',
        brief: '规格文档越详细，Claude 的输出越准确',
        detail:
          '在开始编码前写一份 spec.md，包含：功能描述、边界条件、不该做的事、验收标准。Claude 能以此为锚点，不会在实现中偏离。这份文档也自然成为未来维护的文档。'
      },
      {
        id: 'plan-prototypes',
        title: '构建 20-30 个原型替代冗长 PRD',
        brief: '快速原型比长篇需求文档更有效',
        detail:
          '与其写 10 页的 PRD，不如让 Claude 快速生成 20-30 个小原型来探索设计空间。每个原型用一个新会话，5 分钟内完成。通过对比原型来做决策，比抽象讨论更高效。'
      }
    ]
  },
  {
    id: 'context',
    title: '上下文管理',
    emoji: '🧠',
    tips: [
      {
        id: 'context-rot',
        title: '300-400k token 后出现上下文腐化',
        brief: '长会话质量下降，在此之前主动压缩',
        detail:
          '当 token 使用量接近 300k 时，Claude 开始"忘记"早期的指令和代码细节，给出不一致的答案。在这之前用 /compact 压缩，或者开新会话并附上摘要。不要等到质量明显下降才处理。'
      },
      {
        id: 'context-dumb-zone',
        title: '40% 上下文用量后进入"愚蠢区"',
        brief: '上下文用到 30% 以上时质量开始下降',
        detail:
          '经验数据：上下文用量超过 30-40% 后，Claude 的推理质量可测量地下降。对于高风险任务（架构决策、安全相关代码），保持在 30% 以下。可在侧边栏的 Token Usage 区域实时监控。'
      },
      {
        id: 'context-rewind',
        title: '用 Rewind 替代纠正',
        brief: '出错时回滚到分叉点，而非在错误上继续修补',
        detail:
          '当 Claude 走偏时，不要在其答案上继续"纠正"，这会污染上下文。用 /rewind 回滚到问题发生前，重新给出更清晰的指令。干净的上下文比堆砌的纠正更有效。'
      },
      {
        id: 'context-subagent',
        title: '用子智能体隔离探索性工作',
        brief: '不确定的探索放到子智能体，避免污染主上下文',
        detail:
          '让主会话保持专注，把"先去看看这个代码库里有什么"之类的探索任务交给子智能体。子智能体在独立上下文中工作，结论汇报回来，主上下文保持干净。'
      },
      {
        id: 'context-manual-compact',
        title: '手动 /compact 优于自动压缩',
        brief: '主动选择压缩时机，掌控上下文质量',
        detail:
          '自动压缩可能在关键时刻（如 Claude 正在分析重要代码时）触发，导致重要信息丢失。在任务的自然停顿点手动执行 /compact，并在压缩前让 Claude 输出一段摘要，确保关键信息被保留。'
      }
    ]
  },
  {
    id: 'session',
    title: '会话管理',
    emoji: '🔄',
    tips: [
      {
        id: 'session-branch',
        title: '每次对话都是分叉点',
        brief: '理解五种选择：继续、Rewind、Clear、Compact、子智能体',
        detail:
          '每次 Claude 回复后，你有五条路：1) 继续对话积累上下文；2) /rewind 回到上一个状态；3) /clear 彻底清空开新局；4) /compact 压缩继续；5) 开子智能体隔离。养成在重要节点有意识地做选择的习惯。'
      },
      {
        id: 'session-fresh',
        title: '新任务开新会话',
        brief: '不相关的任务不要混在同一上下文里',
        detail:
          '把"修复登录 bug"和"重构数据库层"放在同一会话里会让 Claude 产生混淆。每个独立任务开一个新会话，相关的子任务才共用上下文。这样每个会话的上下文都高度相关，推理质量更高。'
      },
      {
        id: 'session-summarize',
        title: 'Rewind 前先"从这里开始总结"',
        brief: '生成交接摘要再回滚，避免丢失有用信息',
        detail:
          '执行 /rewind 之前，先问 Claude："请从这里开始，总结我们完成了什么、当前状态和接下来需要做的事。" 把这个摘要保存下来，作为新会话或 Rewind 后的起点。'
      },
      {
        id: 'session-compact-vs-clear',
        title: '/compact vs /clear 的选择',
        brief: '保持动力用 Compact，高风险过渡用 Clear',
        detail:
          '/compact 适合任务中途想继续但需要减轻上下文压力的情况；/clear 适合任务完成后彻底开始新话题，或当前上下文已经混乱到影响质量。一般规则：同一功能内用 compact，跨功能用 clear。'
      },
      {
        id: 'session-rename',
        title: '用 /rename 标记多个并行会话',
        brief: '同时跑多个 Claude 时给每个会话命名',
        detail:
          '在不同终端并行跑多个 Claude 会话时，用 /rename 给每个会话起有意义的名字（如"frontend-auth"、"api-refactor"）。避免混淆当前在哪个会话，尤其是使用 tmux 或多窗口时。'
      },
      {
        id: 'session-recap',
        title: '长任务启用 Recap',
        brief: '超长会话开启摘要功能跟踪进度',
        detail:
          '对于跨越数小时的长任务，启用 recap 功能让 Claude 定期输出进度摘要。这帮助你在任意时刻了解任务状态，也让 Claude 本身保持对任务目标的聚焦。'
      }
    ]
  },
  {
    id: 'claude_md',
    title: 'CLAUDE.md 与规则',
    emoji: '📄',
    tips: [
      {
        id: 'md-200-lines',
        title: 'CLAUDE.md 控制在 200 行以内',
        brief: '每个文件不超过 200 行，超出则拆分',
        detail:
          '过长的 CLAUDE.md 会占用大量上下文，且 Claude 不会可靠地读取文件末尾的内容。保持每个文件在 200 行以内。拆分时使用 .claude/rules/*.md 目录结构，按主题分文件管理。'
      },
      {
        id: 'md-rules-dir',
        title: '用 .claude/rules/ 目录分拆规则',
        brief: 'YAML frontmatter 支持按需懒加载规则文件',
        detail:
          '在 .claude/rules/ 下创建多个 .md 文件，每个文件的 YAML frontmatter 可以指定加载条件（如仅在操作特定文件类型时加载）。这实现了规则的按需加载，避免一次性塞满上下文。'
      },
      {
        id: 'md-conditional-tags',
        title: '用 <important if="..."> 标记条件规则',
        brief: '特定场景的规则用条件标签包裹，减少噪音',
        detail:
          '示例：`<important if="modifying database migrations">Always add rollback scripts</important>`。Claude 会在相关场景优先关注这些规则，在其他场景则降低权重。比把所有规则写成同等优先级更有效。'
      },
      {
        id: 'md-monorepo',
        title: 'Monorepo 用多层 CLAUDE.md',
        brief: '根目录放通用规则，子包目录放专属规则',
        detail:
          'Claude 会加载当前目录及其所有祖先目录的 CLAUDE.md。在 monorepo 根目录放项目全局规则，在 packages/frontend/ 放前端专属规则，在 packages/api/ 放后端专属规则。进入不同子目录时自动激活对应规则。'
      },
      {
        id: 'md-first-run',
        title: '任何开发者首次运行测试都应成功',
        brief: 'CLAUDE.md 是检验的标准：新人能按它跑通',
        detail:
          '用这个标准衡量你的 CLAUDE.md 质量：一个对项目一无所知的开发者，只按 CLAUDE.md 的指引，能否成功运行测试？如果不能，补充缺失的步骤。这也是 Claude 本身能可靠执行任务的前提。'
      },
      {
        id: 'md-clean-codebase',
        title: '保持代码库干净，避免半迁移框架',
        brief: '未完成的迁移会混淆模型，降低代码质量',
        detail:
          '代码库里同时存在 Webpack 和 Vite 的配置、混用两种 CSS 方案、未删除的旧接口——这些都会让 Claude 给出自相矛盾的答案。在开始 AI 辅助开发前，先完成技术栈迁移，或明确在 CLAUDE.md 中说明过渡策略。'
      },
      {
        id: 'md-settings-json',
        title: '用 settings.json 替代 CLAUDE.md 写行为配置',
        brief: '确定性行为写配置文件，而非自然语言规则',
        detail:
          '例如"总是使用 Opus 模型"、"允许使用某工具"这类确定性配置，写在 .claude/settings.json 里比写 CLAUDE.md 更可靠。自然语言指令存在被忽略的风险，JSON 配置则是强制性的。'
      },
      {
        id: 'md-scope',
        title: 'CLAUDE.md 的正确内容：写什么',
        brief: '只写高价值、不易推断的背景知识',
        detail:
          '适合写的：项目特有的约定（非标准的分支命名、特殊的测试环境配置）、常见陷阱和禁止事项、关键业务逻辑背景。不适合写的：通用编码最佳实践（Claude 自己知道）、代码风格（用 linter 强制）、显而易见的事情。'
      }
    ]
  },
  {
    id: 'agents',
    title: 'Agents 子智能体',
    emoji: '🤖',
    tips: [
      {
        id: 'agent-specific',
        title: '创建功能专属子智能体',
        brief: '针对特定功能的专属子智能体优于通用助手角色',
        detail:
          '为"前端组件生成"、"API 接口设计"、"数据库迁移"分别创建专属子智能体，每个都有定制的 skills 和上下文。通用的"senior engineer"角色因为什么都知道一点，反而在专业任务上不如专属智能体表现好。'
      },
      {
        id: 'agent-compute',
        title: '说"用子智能体"来投入更多算力',
        brief: '并行子智能体是处理复杂问题的"计算"按钮',
        detail:
          '告诉 Claude "use subagents to explore this problem in parallel"，它会启动多个并行上下文分别探索不同方案，再汇总结果。这在技术选型、架构比较等问题上特别有效，相当于用算力换时间。'
      },
      {
        id: 'agent-tmux',
        title: '用 tmux + git worktree 并行多任务',
        brief: '多个 Claude 实例在不同 worktree 里同步开发',
        detail:
          '创建多个 git worktree（git worktree add ../project-feat-a feat-a），在每个 worktree 里启动独立的 Claude 实例，用 tmux 管理多个窗格。各实例互不干扰，完成后分别提 PR。是目前已知最高效的并行开发模式。'
      },
      {
        id: 'agent-test-compute',
        title: '独立上下文做 QA 效果更好',
        brief: '让另一个 Claude 实例专门做测试和代码审查',
        detail:
          '实现功能的 Claude 会对自己的代码存在"盲点"。启动一个全新上下文，只给它代码和需求，让它独立验证。两个不同上下文对同一代码做推理，比一个上下文又写又审查，发现的 bug 更多。'
      }
    ]
  },
  {
    id: 'commands',
    title: 'Commands 命令',
    emoji: '⚡',
    tips: [
      {
        id: 'cmd-vs-agent',
        title: '工作流用 Commands，任务用 Agents',
        brief: 'Commands 是可重复的流程，Agents 是一次性任务',
        detail:
          'Commands（.claude/commands/*.md）适合固定流程：代码审查、提交规范、性能分析。Agents 适合一次性复杂任务。判断标准：这个事情你会重复做很多次吗？会就做成 Command。'
      },
      {
        id: 'cmd-daily',
        title: '把每天重复的操作做成斜杠命令',
        brief: '高频操作自动化，一条命令触发完整流程',
        detail:
          '在 .claude/commands/ 下创建 .md 文件即可定义自定义命令。示例：/deploy 命令自动运行测试、构建、推送并创建 PR。一个好的命令能把 5 分钟的重复操作缩短到 10 秒。'
      },
      {
        id: 'cmd-custom',
        title: '创建项目专属命令',
        brief: '/techdebt、/context-dump 等自定义命令提升效率',
        detail:
          '示例命令：/techdebt（扫描代码库找技术债务并优先排序）、/analytics（分析近 7 天的错误日志）、/context-dump（输出当前系统状态的完整摘要）。一次创建，长期复用。'
      }
    ]
  },
  {
    id: 'skills',
    title: 'Skills 技能',
    emoji: '🎯',
    tips: [
      {
        id: 'skill-fork',
        title: '用 context: fork 在子智能体里运行 Skill',
        brief: '隔离执行技能，不污染主上下文',
        detail:
          '在 skill 的 frontmatter 里设置 `context: fork`，该 skill 运行时会在独立的子智能体上下文中执行。适合可能需要大量探索或产生大量中间输出的技能，保持主会话干净。'
      },
      {
        id: 'skill-monorepo',
        title: 'Monorepo 里把 Skill 放到子目录',
        brief: '按包组织技能，避免全局命名冲突',
        detail:
          '在 packages/frontend/.claude/skills/ 放前端专属技能，packages/api/.claude/skills/ 放后端技能。Claude 会根据当前目录自动发现对应的技能集，无需手动指定。'
      },
      {
        id: 'skill-folder',
        title: 'Skill 是文件夹，不是单个文件',
        brief: '用 references/、scripts/、examples/ 子目录组织技能资产',
        detail:
          '一个完整的 Skill 目录结构：SKILL.md（主文件）、references/（相关文档和规范）、scripts/（可执行脚本）、examples/（示例输出）。这让技能自包含，可以独立分享和版本管理。'
      },
      {
        id: 'skill-gotchas',
        title: '每个 Skill 都要有 Gotchas 章节',
        brief: '记录已知坑和反直觉行为，避免重蹈覆辙',
        detail:
          '在每个 SKILL.md 里加一个"## Gotchas"章节，记录：这个技能的常见误用、已知的边界情况、曾经出过问题的配置。这是技能随时间演进的最重要部分，新团队成员也能快速避开陷阱。'
      },
      {
        id: 'skill-description-trigger',
        title: 'Skill 描述写触发条件，不是功能摘要',
        brief: '让 Claude 知道什么时候该用这个技能',
        detail:
          '好的 skill 描述："当用户要求创建新的 React 组件时，使用此技能"。差的描述："这个技能帮助创建 React 组件"。触发条件让 Claude 能自动决策何时调用技能，而不需要用户显式指定。'
      },
      {
        id: 'skill-no-obvious',
        title: '不要描述 Claude 已知的显而易见的事',
        brief: 'Skill 内容聚焦在"超出默认行为"的部分',
        detail:
          '"使用 TypeScript 的类型系统"这种描述没有价值。有价值的描述是："此项目的 API 类型定义在 packages/types/src/api.d.ts，不要在组件内定义新类型。" 只写 Claude 自己推断不出来的项目专属知识。'
      },
      {
        id: 'skill-goals-not-steps',
        title: '给目标和约束，不要给步骤',
        brief: '不要铁路式指导，让 Claude 自主决策路径',
        detail:
          '差的写法："第一步：运行 git pull。第二步：运行 npm install。第三步：..."。好的写法："确保本地代码库是最新的，依赖已安装，可以运行测试。" 给结果标准，让 Claude 自己决定怎么到达。'
      },
      {
        id: 'skill-scripts',
        title: '在 Skill 里内嵌可执行脚本',
        brief: '!command 语法注入动态 shell 输出到上下文',
        detail:
          '在 SKILL.md 里使用 `!command` 语法，Claude 会在加载技能时执行该命令并把输出注入上下文。例如 `!cat package.json` 自动提供当前依赖信息，`!git log --oneline -10` 提供最近提交历史。'
      },
      {
        id: 'skill-embed-dynamic',
        title: '技能中组合脚本，实现动态能力',
        brief: '在技能里引用脚本，避免在对话中重复构造',
        detail:
          '把常用的分析脚本（如"找出所有 TODO 注释并按文件分组"）放进 skill 的 scripts/ 目录。技能执行时直接调用脚本，而不是每次让 Claude 重新构造命令。脚本是精确的，自然语言描述有歧义。'
      }
    ]
  },
  {
    id: 'hooks',
    title: 'Hooks 钩子',
    emoji: '🪝',
    tips: [
      {
        id: 'hook-on-demand',
        title: '用技能实现按需 Hooks',
        brief: '/careful、/freeze 这类命令临时激活特定钩子',
        detail:
          '创建 /careful 技能，激活时启用严格的 PreToolUse 钩子（禁止删除文件、禁止修改 main 分支）。用完后 /unfreeze 恢复正常。这比全局配置更灵活，适合在高风险操作前临时收紧权限。'
      },
      {
        id: 'hook-measure',
        title: '用 PreToolUse 钩子统计技能使用频率',
        brief: '度量哪些技能最常用，优化投入',
        detail:
          '在 PreToolUse 钩子里记录每次工具调用到日志文件（工具名称、时间戳、会话 ID）。分析日志可以发现：哪些技能从未被用到（删除）、哪些工具调用频率出乎意料地高（值得优化）。'
      },
      {
        id: 'hook-format',
        title: '用 PostToolUse 自动格式化代码',
        brief: '每次写文件后自动跑 prettier/gofmt',
        detail:
          '配置 PostToolUse 钩子：当工具调用写入了 .ts/.tsx 文件时，自动运行 `npx prettier --write <file>`。这确保 Claude 生成的代码始终符合格式规范，不需要单独的"帮我格式化代码"步骤。'
      },
      {
        id: 'hook-security',
        title: '用 Hook 把权限请求路由到 Opus 审查',
        brief: 'Opus 扫描每次工具调用，拦截可疑操作',
        detail:
          '在 PreToolUse 钩子里，把敏感工具调用（如执行 shell 命令）发送给 Opus 做安全审查，Opus 返回"允许/拦截"决策。小模型写代码，大模型做安全守门，兼顾速度和安全性。'
      },
      {
        id: 'hook-stop',
        title: '用 Stop 钩子推动 Claude 验证工作',
        brief: 'Claude 停止前自动触发验证脚本',
        detail:
          '配置 Stop 钩子：在 Claude 结束任务时自动运行测试套件，如果测试失败，钩子返回失败信息推动 Claude 继续修复。Claude 停止后才发现测试没过是常见问题，Stop 钩子从根本上解决这个问题。'
      }
    ]
  },
  {
    id: 'workflows',
    title: 'Workflows 工作流',
    emoji: '⚙️',
    tips: [
      {
        id: 'wf-model',
        title: '用 /model 切换模型，/context 查看用量',
        brief: '根据任务类型动态选择最合适的模型',
        detail:
          '复杂架构任务用 Opus（更强推理，更贵）；代码生成和补全用 Sonnet（速度快，性价比高）；简单问答用 Haiku（最快最便宜）。养成根据任务动态切换的习惯，而不是一直用最贵的模型。'
      },
      {
        id: 'wf-thinking',
        title: '开启 Thinking 模式和解释型输出风格',
        brief: '让 Claude 展示推理过程，质量更可控',
        detail:
          '在 /config 里启用 extended thinking（允许 Claude 在回答前进行深度推理）和 explanatory output style（每个操作附带原因说明）。调试复杂问题时特别有用，能看到 Claude 的推理链是否合理。'
      },
      {
        id: 'wf-ultrathink',
        title: '用"ultrathink"触发高强度推理',
        brief: '在提示词中加入 ultrathink 让 Claude 投入最大推理预算',
        detail:
          '在任务描述后加上"ultrathink about this before proceeding"，Claude 会使用更大的推理预算，在回答前做更深入的分析。适用于：架构决策、复杂 bug 根因分析、安全漏洞评估等高难度任务。'
      },
      {
        id: 'wf-focus',
        title: '/focus 模式隐藏中间步骤',
        brief: '专注于结果，不展示中间的工具调用细节',
        detail:
          '/focus 模式下，Claude 隐藏探索和思考过程，只展示最终结果。适合你信任 Claude 能自主完成任务、只关心输出的场景。如果需要追踪过程（调试、学习），则关闭此模式。'
      },
      {
        id: 'wf-effort',
        title: '用 Opus 4.7 的自适应推理滑块调节努力级别',
        brief: '根据任务难度调节推理预算，平衡速度与质量',
        detail:
          'Opus 4.7 支持动态调整推理 token 预算。简单任务用低预算（快速回复）；复杂任务拉高预算（深度推理）。不要对所有任务都用最高推理预算，这会造成不必要的延迟和费用。'
      }
    ]
  },
  {
    id: 'advanced',
    title: '高级工作流',
    emoji: '🚀',
    tips: [
      {
        id: 'adv-ascii',
        title: '用 ASCII 图表理解架构',
        brief: '让 Claude 输出 ASCII 架构图，快速建立系统全貌',
        detail:
          '问 Claude："用 ASCII 图表展示这个代码库的主要模块及其依赖关系。" ASCII 图表不需要额外工具渲染，可以内嵌在 CLAUDE.md 里作为架构文档。也可以用图表驱动讨论："按照这个架构图，我们的变更是否合理？"'
      },
      {
        id: 'adv-loop',
        title: '用 /loop 执行本地周期任务',
        brief: '/loop 运行重复任务，/schedule 执行云端计划任务',
        detail:
          '/loop 适合本地持续监控任务（如"每 30 分钟检查测试是否通过"）；/schedule 适合云端定时任务（如"每天早上 9 点运行竞品分析"）。两者的区别：/loop 本地运行需保持终端开启，/schedule 独立运行。'
      },
      {
        id: 'adv-ralph',
        title: '用 Ralph Wiggum 插件做长时间自主任务',
        brief: '自我参照循环实现持续改进',
        detail:
          'Ralph Wiggum 插件实现了迭代改进循环：Claude 执行任务 → 评估结果 → 识别改进点 → 再次执行，循环进行直到达到质量标准。适合代码优化、文档完善等需要多轮迭代的任务。'
      },
      {
        id: 'adv-permissions',
        title: '用 /permissions 而非 --dangerously-skip-permissions',
        brief: '精细权限控制替代全量跳过，更安全',
        detail:
          '--dangerously-skip-permissions 跳过所有权限确认，风险极高。改用 /permissions 配合通配符语法精确配置哪些操作无需确认（如允许 git 命令、允许读取特定目录），保留对危险操作的把关。'
      },
      {
        id: 'adv-sandbox',
        title: '用 /sandbox 实现文件和网络隔离',
        brief: '沙箱模式减少 84% 的权限提示',
        detail:
          '/sandbox 在受限环境中运行 Claude，文件访问和网络访问均受限，同时预授权一批安全操作。实测数据：权限提示减少 84%，同时保持安全性。推荐在处理不受信任的代码或探索性任务时启用。'
      },
      {
        id: 'adv-verify-skills',
        title: '投资于产品验证技能',
        brief: '构建 signup-flow-driver、checkout-verifier 等验证自动化',
        detail:
          '创建专门用于端到端验证的技能：signup-flow-driver 自动化测试注册流程，checkout-verifier 验证支付链路。这些技能可以在每次 Claude 做出变更后自动运行，确保核心流程不被破坏。'
      },
      {
        id: 'adv-auto-mode',
        title: '用 Auto 模式替代跳过所有权限',
        brief: 'Auto 模式智能决策权限，而非无脑放行',
        detail:
          'Auto 模式让 Claude 基于上下文智能决定是否需要确认，对明显安全的操作自动放行，对危险操作仍然要求确认。比 --dangerously-skip-permissions 更安全，比逐个确认更高效。'
      },
      {
        id: 'adv-less-prompts',
        title: '用 /less-permission-prompts 构建安全的命令白名单',
        brief: '分析历史记录，自动生成读操作的权限白名单',
        detail:
          '这个技能分析你过去的会话记录，找出高频的只读命令，自动添加到 .claude/settings.json 的权限白名单。减少烦人的权限提示，同时不放开危险操作。推荐在新项目启动时运行一次。'
      },
      {
        id: 'adv-go-skill',
        title: '构建 /go 技能实现端到端自动化',
        brief: '一键完成：测试 → 简化 → 创建 PR',
        detail:
          '/go 技能的标准流程：运行完整测试套件 → 运行 /simplify 清理冗余代码 → 运行 lint 和类型检查 → 创建 PR 并填写描述。把这些手动步骤自动化，确保每次提交都经过完整的质量门控。'
      }
    ]
  },
  {
    id: 'git',
    title: 'Git / PR',
    emoji: '🔀',
    tips: [
      {
        id: 'git-small-pr',
        title: '保持 PR 小而专注',
        brief: '中位数 ~118 行，一个 PR 对应一个功能',
        detail:
          '大型 PR（1000+ 行）审查质量低，合并冲突多，出错概率高。把每个功能拆成多个小 PR：接口定义 → 数据层 → 业务逻辑 → UI 层。每个 PR 都能独立审查和回滚。118 行是社区统计的高质量 PR 中位数。'
      },
      {
        id: 'git-squash',
        title: '始终 Squash Merge PR',
        brief: '保持主分支线性历史，每个功能一个提交',
        detail:
          'Squash merge 把 PR 的所有提交压缩为一个，主分支历史变得清晰：每一行 git log 对应一个完整功能。这让 git bisect 找 bug 更容易，也让回滚更干净（revert 一个 commit 即可撤销整个功能）。'
      },
      {
        id: 'git-frequent-commit',
        title: '频繁提交，每小时至少一次',
        brief: '小的、有意义的提交是最好的安全网',
        detail:
          '每次 Claude 完成一个子任务就提交，不要等整个功能完成。这样：出错时只需回退一小步；Claude 本身把提交当作检查点；git blame 更有用；代码审查更容易追踪变更历史。'
      },
      {
        id: 'git-tag-claude',
        title: '在同事 PR 上 @claude 生成 lint 规则',
        brief: 'Claude 分析 PR 模式，自动提取可复用的代码规范',
        detail:
          '当同事提交了一个你想推广的代码模式时，在 PR 评论里 @claude"分析这个 PR，提取可以添加到 .claude/rules/ 的规范，防止我们在其他地方违反这个模式。" 把优秀实践自动转化为强制规则。'
      },
      {
        id: 'git-review',
        title: '用 /code-review 做多智能体 PR 分析',
        brief: '多角度并行审查：安全、性能、可维护性',
        detail:
          '/code-review 启动多个专业视角的子智能体并行审查同一个 PR：安全智能体找漏洞，性能智能体找瓶颈，可维护性智能体评估代码质量。三路汇总的结果比单一审查覆盖面更广。'
      }
    ]
  },
  {
    id: 'debug',
    title: 'Debugging',
    emoji: '🐛',
    tips: [
      {
        id: 'debug-screenshot',
        title: '截图分享给 Claude',
        brief: '遇到 UI 问题或错误，直接粘贴截图',
        detail:
          '不要描述你看到的界面或错误，直接截图粘贴给 Claude。Claude 看图的信息量远超你的文字描述（颜色、布局、完整错误堆栈）。特别是视觉 bug，百字描述不如一张截图。'
      },
      {
        id: 'debug-mcp-browser',
        title: '用 MCP 浏览器工具获取控制台信息',
        brief: 'Claude in Chrome、Playwright 让 Claude 直接看控制台输出',
        detail:
          '配置 Claude in Chrome MCP 或 Playwright MCP，让 Claude 直接打开浏览器、操作页面、读取控制台输出和网络请求。Claude 不再依赖你转述错误信息，能自主定位前端问题根因。'
      },
      {
        id: 'debug-background',
        title: '把长时任务作为后台进程运行',
        brief: '后台任务不阻塞终端，结果异步返回',
        detail:
          '让 Claude 用"&"把长时任务放到后台（如"npm run build &"），终端继续可用。Claude 可以随时查询后台任务的输出，而不是等待。这在调试构建问题时特别有用：边构建边做其他分析。'
      },
      {
        id: 'debug-doctor',
        title: '用 /doctor 诊断安装和配置问题',
        brief: 'Claude Code 环境自检工具',
        detail:
          '当 Claude Code 本身行为异常时（命令不可用、MCP 连不上、权限异常），先运行 /doctor。它会检查：Claude Code 版本、Node 版本、配置文件格式、MCP 服务器连接状态，并给出修复建议。'
      },
      {
        id: 'debug-cross-model',
        title: '跨模型工作流做 QA',
        brief: '用 Codex 或其他模型做交叉审查',
        detail:
          '把 Claude 写的代码发给 GPT-4 或 Gemini 审查，把对方写的发给 Claude 审查。不同模型有不同的训练偏差和盲点，交叉审查能发现单一模型自我审查时忽略的问题。特别适用于安全关键代码。'
      },
      {
        id: 'debug-search',
        title: 'Agentic 搜索优于 RAG',
        brief: 'glob + grep 实时搜索代码，比向量搜索更准确',
        detail:
          '向量搜索（RAG）依赖索引，代码更新后索引可能过期，给出错误的"相关代码"。用 glob 和 grep 直接搜索文件系统始终是最新的。对于代码库，grep 比语义搜索更精确，且不需要额外基础设施。'
      }
    ]
  },
  {
    id: 'utilities',
    title: '工具与环境',
    emoji: '🛠️',
    tips: [
      {
        id: 'util-terminal',
        title: '用 iTerm/Ghostty/tmux 而非 IDE',
        brief: '终端环境给 Claude 更多控制权和灵活性',
        detail:
          '在终端里运行 Claude 可以自由配置 shell 环境、使用 tmux 多窗格、访问所有命令行工具。IDE 集成虽然方便，但受 IDE 本身功能限制。专业使用推荐：Ghostty + tmux 组合，性能最好。'
      },
      {
        id: 'util-voice',
        title: '用语音输入提升 10x 效率',
        brief: '/voice 或 Wispr Flow 实现语音转提示词',
        detail:
          '语音输入的速度是打字的 3-5 倍，对于长篇需求描述效果尤为显著。Claude Code 内置 /voice 命令，或使用 Wispr Flow 这类系统级语音输入工具。多国语言均支持，中文识别准确率高。'
      },
      {
        id: 'util-hooks-feedback',
        title: '用 claude-code-hooks 获取反馈',
        brief: '社区钩子库，快速集成常用的自动化行为',
        detail:
          'claude-code-hooks 是社区维护的钩子配置集合，包含：自动格式化、测试触发、Slack 通知、Git 操作等。不需要自己从零写钩子，直接复用社区验证过的配置，按需组合。'
      },
      {
        id: 'util-status-line',
        title: '用 Status Line 实时感知上下文状态',
        brief: '终端状态栏显示 token 用量、活跃工具、Git 信息',
        detail:
          'Status Line（claude-hud 插件或终端 prompt 集成）在每次提示符旁显示：当前 token 用量百分比、活跃的工具调用、当前 Git 分支和状态。随时了解上下文压力，在需要前主动 /compact。'
      },
      {
        id: 'util-settings',
        title: '探索 settings.json 的隐藏功能',
        brief: 'Plans Directory、Spinner Verbs 等高级配置',
        detail:
          'settings.json 里有许多未在文档显著位置列出的功能：Plans Directory（指定计划文件存放位置）、Spinner Verbs（自定义等待动画文字）、Custom Prompts（预置提示词模板）。定期查看 changelog 发现新功能。'
      }
    ]
  },
  {
    id: 'daily',
    title: '日常习惯',
    emoji: '📅',
    tips: [
      {
        id: 'daily-update',
        title: '每天更新 Claude Code',
        brief: '保持最新版本，及时获得性能和功能改进',
        detail:
          'Claude Code 更新非常频繁（有时每天多次），每次更新可能包含：模型行为改进、新工具、bug 修复、性能优化。运行 `claude update` 或通过包管理器更新。落后版本太多会错过重要改进。'
      },
      {
        id: 'daily-changelog',
        title: '每天早上读 Changelog',
        brief: '5 分钟了解新功能，持续构建使用优势',
        detail:
          'Claude Code 团队每天发布 changelog，通常包含：新的斜杠命令、hooks 改进、MCP 更新、使用技巧。花 5 分钟阅读，累积下来是巨大的认知优势。可以订阅官方 Discord 或 X 账号获取推送。'
      }
    ]
  }
]
