/**
 * i18n minimale: dizionari piatti per modulo, lingua in localStorage, interpolazione {var}.
 * Uso: const t = useT(); t('status.confermata'); t('common.n_of_m', { n: 1, m: 3 })
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from '../domain/types'
import { core } from './modules/core'
import { map } from './modules/map'
import { report } from './modules/report'
import { venue } from './modules/venue'
import { company } from './modules/company'
import { moderation } from './modules/moderation'
import { legal } from './modules/legal'
import { auth } from './modules/auth'
import { transparency } from './modules/transparency'
import { manage } from './modules/manage'
import { nas } from './modules/nas'

type Dict = Record<string, string>
type Module = { it: Readonly<Dict>; en: Readonly<Dict> }

const modules: Module[] = [core, map, report, venue, company, moderation, legal, auth, transparency, manage, nas]

export const dictionaries: Record<Lang, Dict> = {
  it: Object.assign({}, ...modules.map((m) => m.it)),
  en: Object.assign({}, ...modules.map((m) => m.en)),
}

const LANG_KEY = 'mappa-igiene-lang'

function detectLang(): Lang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY)
    if (saved === 'it' || saved === 'en') return saved
  } catch {
    /* storage non disponibile */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'it'
  return nav.toLowerCase().startsWith('it') ? 'it' : 'en'
}

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (typeof window === 'undefined' ? 'it' : detectLang()))

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(LANG_KEY, l)
    } catch {
      /* ignora */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = dictionaries[lang][key] ?? dictionaries.it[key] ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>')
  return ctx
}

export function useT() {
  return useLang().t
}

/** Traduzione fuori da React (es. messaggi di errore nello store). */
export function translate(lang: Lang, key: string): string {
  return dictionaries[lang][key] ?? dictionaries.it[key] ?? key
}
