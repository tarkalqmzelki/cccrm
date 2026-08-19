import { supabase } from './supabase'
import { db } from './db'
import type { NotificationKey } from './types'

/**
 * VAPID public key (base64url).  Set in `.env` as `VITE_VAPID_PUBLIC_KEY`.
 * The matching private key lives only in the Supabase Edge Function
 * environment — never bundle it in the client.
 */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** The browser is technically capable of Web Push (SW + PushManager). */
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window

/** The deployment has a VAPID public key bundled. If false, the push UI
 *  must explain the missing configuration instead of hiding itself. */
export const isPushConfigured = (): boolean => !!VAPID_PUBLIC_KEY

/** iOS / iPadOS detection (Safari UIWebView-era property still works). */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
}

/** True when running as an installed Home Screen PWA. iOS only allows
 *  the notification prompt + push delivery inside installed PWAs — a
 *  regular Safari tab will never show it. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

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
 * Throws an Error with a human-readable message on failure.
 */
export async function subscribePush(userId: string): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY || !supabase) return false

  // Step 1: ensure a service worker is registered and active.
  let reg: ServiceWorkerRegistration
  try {
    reg = await navigator.serviceWorker.ready
  } catch (e: any) {
    throw new Error(`Service worker not active: ${e?.message ?? e}. Try reloading the page.`)
  }
  if (!reg) {
    throw new Error('Service worker registration is missing. Reload the page and try again.')
  }

  // Step 2: ensure OS-level permission (iOS shows the prompt here, in the PWA).
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      throw new Error('Notification permission was not granted. Enable it in your browser/site settings.')
    }
  } else if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked for this site. Enable them in your browser settings → Site settings → Notifications, then reload.')
  }

  // Step 3: validate VAPID key (must be exactly 65 bytes when decoded).
  let appKey: Uint8Array
  try {
    appKey = b64uToUint8Array(VAPID_PUBLIC_KEY)
  } catch {
    throw new Error('VAPID public key is malformed. Check VITE_VAPID_PUBLIC_KEY in your deployment env.')
  }
  if (appKey.length !== 65) {
    throw new Error(`VAPID public key is ${appKey.length} bytes — must be exactly 65 (uncompressed P-256). Regenerate with: npx web-push generate-vapid-keys`)
  }

  // Step 4: subscribe to the push service. This is the call that fails
  // with "Registration failed - push service error" when something is
  // wrong with the VAPID key, network to the push service, or browser
  // privacy settings.
  let sub: PushSubscription
  try {
    let existing = await reg.pushManager.getSubscription()
    if (existing) {
      sub = existing
    } else {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey as unknown as BufferSource,
      })
    }
  } catch (e: any) {
    // Translate the obscure DOMException names into actionable advice.
    const name = e?.name ?? ''
    const msg = e?.message ?? String(e)
    if (name === 'NotAllowedError') {
      throw new Error('Permission denied by the push service. Enable notifications for this site in your browser settings.')
    }
    if (name === 'AbortError' || /push service/i.test(msg)) {
      throw new Error(
        `Browser push service unreachable (${name || 'AbortError'}: ${msg}). ` +
        'Most common causes: (a) network blocking the browser push service (FCM for Chrome, APNs for Safari), ' +
        '(b) third-party cookies/storage blocked for this site, (c) antivirus blocking the connection.',
      )
    }
    if (name === 'InvalidCharacterError' || /applicationServerKey/i.test(msg)) {
      throw new Error(`Invalid VAPID key: ${msg}. Regenerate with: npx web-push generate-vapid-keys`)
    }
    if (name === 'InvalidStateError') {
      // Already subscribed — fall through and read the subscription
      sub = await reg.pushManager.getSubscription() as PushSubscription
      if (!sub) throw e
    } else {
      throw new Error(`Push subscription failed (${name || 'Error'}: ${msg})`)
    }
  }

  // Step 5: persist the FULL subscription object as JSONB (the new
  // format expected by the web-push library).  Also keep the legacy
  // per-field columns populated so older code paths keep working.
  const p256dh = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!p256dh || !auth) {
    throw new Error('Push subscription is missing keys (p256dh/auth). Try unsubscribing and re-enabling.')
  }
  const fullSub = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string }, expirationTime: number | null }
  await db.addPushSubscription(userId, {
    endpoint: sub.endpoint,
    p256dh: b64uEncode(p256dh as ArrayBuffer),
    auth_key: b64uEncode(auth as ArrayBuffer),
    subscription: fullSub,
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
    return ['admin_deal_new', 'admin_deal_review', 'admin_lead_new', 'admin_inbox', 'admin_meeting', 'admin_payout_reminder', 'user_lead_reminder', 'user_whats_new', 'user_broadcast', 'user_chat']
  }
  return ['user_inbox', 'user_deal_approved', 'user_lead_status', 'user_payout', 'user_lead_reminder', 'user_whats_new', 'user_broadcast', 'user_chat']
}
