import { useState } from 'react'
import { Bell, BellOff, Smartphone, Share, Send } from 'lucide-react'
import { useNotifications } from '../context/NotificationsContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import { isIOS, isStandalone } from '../lib/notifications'
import { NOTIFICATION_KEYS } from '../lib/types'
import type { NotificationKey } from '../lib/types'
import { Switch } from './ui/Switch'

/**
 * User-facing notification preferences.  Shown inside the Profile modal
 * for sellers / headhunters (the `user_*` set) and inside the admin
 * Settings tab for admins (the `admin_*` set).
 *
 * The push card is ALWAYS rendered (never silently hidden) so missing
 * configuration, iOS install requirements, or blocked permission are
 * visible and actionable instead of mysterious.
 */
export function NotificationPreferences() {
  const { user } = useAuth()
  const { push } = useToast()
  const { supported, configured, permission, subscribed, preferences, togglePreference, enablePush, disablePush } = useNotifications()
  const [testing, setTesting] = useState(false)
  if (!user) return null

  const keys = user.role === 'admin'
    ? NOTIFICATION_KEYS
    : NOTIFICATION_KEYS.filter((k) => k.role === 'user' || k.key === 'user_lead_reminder')
  const enabledSet = new Set<NotificationKey>(
    (preferences ?? [])
      .filter((p) => p.enabled)
      .map((p) => p.key as NotificationKey),
  )

  const ios = isIOS()
  const standalone = isStandalone()
  /** iOS only shows the notification prompt inside an installed PWA. */
  const needsInstall = ios && !standalone

  async function sendTest() {
    setTesting(true)
    try {
      await db.sendTestPush(user!.id)
      push({
        tone: 'success',
        title: 'Test notification sent',
        desc: 'It went through the full pipeline — check the phone this device is registered on.',
      })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send test', desc: e?.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- Push status card — always visible ---------- */}
      <div className="rounded-xl border border-line bg-ink-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-surface p-1.5 shadow-sm ring-1 ring-line">
            <Smartphone size={16} strokeWidth={1.75} className="text-ink-700" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Push notifications on this device</p>

            {/* State: deployment missing VAPID key */}
            {!configured && (
              <p className="mt-1 text-2xs leading-relaxed text-ink-500">
                Not configured on this deployment — the <code className="rounded bg-ink-100 px-1">VITE_VAPID_PUBLIC_KEY</code>{' '}
                environment variable is missing. Add it (and redeploy) to enable push.
              </p>
            )}

            {/* State: browser has no push support at all */}
            {configured && !supported && (
              <p className="mt-1 text-2xs leading-relaxed text-ink-500">
                This browser doesn’t support push notifications. Use a recent version of Chrome, Safari, Edge or Firefox.
              </p>
            )}

            {/* State: iOS needs the app installed to the Home Screen */}
            {configured && supported && needsInstall && (
              <div className="mt-1.5 text-2xs leading-relaxed text-ink-600">
                <p className="flex items-start gap-1.5">
                  <Share size={12} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-500" />
                  <span>
                    On iPhone/iPad, notifications only work in the <strong>installed app</strong> — not in a Safari tab.
                  </span>
                </p>
                <ol className="mt-1.5 ml-[18px] list-decimal space-y-0.5">
                  <li>Tap the <strong>Share</strong> button in Safari</li>
                  <li>Choose <strong>Add to Home Screen</strong></li>
                  <li>Open Calista from the Home Screen, then turn notifications on here</li>
                </ol>
              </div>
            )}

            {/* State: normal states — blocked / off / on */}
            {configured && supported && !needsInstall && (
              <p className="mt-0.5 text-2xs text-ink-400">
                {permission === 'granted'
                  ? subscribed
                    ? 'Active — alerts will arrive even when the app is closed.'
                    : 'Permission granted. Turn on to start receiving alerts.'
                  : permission === 'denied'
                    ? 'Blocked in this browser. Enable notifications for this site in your browser settings, then reload.'
                    : 'Turn on to receive alerts on this device.'}
              </p>
            )}
          </div>

          {/* Action button */}
          {configured && supported && !needsInstall && (
            <button
              type="button"
              onClick={subscribed ? disablePush : enablePush}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
                subscribed
                  ? 'border border-line bg-surface text-ink-600 hover:bg-ink-100'
                  : 'bg-ink text-white hover:bg-ink-800'
              }`}
            >
              {subscribed ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>

        {/* Test button — only when subscribed */}
        {subscribed && (
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <p className="text-2xs text-ink-400">Verify the whole pipeline end-to-end.</p>
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-2xs font-medium text-ink-600 transition-colors hover:bg-ink-100 disabled:opacity-50"
            >
              <Send size={11} strokeWidth={1.75} />
              {testing ? 'Sending…' : 'Send test notification'}
            </button>
          </div>
        )}
      </div>

      {/* ---------- Per-type toggles ---------- */}
      <div className="space-y-1.5">
        {keys.map((k) => {
          const enabled = enabledSet.has(k.key)
          return (
            <div
              key={k.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <div className="flex items-start gap-3">
                {enabled ? (
                  <Bell size={15} strokeWidth={1.75} className="mt-0.5 text-ink-600" />
                ) : (
                  <BellOff size={15} strokeWidth={1.75} className="mt-0.5 text-ink-300" />
                )}
                <div>
                  <p className="text-sm font-medium text-ink">{k.label}</p>
                  <p className="mt-0.5 text-2xs text-ink-400">{k.desc}</p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onChange={(v) => togglePreference(k.key, v)}
                disabled={!preferences}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
