import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { ENGLISH_LOCALE, type PlatformLocale } from '../lib/platformLocales'

interface LocaleState {
  /** Current locale code ('en', 'bg', …). */
  locale: string
  /** All available locales (excluding English, which is built-in). */
  locales: PlatformLocale[]
  /** Translate a UI key — falls back to English, then the key itself. */
  t: (key: string) => string
  /** Switch the user's locale — persists to their profile row.
   *  Shows the dimming "Changing Locale" overlay during the swap. */
  setLocale: (locale: string) => Promise<void>
}

const Ctx = createContext<LocaleState | null>(null)

/** Cache of locale → strings map, shared across mounts. */
const localeCache = new Map<string, Record<string, string>>()

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth()
  const [locale, setLocaleState] = useState('en')
  const [locales, setLocales] = useState<PlatformLocale[]>([])
  const [strings, setStrings] = useState<Record<string, string>>(ENGLISH_LOCALE)
  const [switching, setSwitching] = useState(false)

  // Load all available locales once
  useEffect(() => {
    db.listPlatformLocales().then(setLocales).catch(() => {})
  }, [])

  // Apply the user's saved locale on login
  useEffect(() => {
    const target = (user as any)?.locale || 'en'
    if (target === 'en') {
      setLocaleState('en')
      setStrings(ENGLISH_LOCALE)
      return
    }
    applyLocale(target)
  }, [user?.id, (user as any)?.locale])

  function applyLocale(code: string) {
    setLocaleState(code)
    if (code === 'en') {
      setStrings(ENGLISH_LOCALE)
      return
    }
    const cached = localeCache.get(code)
    if (cached) { setStrings(cached); return }
    db.listPlatformLocales().then((list) => {
      const found = list.find((l) => l.locale === code)
      const merged = { ...ENGLISH_LOCALE, ...(found?.strings ?? {}) }
      localeCache.set(code, merged)
      setStrings(merged)
    }).catch(() => setStrings(ENGLISH_LOCALE))
  }

  const t = useCallback((key: string) => strings[key] ?? ENGLISH_LOCALE[key] ?? key, [strings])

  const setLocale = useCallback(async (code: string) => {
    // 1. Show the dimming overlay
    setSwitching(true)
    // 2. Swap the strings
    applyLocale(code)
    // 3. Persist to the user's profile (their own preference only)
    if (user && supabase) {
      try {
        await supabase.from('profiles').update({ locale: code }).eq('id', user.id)
        await refresh()
      } catch { /* non-fatal — UI already switched */ }
    } else {
      // Not signed in (login page) — remember locally
      try { localStorage.setItem('cccrm-locale', code) } catch { /* ignore */ }
    }
    // 4. Hold the overlay ~2s so the user sees the transition, then
    //    fade out.  Total perceived effect ≈ 2.5s (dim + fade).
    setTimeout(() => setSwitching(false), 2000)
  }, [user, refresh])

  return (
    <Ctx.Provider value={{ locale, locales, t, setLocale }}>
      {children}
      {/* Locale-switch overlay — dims the entire platform with a
          "Changing Locale" message.  Rendered via portal so it sits
          above everything (z-[400]). */}
      {createPortal(
        <AnimatePresence>
          {switching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="fixed inset-0 z-[400] flex items-center justify-center bg-ink-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white"
                />
                <p className="text-sm font-semibold tracking-wide text-white">Changing Locale</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useLocale() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLocale must be inside LocaleProvider')
  return c
}
