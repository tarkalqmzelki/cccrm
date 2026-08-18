import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, X, Sparkles } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationsContext'
import { useToast } from '../context/ToastContext'
import { isIOS, isStandalone } from '../lib/notifications'

/** localStorage key — once the user has answered (yes OR no) the prompt
 *  on this device, we don't show it again. They can still toggle push
 *  manually from Profile → Notifications or Settings → Your preferences. */
const DISMISS_KEY = 'notif_prompt_dismissed_v1'

/**
 * On first sign-in on a new device, pop a platform-style modal that
 * asks the user to enable push notifications.  If they accept, we call
 * the OS-level permission prompt + subscribe via the NotificationsContext.
 * After that the user can manage push on/off from Settings as before.
 *
 * Behaviour rules:
 *  - Only show when push is supported + configured on this deployment.
 *  - Only show when the user is logged in.
 *  - Only show when this device has NO active subscription yet.
 *  - Only show when the user hasn't already dismissed it (localStorage).
 *  - Don't show on iOS unless installed as a PWA (the OS prompt would
 *    fail in a Safari tab — we let the existing NotificationPreferences
 *    card explain the install steps instead).
 *  - Wait a short delay after login so the modal doesn't pop instantly.
 */
export function NotificationPromptModal() {
  const { user } = useAuth()
  const { supported, configured, subscribed, permission, enablePush } = useNotifications()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const ios = isIOS()
  const standalone = isStandalone()
  const needsInstall = ios && !standalone

  useEffect(() => {
    if (!user) {
      setOpen(false)
      return
    }
    if (!supported || !configured) return
    if (needsInstall) return // iOS Safari tab — can't prompt
    if (subscribed) return
    if (permission === 'denied') return // already blocked at OS level

    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch { /* private mode */ }
    if (dismissed) return

    // Wait a beat so the modal doesn't fire mid-page-load.
    const t = setTimeout(() => setOpen(true), 1500)
    return () => clearTimeout(t)
  }, [user?.id, supported, configured, subscribed, permission, needsInstall])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  async function accept() {
    setBusy(true)
    try {
      await enablePush()
      // enablePush already surfaces its own success/error toast via the
      // NotificationsContext; just close the modal and remember we've
      // answered so we don't pester the user again on next launch.
      dismiss()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md glass-strong rounded-t-3xl sm:rounded-3xl shadow-glass overflow-hidden"
          >
            {/* Decorative top accent — platform UI feel */}
            <div className="h-1.5 bg-gradient-to-r from-ink-700 via-ink to-ink-700" />

            <button
              onClick={dismiss}
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface/80 text-ink-400 hover:text-ink-600 hover:bg-surface transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} strokeWidth={1.75} />
            </button>

            <div className="px-6 pt-7 pb-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white shadow-glass">
                  <Bell size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-[0.22em] text-ink-400">Calista Concept</p>
                  <p className="text-sm font-semibold">Enable notifications</p>
                </div>
              </div>

              <h3 className="text-lg font-semibold leading-tight text-ink">
                Stay on top of every update
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                Get push alerts for inbox messages, deal approvals, payouts, lead reminders,
                what's new posts and admin broadcasts — delivered to this device even when
                the app is closed.
              </p>

              <ul className="mt-4 space-y-1.5 text-sm text-ink-600">
                <li className="flex items-start gap-2">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-pos" />
                  Inbox messages &amp; direct messages
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-pos" />
                  Deal approvals &amp; payout confirmations
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-pos" />
                  Lead reminders you schedule
                </li>
                <li className="flex items-start gap-2">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-pos" />
                  What's new posts &amp; admin broadcasts
                </li>
              </ul>

              <p className="mt-3 text-2xs text-ink-400">
                You can always turn notifications off later from Settings → Your preferences.
              </p>
            </div>

            <div className="flex items-center gap-2 border-t border-line bg-surface/60 px-6 py-4">
              <button
                onClick={dismiss}
                disabled={busy}
                className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-50"
              >
                Not now
              </button>
              <button
                onClick={accept}
                disabled={busy}
                className="flex-[1.4] inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
              >
                <Sparkles size={15} strokeWidth={1.75} />
                {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
