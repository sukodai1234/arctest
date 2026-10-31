import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { vi } from '@/i18n/vi'
import { zh } from '@/i18n/zh'

export type Lang = 'en' | 'vi' | 'zh'

export const LANGUAGES: { id: Lang; label: string; locale: string }[] = [
  { id: 'en', label: 'EN', locale: 'en-US' },
  { id: 'vi', label: 'VI', locale: 'vi-VN' },
  { id: 'zh', label: '中文', locale: 'zh-CN' },
]

const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, vi, zh }
const STORAGE_KEY = 'arcpay-lang'

type Vars = Record<string, string | number>
export type TFunction = (text: string, vars?: Vars) => string

interface I18nContextValue {
  lang: Lang
  locale: string
  setLang: (lang: Lang) => void
  t: TFunction
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'vi' || saved === 'zh') return saved
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('vi')) return 'vi'
  if (nav.startsWith('zh')) return 'zh'
  return 'en'
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next)
    setLangState(next)
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[lang]
    return {
      lang,
      locale: LANGUAGES.find((l) => l.id === lang)?.locale ?? 'en-US',
      setLang,
      // The English source text is the key; a missing translation falls back to English.
      t: (text, vars) => interpolate(dict[text] ?? text, vars),
    }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function useT(): TFunction {
  return useI18n().t
}
