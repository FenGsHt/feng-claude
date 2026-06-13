import type { Pricing, TokenTotals } from '../store/globalTokenStore'
import { computeCost } from '../store/globalTokenStore'

// [2026-06-13] 官方 Claude 模型定价（¥/M tokens，Anthropic USD × 7）
// 来源: https://platform.claude.com/docs/en/about-claude/pricing
export const MODEL_PRICING: Record<string, Pricing> = {
  'opus':   { inputPerM: 35,  outputPerM: 175, cacheCreatePerM: 43.75, cacheReadPerM: 3.50 },
  'sonnet': { inputPerM: 21,  outputPerM: 105, cacheCreatePerM: 26.25, cacheReadPerM: 2.10 },
  'haiku':  { inputPerM: 7,   outputPerM: 35,  cacheCreatePerM: 8.75,  cacheReadPerM: 0.70 },
  'fable':  { inputPerM: 70,  outputPerM: 350, cacheCreatePerM: 87.50, cacheReadPerM: 7.00 },
}

/** 从模型 ID（如 "claude-sonnet-4-6"）提取定价 key；非官方 Claude 模型返回 null */
export function modelToPricingKey(modelId: string): string | null {
  const lower = modelId.toLowerCase()
  if (!lower.startsWith('claude-')) return null
  if (lower.includes('opus')) return 'opus'
  if (lower.includes('fable') || lower.includes('mythos')) return 'fable'
  if (lower.includes('haiku')) return 'haiku'
  if (lower.includes('sonnet')) return 'sonnet'
  return null
}

/**
 * 计算 perModel 中所有已知 Claude 模型的总费用。
 * 用于给没有自定义定价的 profile（官方配置）算准确费用。
 */
export function computeClaudeModelsCost(perModel: Record<string, TokenTotals>): number {
  let cost = 0
  for (const [modelId, t] of Object.entries(perModel)) {
    const key = modelToPricingKey(modelId)
    if (!key) continue
    const p = MODEL_PRICING[key]
    if (p) cost += computeCost(t, p)
  }
  return cost
}
