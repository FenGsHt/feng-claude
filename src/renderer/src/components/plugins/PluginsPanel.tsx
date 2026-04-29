import React, { useEffect, useState, useMemo } from 'react'
import type { PluginEntry } from '../../types/ipc'
import { useI18n } from '../../i18n'

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

const PLUGIN_ZH: Record<string, string> = {
  // ==================== Superpowers 市场插件 ====================
  'superpowers': '核心技能框架：头脑风暴、子代理开发（内置代码审查）、系统化调试、红绿重构TDD循环，教会 Claude 如何编写和测试新技能',
  'superpowers-chrome': 'BETA 测试版：直接访问 Chrome DevTools Protocol，Skill 模式提供 17 个 CLI 命令，MCP 模式提供单一浏览器工具，零依赖自动启动 Chrome',
  'elements-of-style': '写作风格指南，基于 William Strunk Jr. 1918 年《风格的要素》，提供 18 条清晰简洁、语法正确的写作基础规则',
  'episodic-memory': 'Claude Code 会话语义搜索，跨会话记住过去的讨论、决策和模式，提供持久化记忆能力，让你可以回顾昨天做了什么',
  'superpowers-lab': '实验性技能集合：tmux 自动化（用于交互式 CLI）、MCP 服务发现、重复函数检测、Slack 消息发送、无头 Windows VM',
  'superpowers-developing-for-claude-code': 'Claude Code 开发指南，包含 42+ 官方文档文件和完整参考，覆盖插件、技能、MCP 服务器和扩展开发，支持自更新',
  'superpowers-dev': '开发分支版本：安装前必须先卸载其他版本的 Superpowers，用于测试最新开发中的功能',
  'claude-session-driver': '通过 tmux 启动、控制和监控其他 Claude Code 会话作为工作节点，实现多会话协作',
  'private-journal-mcp': '私密日记 MCP 服务器，支持语义搜索和多分区记录（感受、项目笔记、技术洞察、用户上下文），本地 AI 嵌入和全文检索',
  'double-shot-latte': '消除"Would you like me to continue?"的打断，使用 Claude 自身判断自动决定是否继续工作',
  // ==================== Anthropic 官方插件 ====================
  'frontend-design': '创建独特的生产级前端界面，避免通用的 AI 审美疲劳，注重大胆排版与高冲击力动效，生成创意精致的代码',
  'code-review': '多专家代理并行自动代码审查，使用置信度评分过滤误报，从安全、性能、可维护性等多维度审计 PR 变更',
  'code-simplifier': '简化过度复杂的代码，专注于最近修改的代码，在保持功能的同时提升清晰度、一致性和可维护性',
  'feature-dev': '综合功能开发工作流，包含代码库探索、架构设计和质量审查的专项代理，从需求到实现全程引导',
  'ralph-loop': 'Ralph Wiggum 自我参照迭代技术：Claude 反复处理同一任务并查看之前的工作，直到完成',
  'typescript-lsp': 'TypeScript/JavaScript 语言服务器，提供增强的代码智能、类型检查、补全和重构功能',
  'commit-commands': 'Git 提交工作流命令：/commit、/push、PR 创建，简化版本控制操作',
  'security-guidance': '编辑文件时实时安全提醒，检测命令注入、XSS、不安全代码模式等潜在漏洞',
  'agent-sdk-dev': 'Claude Agent SDK 开发工具包，帮助构建多代理工作流',
  'claude-code-setup': '分析代码库并推荐定制的 Claude Code 自动化：hooks、技能、MCP 服务器和子代理',
  'claude-md-management': '维护和改进 CLAUDE.md 文件的工具：审计质量、捕获会话学习、保持项目记忆更新',
  'pr-review-toolkit': 'PR 审查代理集合，专注于评论、测试、错误处理、类型设计、代码质量和代码简化',
  'hookify': '通过分析对话模式或明确指令，轻松创建自定义 hooks 阻止不良行为，规则通过简单 markdown 文件定义',
  'skill-creator': '创建新技能、改进现有技能并测量技能性能：从零创建、优化、运行评估测试、性能基准分析',
  'mcp-server-dev': '设计和构建 MCP 服务器：部署模式（HTTP/MCPB/本地）、工具设计模式、认证和交互式 MCP 应用',
  'learning-output-style': '交互式学习模式，在决策点请求有意义的代码贡献，教会用户理解实现选择',
  'explanatory-output-style': '为实现选择和代码库模式添加教育性见解，解释每个操作的原理',
  'plugin-dev': 'Claude Code 插件开发综合工具包：7 个专家技能覆盖 hooks、MCP 集成、命令、代理和最佳实践',
  'playground': '创建交互式 HTML 演练场：自包含单文件探索器，包含可视化控件、实时预览和提示输出，支持设计演练、数据探索、概念图',
  'session-report': '从本地 ~/.claude/projects 生成可探索的 HTML 会话报告：tokens、缓存效率、子代理、技能和最昂贵的提示',
  'math-olympiad': '数学竞赛解题（IMO、Putnam、USAMO），使用对抗性验证捕捉自验证遗漏的问题，新上下文验证器用特定失败模式攻击证明',
  // ==================== LSP 语言服务器 ====================
  'rust-analyzer-lsp': 'Rust 语言服务器（rust-analyzer），提供代码智能、类型检查、补全和分析',
  'gopls-lsp': 'Go 语言服务器（gopls），提供代码智能、重构、补全和诊断',
  'pyright-lsp': 'Python 语言服务器（Pyright），静态类型检查和代码智能',
  'clangd-lsp': 'C/C++ 语言服务器（clangd），支持后台索引的代码智能',
  'ruby-lsp': 'Ruby 语言服务器，支持 .rb/.rake/.gemspec/.ru/.erb 文件的代码智能和分析',
  'swift-lsp': 'Swift 语言服务器（SourceKit-LSP），提供代码智能',
  'kotlin-lsp': 'Kotlin 语言服务器，支持 .kt/.kts 文件的代码智能',
  'csharp-lsp': 'C# 语言服务器（csharp-ls），提供代码智能',
  'jdtls-lsp': 'Java 语言服务器（Eclipse JDT.LS），提供代码智能，启动超时 120s',
  'lua-lsp': 'Lua 语言服务器（lua-language-server），提供代码智能',
  'php-lsp': 'PHP 语言服务器（Intelephense），提供代码智能',
  'elixir-ls-lsp': 'Elixir 语言服务器（ElixirLS），支持 .ex/.exs/.heex 文件的代码智能和诊断',
  'liquid-lsp': 'Shopify Liquid 模板语言服务器，通过 Shopify CLI theme 语言服务器集成',
  // ==================== 平台集成 ====================
  'github': 'GitHub MCP 官方服务器：创建 issue、管理 PR、审查代码、搜索仓库，直接从 Claude Code 调用 GitHub API',
  'gitlab': 'GitLab DevOps 平台集成：管理仓库、MR、CI/CD 管道、issue 和 wiki，全生命周期工具访问',
  'linear': 'Linear 项目管理集成：创建 issue、管理项目、更新状态、跨工作区搜索，现代化问题跟踪',
  'asana': 'Asana 项目管理集成：创建和管理任务、搜索项目、更新分配、跟踪进度',
  'atlassian': 'Atlassian 产品集成（Jira + Confluence）：搜索和创建 issue、访问文档、管理冲刺',
  'slack': 'Slack 工作区集成：搜索消息、访问频道、读取线程，快速找到相关讨论和上下文',
  'discord': 'Discord 消息桥接，内置访问控制，通过 /discord:access 管理 pairing、白名单和策略',
  'telegram': 'Telegram 消息桥接，内置访问控制，通过 /telegram:access 管理 pairing、白名单和策略',
  'imessage': 'iMessage 消息桥接，直接读取 chat.db，通过 AppleScript 发送，支持访问控制',
  'notion': 'Notion 工作区集成：搜索页面、创建和更新文档、管理数据库，直接访问团队知识库',
  'miro': 'Miro 白板集成：安全访问画板，AI 读取上下文、创建图表、生成代码，企业级安全',
  'figma': 'Figma 设计平台集成：访问设计文件、提取组件信息、读取设计令牌、将设计转化为代码',
  'intercom': 'Intercom 客服集成：搜索对话、分析客服模式、查找联系人和公司、安装 Messenger',
  'circleback': 'Circleback 上下文集成：搜索和访问会议、邮件、日历事件',
  'zapier': '连接 8000+ 应用到 AI 工作流：发现、启用和执行 Zapier 操作',
  'spotify-ads-api': '自然语言管理 Spotify 广告：创建 campaign、ad set、ads、拉取报告、处理 OAuth',
  // ==================== 云平台 ====================
  'cloudflare': 'Cloudflare 开发平台技能：Workers、Durable Objects、Agents SDK、MCP 服务器、Wrangler CLI 和 Web 性能',
  'vercel': 'Vercel 部署平台集成：管理部署、检查构建状态、访问日志、配置域名、控制前端基础设施',
  'netlify-skills': 'Netlify 平台技能：functions、edge functions、blobs、database、image CDN、forms、部署',
  'railway': 'Railway 应用部署：项目设置、部署、环境配置、网络、故障排查和监控',
  'supabase': 'Supabase MCP 集成：数据库操作、认证、存储、实时订阅，运行 SQL 查询',
  'firebase': 'Firebase MCP 集成：管理 Firestore、认证、云函数、托管和存储',
  'mongodb': 'MongoDB 官方插件（MCP + Skills）：连接数据库、探索数据、管理集合、优化查询、生成可靠代码',
  'neon': 'Neon PostgreSQL 管理：项目和数据库管理，neon-postgres 代理技能和 MCP 服务器',
  'planetscale': 'PlanetScale MCP：访问组织、数据库、分支、schema 和 Insights 数据，查询数据和发现慢查询',
  'cockroachdb': 'CockroachDB 官方插件：14 个工具、2 个 MCP 后端、3 个专项代理（DBA/Developer/Operator）、32 个技能',
  'pinecone': 'Pinecone 向量数据库：管理索引、查询数据、快速原型开发，支持语义搜索和 RAG 应用',
  'prisma': 'Prisma MCP 集成：Postgres 数据库管理、schema 迁移、SQL 查询、连接字符串管理',
  'aws-amplify': 'AWS Amplify Gen 2 全栈开发：认证、数据模型、存储、GraphQL API 和 Lambda',
  'aws-serverless': 'AWS 无服务器应用：设计、构建、部署、测试和调试',
  'deploy-on-aws': 'AWS 部署：架构推荐、成本估算和 IaC 部署',
  'databases-on-aws': 'AWS 数据库专家指导：schema 设计、查询执行、迁移处理和数据库选择',
  'azure-skills': 'Azure MCP 集成：云资源管理、部署和应用监控',
  'azure-cosmos-db-assistant': 'Azure Cosmos DB 专家助手：数据建模、查询优化、性能调优和最佳实践',
  'dataverse': 'Microsoft Dataverse 技能：Dataverse MCP、PAC CLI 和 Python SDK',
  'sagemaker-ai': 'Amazon SageMaker AI/ML：构建、训练和部署 AI 模型',
  'terraform': 'HashiCorp Terraform MCP：IaC 开发的无缝集成和高级自动化',
  'cloudinary': 'Cloudinary 媒体管理：管理资产、应用转换、优化媒体',
  'fastly-agent-toolkit': 'Fastly 边缘平台开发工具',
  'helius': 'Solana 区块链开发：实时区块链工具、专家编码模式、自主账户注册',
  'base44': 'Base44 全栈应用开发：CLI 项目管理和 JS/TS SDK 开发技能',
  'wix': 'Wix 网站开发：CLI 技能用于 dashboard 扩展、后端 API、站点 widget，MCP 服务器用于站点管理',
  'wordpress.com': 'WordPress 网站开发：用 WordPress Studio 创建和编辑站点，然后部署到 WordPress.com',
  'expo': 'React Native Expo 官方技能：构建、部署、升级、调试，覆盖 Expo Router、SwiftUI、Jetpack Compose、CI/CD',
  'context7': 'Upstash Context7 MCP：最新文档检索，从源仓库拉取版本特定的文档和代码示例',
  // ==================== 数据工程 ====================
  'astronomer-data-agents': 'Apache Airflow 和 Astronomer 数据工程：编写 DAG、调试管道故障、追踪数据血缘、迁移 Airflow 2→3',
  'data': 'Airflow 数据工程：DAG 编写、管道调试、数据血缘、表分析、部署管理',
  'data-engineering': '数据仓库探索、管道编写、Airflow 集成',
  'atlan': 'Atlan 数据目录插件：通过自然语言搜索、探索、治理和管理数据资产，语义搜索、血缘遍历、词汇表管理',
  'fiftyone': '计算机视觉数据集管理：可视化数据集、分析模型、找重复、运行推理、评估预测',
  'huggingface-skills': 'HuggingFace 技能：构建、训练、评估和使用开源 AI 模型、数据集和 Spaces',
  'pydantic-ai': 'Pydantic AI 开发：最新模式、决策树、常见陷阱，覆盖代理、工具、结构化输出、流式和多代理应用',
  'goodmem': 'AI 代理记忆基础设施：Python SDK 管理嵌入器、空间和记忆，或 MCP 工具直接操作',
  'remember': 'Claude Code 持续记忆：提取、总结和压缩会话为分层日志，Claude 记住昨天做了什么',
  'product-tracking-skills': 'SaaS 产品分析数据准备：从代码库扫描到追踪计划到可用的埋点代码',
  // ==================== 网页抓取与自动化 ====================
  'firecrawl': 'Firecrawl 网页抓取：将任何网站转为 LLM-ready markdown 或结构化数据，支持单页抓取、整站爬取、网络搜索、AI 自主多源数据收集',
  'brightdata-plugin': 'Bright Data 网页抓取：7 个技能包括网页抓取（绕过机器人检测/CAPTCHA）、Google 搜索、40+ 网站数据提取（Amazon/LinkedIn/TikTok 等）',
  'stagehand': 'Browserbase 浏览器自动化：使用 Stagehand 自动化网络交互、提取数据、用自然语言导航网站',
  'chrome-devtools-mcp': 'Chrome DevTools MCP：控制和检查实时 Chrome，录制性能追踪、分析网络请求、检查控制台消息、Puppeteer 自动化',
  'playwright': 'Microsoft Playwright MCP：浏览器自动化和端到端测试，截图、填表、点击元素、自动测试工作流',
  'greptile': 'AI 代码库搜索：用自然语言查询仓库，找到相关代码、理解依赖、获取架构上下文答案',
  'sourcegraph': '跨仓库代码搜索：搜索、读取、追踪引用、分析重构影响、调查事故、安全扫描',
  'serena': '语义代码分析 MCP：通过 LSP 集成提供智能代码理解、重构建议和代码库导航',
  'nimble': 'Nimble 网络数据工具：搜索、提取、映射、爬取网络和使用结构化数据代理',
  // ==================== 安全工具 ====================
  'autofix-bot': 'DeepSource 代码审查代理：检测安全漏洞、代码质量问题和硬编码密钥，5000+ 静态分析器扫描 CVE',
  'coderabbit': 'CodeRabbit 代码审查伙伴：专业 AI 架构和 40+ 静态分析器，AST 解析和 codegraph 关系，自动应用 CLAUDE.md 规则',
  'aikido': 'Aikido 安全扫描：SAST、密钥检测和 IaC 漏洞检测',
  'semgrep': 'Semgrep 实时安全：实时检测漏洞，引导 Claude 从一开始就编写安全代码',
  'sonarqube': 'SonarSource SonarQube：7000+ 规则、密钥扫描、40+ 语言质量门，PostToolUse hooks 每次编辑后分析',
  'sonatype-guide': 'Sonatype 供应链安全：分析依赖漏洞、获取安全版本推荐、检查组件质量',
  'nightvision': 'NightVision DAST：Web 应用和 REST API 的可利用漏洞发现平台',
  'opsera-devsecops': 'Opsera DevSecOps：AI 架构分析、安全扫描、合规审计和 SQL 安全，含免费试用',
  'ai-plugins': 'Endor Labs 供应链安全：设置 endorctl，扫描、优先排序和修复软件供应链安全风险',
  'ai-firstify': 'AI-first 项目审计：基于 TechWolf AI-First Bootcamp 的 9 条设计原则和 7 种设计模式',
  'optibot': 'Optimal AI 代码审查：发现生产级 bug、业务逻辑问题和安全漏洞',
  'pagerduty': 'PagerDuty 风险评分：通过历史事故数据对预提交 diff 评分，在部署前发现风险',
  // ==================== 监控与分析 ====================
  'datadog': 'Datadog MCP 集成：查询日志、指标、追踪、仪表板，自然语言对话监控',
  'sentry': 'Sentry 错误监控：访问错误报告、分析堆栈追踪、按指纹搜索 issue、调试生产错误',
  'posthog': 'PostHog 分析：访问分析、功能标志、实验、错误追踪和洞察',
  'amplitude': 'Amplitude 分析：作为专家分析师使用，发现产品机会、分析图表、创建仪表板、管理实验',
  // ==================== 支付集成 ====================
  'stripe': 'Stripe 开发插件：支付集成开发',
  'revenuecat': 'RevenueCat 应用内购买：配置项目、应用、产品、权益和优惠',
  'rc': 'RevenueCat 简写：同上',
  'sumup': 'SumUp 支付集成：终端和在线结账流程，Android/iOS POS 应用、在线结账 SDK、Cloud API 远程控制读卡器',
  // ==================== 企业应用 ====================
  'adlc': 'Salesforce Agentforce 开发生命周期：编写、发现、脚手架、部署、测试和优化 .agent 文件',
  'cds-mcp': 'SAP CAP/CDS 项目开发：AI 辅助开发，搜索 CDS 模型和 CAP 文档',
  'ui5': 'SAPUI5/OpenUI5 插件：创建和验证 UI5 项目、API 文档、UI5 linter、开发指南和最佳实践',
  'ui5-typescript-conversion': 'UI5 TypeScript 转换：将 JavaScript UI5 项目转换为 TypeScript',
  'netsuite-suitecloud': 'Oracle NetSuite SuiteCloud：SDF 对象编写指导、UIF 单页应用组件、AI Service Connector',
  'laravel-boost': 'Laravel 开发工具包：Artisan 命令、Eloquent 查询、路由、迁移、框架特定代码生成',
  'liquid-skills': 'Shopify Liquid 技能：Liquid 语言基础、CSS/JS/HTML 编码标准、WCAG 无障碍模式',
  'shopify': 'Shopify 开发工具：搜索文档、生成和验证 GraphQL、Liquid 和 UI 扩展代码',
  'shopify-ai-toolkit': 'Shopify AI 工具集：18 个开发技能，覆盖文档搜索、API schema、GraphQL/Liquid 验证、Hydrogen、Polaris UI',
  // ==================== 其他工具 ====================
  'mintlify': 'Mintlify 文档站点：将非 markdown 文件转为 MDX 页面，正确使用组件，自动化文档更新',
  'microsoft-docs': '微软官方文档：访问 Azure、.NET、Windows 的文档、API 参考和代码示例',
  'searchfit-seo': 'SEO 工具集：网站审计、内容策略、页面优化、schema 生成、关键词聚类、AI 可见性追踪',
  'followrabbit': 'GCP 云成本优化：审查变更成本影响，自动应用节省建议',
  'firetiger': 'Firetiger 可观测性：MCP 驱动的调查工作流',
  'flint': 'Flint AI 网站构建器：自然对话构建和管理网站',
  'fakechat': '本地测试聊天桥：测试频道通知流程，无需 token、无访问控制、无第三方服务',
  'qodo-skills': 'Qodo 技能库：可复用 AI 代理能力，代码质量检查、自动测试、安全扫描、合规验证',
  'adspirer-ads-agent': '跨平台广告管理：Google Ads、Meta Ads、TikTok Ads、LinkedIn Ads，91 个工具',
  'voila-api': 'Voila 物流 API：发货创建、实时追踪、历史记录、manifesting、webhook、第三方集成',
  'zoom-plugin': 'Zoom 集成开发：REST API、SDK、webhook、bot、MCP 工作流',
  'bigdata-com': 'RavenPack 金融研究：官方 Bigdata.com 插件，金融研究和情报工具',
  'sanity': 'Sanity 内容平台：MCP 服务器、代理技能、斜杠命令，查询和编写内容、GROQ 查询、schema 设计',
  'box': 'Box 内容管理：搜索文件、组织文件夹、团队协作、Box AI 问答和文档摘要',
  'legalzoom': 'LegalZoom 法律工具：AI 文档审查识别风险、建议何时请律师、路由到律师网络',
  'atomic-agents': 'Atomic Agents 框架：AI 代理开发综合工作流，schema 设计、架构规划、代码审查、工具开发',
  'amazon-location-service': 'Amazon Location 服务：地图、地点搜索、地理编码、路由等地理空间功能',
  'postman': 'Postman API 管理：同步集合、生成客户端代码、发现 API、运行测试、创建 mock、发布文档、安全审计',
  'postiz': '社交媒体自动化：28+ 平台发帖调度、集成管理、媒体上传、分析追踪',
}

const MARKETPLACE_LABELS: Record<string, string> = {
  'claude-plugins-official': '官方市场',
  'claude-hud': 'Claude HUD',
  'superpowers-marketplace': 'Superpowers',
  'custom': '自定义'
}

function marketplaceLabel(id: string): string {
  return MARKETPLACE_LABELS[id] ?? id
}

export function PluginsPanel(): React.ReactElement {
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [newPlugins, setNewPlugins] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'all' | 'enabled'>('all')
  const { t } = useI18n()

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.electronAPI.plugins?.list()
      setPlugins(list ?? [])
    } catch (e) {
      console.error('[PluginsPanel] failed to load plugins:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const res = await window.electronAPI.plugins?.refresh()
      if (res) {
        setPlugins(res.plugins)
        setNewPlugins(new Set(res.newPlugins))
        setTimeout(() => setNewPlugins(new Set()), 30_000)
      }
    } catch (e) {
      console.error('[PluginsPanel] refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const filtered = useMemo(() => {
    let list = tab === 'enabled' ? plugins.filter((p) => p.isEnabled) : plugins
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [plugins, query, tab])

  const handleToggle = async (plugin: PluginEntry): Promise<void> => {
    setToggling((s) => new Set(s).add(plugin.id))
    try {
      await window.electronAPI.plugins.setEnabled(plugin.id, !plugin.isEnabled)
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, isEnabled: !p.isEnabled } : p))
      )
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(plugin.id); return n })
    }
  }

  const enabledCount = plugins.filter((p) => p.isEnabled).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-claude-border shrink-0">
        {(['all', 'enabled'] as const).map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
              tab === tabId
                ? 'text-amber-400 border-b-2 border-amber-400 -mb-px'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {tabId === 'all' ? t.plugins.market : `${t.plugins.enabled} ${enabledCount > 0 ? `(${enabledCount})` : ''}`}
          </button>
        ))}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title={t.plugins.refreshTitle}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-claude-muted hover:text-amber-400 disabled:opacity-40 transition-colors mr-1"
        >
          <svg
            width="13" height="13" viewBox="0 0 13 13" fill="none"
            className={refreshing ? 'animate-spin' : ''}
          >
            <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2c1.2 0 2.3.47 3.18 1.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M9.5 1v2.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.plugins.searchPlaceholder}
          className="w-full bg-claude-bg border border-claude-border rounded px-2 py-1 text-[11px] text-claude-text placeholder-claude-border outline-none focus:border-amber-500/60 font-mono"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {t.common.loading}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
            {tab === 'enabled' ? t.plugins.noEnabled : t.plugins.noMatch}
          </div>
        ) : (
          filtered.map((plugin) => (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              isNew={newPlugins.has(plugin.name)}
              toggling={toggling.has(plugin.id)}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-3 py-1.5 border-t border-claude-border text-[9px] text-claude-muted text-center leading-snug">
        {t.plugins.footerHint}
      </div>
    </div>
  )
}

function PluginRow({
  plugin,
  isNew,
  toggling,
  onToggle
}: {
  plugin: PluginEntry
  isNew: boolean
  toggling: boolean
  onToggle: (p: PluginEntry) => void
}): React.ReactElement {
  const { t } = useI18n()
  return (
    <div className="px-3 py-2.5 border-b hover:bg-claude-bg/40 group" style={{ borderBottomColor: 'var(--claude-border-subtle)' }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-claude-text">{plugin.name}</span>
            {isNew && (
              <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                {t.plugins.new}
              </span>
            )}
            {plugin.isInstalled && (
              <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-400 border border-green-500/20">
                {t.plugins.installed}
              </span>
            )}
            {plugin.installCount > 0 && (
              <span className="text-[9px] text-claude-muted ml-auto">
                ↓ {formatCount(plugin.installCount)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-claude-muted mt-0.5 leading-snug line-clamp-2">
            {PLUGIN_ZH[plugin.name] ?? (plugin.description || '暂无描述')}
          </p>
          <p className="text-[9px] text-claude-border mt-0.5">{marketplaceLabel(plugin.marketplace)}</p>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(plugin)}
          disabled={toggling}
          title={plugin.isEnabled ? t.common.disable : t.common.enable}
          className={`shrink-0 mt-0.5 relative w-8 h-4 rounded-full transition-colors ${
            toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${plugin.isEnabled ? 'bg-amber-500' : 'bg-claude-border'}`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${
              plugin.isEnabled ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
