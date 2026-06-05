/** [2026-06-05] zustand persist 的存储适配器：走主进程 KV（存到 getConfigDir 稳定路径），
 *  替代 localStorage —— 后者在便携版/升级后可能不保留，导致刷新即丢。
 *  首次读取时若 KV 为空而 localStorage 有旧数据，则迁移过去（保留 dev 环境历史数据）。 */
import type { StateStorage } from 'zustand/middleware'

export const ipcPersistStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const v = await window.electronAPI.kv.get(name)
      if (v != null && v !== '') return v
      // 迁移：旧的 localStorage 数据
      try {
        const legacy = localStorage.getItem(name)
        if (legacy != null && legacy !== '') {
          await window.electronAPI.kv.set(name, legacy)
          return legacy
        }
      } catch {
        /* ignore */
      }
      return null
    } catch {
      return null
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await window.electronAPI.kv.set(name, value)
    } catch {
      /* ignore */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await window.electronAPI.kv.set(name, '')
    } catch {
      /* ignore */
    }
  }
}
