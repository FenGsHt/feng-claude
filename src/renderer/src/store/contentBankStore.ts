/**
 * 内容库 Store - 闲聊/笑话/新闻/技巧，每日更新，用完即删
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ContentCategory } from '../lib/contentPresets'
import { ALL_PRESETS } from '../lib/contentPresets'

export interface BankItem {
  id: string
  category: ContentCategory
  content: string
  used: boolean
  createdAt: number
  source: 'preset' | 'api'
}

interface ContentBankStore {
  items: BankItem[]
  lastDailyUpdate: number

  // 按分类获取未使用的项
  getUnusedByCategory: (category: ContentCategory) => BankItem[]
  // 获取任意未使用的项（按权重随机）
  getRandomUnused: () => BankItem | null
  // 标记为已使用
  markUsed: (id: string) => void
  // 清理过期/已用完的内容
  cleanup: () => void
  // 添加新内容
  addItems: (category: ContentCategory, contents: string[], source: 'preset' | 'api') => void
  // 初始化预设内容
  initPresets: () => void
  // 执行每日更新（调用 API）
  performDailyUpdate: () => Promise<void>
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const useContentBankStore = create<ContentBankStore>()(
  persist(
    (set, get) => ({
      items: [],
      lastDailyUpdate: 0,

      getUnusedByCategory: (category) => {
        return get().items.filter((item) => item.category === category && !item.used)
      },

      getRandomUnused: () => {
        const unused = get().items.filter((item) => !item.used)
        if (unused.length === 0) return null
        // 按分类权重：tip 30%, joke 25%, chitchat 25%, news 20%
        const weights: Record<ContentCategory, number> = {
          tip: 30, joke: 25, chitchat: 25, news: 20
        }
        const weighted = unused.flatMap((item) =>
          Array(weights[item.category]).fill(item)
        )
        return weighted[Math.floor(Math.random() * weighted.length)] ?? null
      },

      markUsed: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, used: true } : item
          ),
        }))
      },

      cleanup: () => {
        const now = Date.now()
        const oneDayMs = 24 * 60 * 60 * 1000
        set((state) => ({
          items: state.items.filter((item) =>
            !item.used && (now - item.createdAt) < oneDayMs
          ),
        }))
      },

      addItems: (category, contents, source) => {
        const now = Date.now()
        const newItems: BankItem[] = contents.map((content) => ({
          id: generateId(),
          category,
          content,
          used: false,
          createdAt: now,
          source,
        }))
        set((state) => ({
          items: [...state.items, ...newItems],
        }))
      },

      initPresets: () => {
        const state = get()
        if (state.items.length > 0) return // 已有内容，不重复初始化

        const now = Date.now()
        const allItems: BankItem[] = []
        for (const [category, presets] of Object.entries(ALL_PRESETS)) {
          for (const content of presets) {
            allItems.push({
              id: generateId(),
              category: category as ContentCategory,
              content,
              used: false,
              createdAt: now,
              source: 'preset',
            })
          }
        }
        set({ items: allItems })
      },

      performDailyUpdate: async () => {
        const now = Date.now()
        // 清理过期内容
        get().cleanup()

        // 尝试调用 API 生成新内容
        try {
          // 为每个分类生成 8 条新内容
          for (const category of ['joke', 'tip', 'news'] as ContentCategory[]) {
            const result = await window.electronAPI.contentBank?.generate({
              category,
              count: 8,
            })
            if (result?.items) {
              get().addItems(category, result.items, 'api')
            }
          }
          set({ lastDailyUpdate: now })
        } catch (e) {
          console.warn('[contentBank] daily update failed:', e)
          // 失败时用预设补充
          for (const [category, presets] of Object.entries(ALL_PRESETS)) {
            const unusedPresets = presets.slice(0, 8)
            get().addItems(category as ContentCategory, unusedPresets, 'preset')
          }
        }
      },
    }),
    {
      name: 'content-bank-store',
      partialize: (s) => ({
        items: s.items.filter((item) => !item.used), // 只保存未使用的
        lastDailyUpdate: s.lastDailyUpdate,
      }),
    }
  )
)