import { supabase } from './supabase'
import { db } from './db'
import type { NotificationKey } from './types'

/**
 * VAPID public key (base64url).  Set in `.env` as `VITE_VAPID_PUBLIC_KEY`.
 * The matching private key lives only in the Supabase Edge Function
 * environment — never bundle it in the client.
 */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  !!VAPID_PUBLIC_KEY

/**
 * Convert a base64url VAPID key into the Uint8Array expected by
 * `PushManager.subscribe({ applicationServerKey })`.
 */
function b64uToUint8Array(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Subscribe the current service worker registration to push and persist
 * the subscription to the user's row in `push_subscriptions`.
 *
 * Returns true if a subscription was created or already existed.
 */
export async function subscribePush(userId: string): Promise<boolean> {
  if (!isPushSupported() || !supabase) return false

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64uToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    })
  }
  const p256dh = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!p256dh || !auth) return false
  await db.addPushSubscription(userId, {
    endpoint: sub.endpoint,
    p256dh: b64uEncode(p256dh as ArrayBuffer),
    auth_key: b64uEncode(auth as ArrayBuffer),
  })
  return true
}

/** Unsubscribe from push on this device and drop the row from the DB. */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported() || !supabase) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    await db.removePushSubscription(sub.endpoint).catch(() => {})
  }
}

/** True if there is an active push subscription on this device. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

/** Request the OS-level notification permission if not already granted. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'default') {
    return await Notification.requestPermission()
  }
  return Notification.permission
}

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Default preference set for a fresh user — every type enabled until
 * they toggle it off.  Used to seed the UI before the DB roundtrip.
 */
export function defaultPreferencesFor(role: 'admin' | 'seller' | 'headhunter'): NotificationKey[] {
  if (role === 'admin') {
    return ['admin_deal_new', 'admin_deal_review', 'admin_lead_new', 'admin_inbox', 'admin_meeting', 'admin_payout_reminder']
  }
  return ['user_inbox', 'user_deal_approved', 'user_lead_status', 'user_payout']
}
