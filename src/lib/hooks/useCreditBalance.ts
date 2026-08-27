import { useEffect, useMemo } from 'react'
import { useAsync } from './useAsync'
import { db } from '../db'
import { useAuth } from '../../context/AuthContext'

/** Fired by the data layer whenever CC credits move anywhere. */
export const CREDITS_CHANGED_EVENT = 'cc-credits-changed'

/** Live CC-Credits balance for the signed-in user (Σ ledger).
 *  Refreshes instantly on the credits-changed event + a slow poll to
 *  pick up server-side mints (deals, leads, challenges). */
export function useCreditBalance() {
  const { user } = useAuth()
  const q = useAsync(
    async () => (user ? db.listCreditLedger(user.id) : []),
    [user?.id],
  )

  useEffect(() => {
    if (!user) return
    const onChange = () => q.reload()
    window.addEventListener(CREDITS_CHANGED_EVENT, onChange)
    const iv = setInterval(onChange, 60000)
    return () => {
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChange)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const balance = useMemo(() => (q.data || []).reduce((s, e) => s + e.delta, 0), [q.data])
  return { balance, loading: q.loading, entries: q.data || [], reload: () => { q.reload(); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)) } }
}

/** Month leaderboard: top credit earners across the platform. */
export function useCreditLeaderboard() {
  const { data, loading } = useAsync(async () => {
    const [entries, profiles] = await Promise.all([
      db.listCreditLedger(),
      db.listProfiles(),
    ])
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const sums = new Map<string, number>()
    for (const e of entries) {
      if (e.delta <= 0) continue
      if (new Date(e.created_at).getTime() < monthStart.getTime()) continue
      sums.set(e.user_id, (sums.get(e.user_id) || 0) + e.delta)
    }
    return [...sums.entries()]
      .map(([id, total]) => ({ id, total, name: profiles.find((p) => p.id === id)?.full_name ?? 'Member' }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [])
  return { top: data || [], loading }
}
