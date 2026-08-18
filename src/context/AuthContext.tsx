import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import type { Profile } from '../lib/types'

interface AuthState {
  user: Profile | null
  loading: boolean
  signIn: (email: string, password: string, remember?: boolean) => Promise<Profile>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadUser(id: string) {
    const p = await db.getProfile(id)
    setUser(p)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (data.session?.user && mounted) {
        await loadUser(data.session.user.id)
      }
      supabase.auth.onAuthStateChange(async (_e, session) => {
        if (session?.user) await loadUser(session.user.id)
        else setUser(null)
      })
      if (mounted) setLoading(false)
    })()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signIn(email: string, password: string, remember = true): Promise<Profile> {
    if (!supabase) throw new Error('Database not configured')
    const e = email.trim().toLowerCase()
    // When "Remember me" is unchecked, persist the session in memory only
    // so closing the PWA / tab clears it (next visit forces a re-login).
    // When checked (default), Supabase stores the session in localStorage
    // and the user stays logged in across launches — what you want for a
    // PWA on a phone you carry with you.
    //
    // Supabase v2 doesn't accept persistSession per-call, so for the
    // "don't remember me" case we drop the localStorage copy right after
    // the session is established; the in-memory session still drives the
    // rest of this tab's lifetime.
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password })
    if (error) throw error
    if (!remember) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            localStorage.removeItem(k)
          }
        }
      } catch { /* private mode / disabled storage — ignore */ }
    }
    const p = await db.getProfile(data.user!.id)
    if (!p) throw new Error('Profile not found')
    if (!p.active) throw new Error('Account is disabled')
    setUser(p)
    return p
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
  }

  async function refresh() {
    if (user) {
      const p = await db.getProfile(user.id)
      if (p) setUser(p)
    }
  }

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be inside AuthProvider')
  return c
}
