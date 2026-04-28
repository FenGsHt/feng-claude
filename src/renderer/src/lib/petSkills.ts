export interface SkillDef {
  id: string
  name: string
  icon: string
  description: string
  unlockLevel: number
  maxLevel: number
  systemPromptBoost: string[]
}

export const SKILL_DEFINITIONS: SkillDef[] = [
  {
    id: 'code_review',
    name: '代码审查',
    icon: '🔍',
    description: '分析代码变更，给出改进建议',
    unlockLevel: 1,
    maxLevel: 3,
    systemPromptBoost: [
      '你具备基础的代码审查能力，能指出明显的错误、命名问题和代码坏味道。',
      '你擅长代码审查，能识别反模式、架构问题，并给出具体的重构建议。',
      '你是代码审查专家，能提供深度的架构级批判，识别微妙的 bug，并参考业界最佳实践给出重构方案。',
    ],
  },
  {
    id: 'tech_trends',
    name: '技术趋势',
    icon: '📡',
    description: '推荐前沿技术替代方案',
    unlockLevel: 3,
    maxLevel: 3,
    systemPromptBoost: [
      '你了解一些最新技术趋势，偶尔会提及。',
      '你对技术趋势有深入了解，会在相关场景推荐现代化替代方案。',
      '你深度连接技术生态，始终提出最前沿的解决方案，给出具体的库/工具名称和版本。',
    ],
  },
  {
    id: 'debug_helper',
    name: '调试助手',
    icon: '🐛',
    description: '从终端输出中识别潜在 bug',
    unlockLevel: 5,
    maxLevel: 3,
    systemPromptBoost: [
      '你能识别终端输出中的简单错误。',
      '你擅长调试，能分析错误信息并建议可能的根因。',
      '你是调试大师，能追踪错误链、识别竞态条件，并提供分步调试策略。',
    ],
  },
  {
    id: 'architecture',
    name: '架构建议',
    icon: '🏗',
    description: '高层设计推荐和权衡分析',
    unlockLevel: 8,
    maxLevel: 3,
    systemPromptBoost: [
      '你有基础的架构意识，能推荐简单的设计模式。',
      '你理解软件架构，能推荐合适的模式并说明权衡。',
      '你是架构专家，能提供系统级设计见解，讨论可扩展性，并引用真实案例。',
    ],
  },
  {
    id: 'performance',
    name: '性能优化',
    icon: '⚡',
    description: '性能瓶颈分析和优化策略',
    unlockLevel: 12,
    maxLevel: 3,
    systemPromptBoost: [
      '你能注意到基础的性能问题，会简要提及。',
      '你擅长性能分析，能识别瓶颈并给出具体的优化建议。',
      '你是性能专家，能提供分析策略、算法复杂度分析和数据驱动的优化推荐。',
    ],
  },
  {
    id: 'chitchat_master',
    name: '闲聊大师',
    icon: '💬',
    description: '更有趣的日常对话',
    unlockLevel: 15,
    maxLevel: 3,
    systemPromptBoost: [
      '你在闲聊时稍微更有趣一些。',
      '你是一个很好的聊天伙伴，会使用幽默、类比和个性。',
      '你是休闲技术聊天大师，融合幽默、深度知识和迷人的人格，让每次回复都像与聪明朋友聊天。',
    ],
  },
]
