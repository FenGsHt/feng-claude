import { create } from 'zustand'
import { zh } from './zh'
import { en } from './en'
import type { Translations } from './zh'
import type { AppLanguage } from '../types/settings'

const TRANSLATIONS: Record<AppLanguage, Translations> = { zh, en }

interface LangStore {
  lang: AppLanguage
  setLang: (l: AppLanguage) => void
}

export const useLangStore = create<LangStore>()((set) => ({
  lang: 'zh',
  setLang: (lang) => set({ lang })
}))

/** Hook: returns type-safe translate function for current language */
export function useI18n(): { t: Translations; lang: AppLanguage } {
  const lang = useLangStore((s) => s.lang)
  return { t: TRANSLATIONS[lang], lang }
}

/** Imperative getter (outside React) */
export function getT(): Translations {
  return TRANSLATIONS[useLangStore.getState().lang]
}
