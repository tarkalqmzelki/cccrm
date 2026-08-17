import { Bell, BellOff, Smartphone } from 'lucide-react'
import { useNotifications } from '../context/NotificationsContext'
import { useAuth } from '../context/AuthContext'
import { NOTIFICATION_KEYS } from '../lib/types'
import type { NotificationKey } from '../lib/types'
import { Switch } from './ui/Switch'

/**
 * User-facing notification preferences.  Shown inside the Profile modal
 * for sellers / headhunters (the `user_*` set) and inside the admin
 * Settings tab for admins (the `admin_*` set, with master push toggle).
 */
export function NotificationPreferences() {
  const { user } = useAuth()
  const { supported, permission, subscribed, preferences, togglePreference, enablePush, disablePush } = useNotifications()
  if (!user) return null

  const role: 'admin' | 'user' = user.role === 'admin' ? 'admin' : 'user'
  const keys = NOTIFICATION_KEYS.filter((k) => k.role === role)
  const enabledSet = new Set<NotificationKey>(
    (preferences ?? [])
      .filter((p) => p.enabled)
      .map((p) => p.key as NotificationKey),
  )

  return (
    <div className="space-y-4">
      {/* Push subscription control — only on capable browsers */}
      {supported && (
        <div className="rounded-xl border border-line bg-ink-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-surface p-1.5 shadow-sm ring-1 ring-line">
                <Smartphone size={16} strokeWidth={1.75} className="text-ink-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Push notifications on this device</p>
                <p className="mt-0.5 text-2xs text-ink-400">
                  {permission === 'granted'
                    ? subscribed
                      ? 'Active — alerts will arrive even when the app is closed.'
                      : 'Permission granted. Turn on to start receiving alerts.'
                    : permission === 'denied'
                      ? 'Blocked in this browser. Enable notifications in site settings to subscribe.'
                      : 'Ask for permission and subscribe this device.'}
                </p>
              </div>
            </div>
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
          </div>
        </div>
      )}

      {/* Per-type toggles */}
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
