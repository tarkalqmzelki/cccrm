import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import {
  isPushSupported,
  isPushConfigured,
  isPushSubscribed,
  requestNotificationPermission,
  subscribePush,
  unsubscribePush,
} from '../lib/notifications'
import type { NotificationKey, NotificationPreference } from '../lib/types'

interface NotificationsState {
  /** Push is supported on this browser/device. */
  supported: boolean
  /** The deployment bundles a VAPID public key (server half configured). */
  configured: boolean
  /** The user has granted OS notification permission. */
  permission: NotificationPermission
  /** This device has an active push subscription saved to the DB. */
  subscribed: boolean
  /** Per-user per-type preferences (null while loading). */
  preferences: NotificationPreference[] | null
  /** Optimistic toggle — flips a preference and persists. */
  togglePreference: (key: NotificationKey, enabled: boolean) => Promise<void>
  /** Ask the user for permission + subscribe this device. */
  enablePush: () => Promise<void>
  /** Unsubscribe this device + remove the row from DB. */
  disablePush: () => Promise<void>
}

const Ctx = createContext<NotificationsState | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )
  const [subscribed, setSubscribed] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreference[] | null>(null)

  const supported = isPushSupported()
  const configured = isPushConfigured()

  /* ---- Load preferences + subscription state on login ---- */
  useEffect(() => {
    if (!user || !supabase) {
      setPreferences(null)
      setSubscribed(false)
      return
    }
    let active = true
    db.listNotificationPreferences(user.id)
      .then((prefs) => active && setPreferences(prefs))
      .catch(() => active && setPreferences([]))
    if (supported) {
      isPushSubscribed().then((s) => active && setSubscribed(s))
    }
    return () => {
      active = false
    }
  }, [user?.id, supported])

  /* ---- Realtime inbox → in-app toast ---- */
  useEffect(() => {
    if (!user || !supabase) return
    const client = supabase
    const ch = client
      .channel('inbox-toasts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as { title: string; body: string; action_url?: string; read: boolean }
          if (m && !m.read) {
            push({ tone: 'info', title: m.title, desc: m.body })
          }
        },
      )
      .subscribe()
    return () => {
      client.removeChannel(ch)
    }
  }, [user?.id, push])

  const togglePreference = useCallback(
    async (key: NotificationKey, enabled: boolean) => {
      if (!user) return
      // Optimistic update
      setPreferences((cur) => {
        const next = [...(cur ?? [])]
        const i = next.findIndex((p) => p.key === key)
        if (i >= 0) next[i] = { ...next[i], enabled }
        else next.push({ user_id: user.id, key, enabled })
        return next
      })
      try {
        await db.setNotificationPreference(user.id, key, enabled)
      } catch (e: any) {
        push({ tone: 'error', title: 'Could not update preference', desc: e?.message })
        // Revert on failure
        setPreferences((cur) => {
          const next = [...(cur ?? [])]
          const i = next.findIndex((p) => p.key === key)
          if (i >= 0) next[i] = { ...next[i], enabled: !enabled }
          return next
        })
      }
    },
    [user?.id, push],
  )

  const enablePush = useCallback(async () => {
    if (!user || !supported || !configured) return
    try {
      // Step 1: OS permission (iOS shows the iOS prompt here, in the PWA).
      const perm = await requestNotificationPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        push({ tone: 'error', title: 'Notifications blocked', desc: 'Enable them in your browser/site settings to receive alerts.' })
        return
      }
      // Step 2: subscribe to the push service + persist to DB.
      const ok = await subscribePush(user.id)
      setSubscribed(ok)
      if (ok) push({ tone: 'success', title: 'Notifications enabled', desc: 'You’ll receive alerts on this device.' })
    } catch (e: any) {
      // Surface the detailed, actionable message from subscribePush.
      const detail = e?.message || 'Could not enable notifications.'
      push({ tone: 'error', title: 'Could not enable notifications', desc: detail })
      console.error('[push] enablePush failed:', e)
    }
  }, [user?.id, supported, configured, push])

  const disablePush = useCallback(async () => {
    if (!supported) return
    try {
      await unsubscribePush()
      setSubscribed(false)
      push({ tone: 'info', title: 'Notifications disabled for this device' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not disable', desc: e?.message })
    }
  }, [supported, push])

  const value = useMemo(
    () => ({ supported, configured, permission, subscribed, preferences, togglePreference, enablePush, disablePush }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supported, configured, permission, subscribed, preferences, user?.id],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotifications() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useNotifications must be inside NotificationsProvider')
  return c
}
