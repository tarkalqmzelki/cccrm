import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Avatar } from './ui/Avatar'
import { Bell, Globe } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLocale } from '../context/LocaleContext'
import { db } from '../lib/db'
import { NotificationPreferences } from './NotificationPreferences'

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth()
  const { push } = useToast()
  const { locale, locales, setLocale, t } = useLocale()
  const [full_name, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [avatar_url, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name)
      setEmail(user.email)
      setPhone(user.phone)
      setAddress(user.address)
      setAvatarUrl(user.avatar_url)
    }
  }, [open, user])

  if (!user) return null

  async function save() {
    if (!user) return
    if (!full_name.trim()) { push({ tone: 'error', title: 'Name is required' }); return }
    setSaving(true)
    try {
      await db.updateProfile(user.id, { full_name, email, phone, address, avatar_url })
      await refresh()
      push({ tone: 'success', title: 'Profile updated' })
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Profile settings"
      desc="Update your personal information and notification preferences."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={full_name || '?'} color={user.avatar_color} url={avatar_url} size={56} />
          <Field label="Photo URL" hint="Paste an image URL">
            <Input value={avatar_url} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        <Field label="Full name" required>
          <Input value={full_name} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@calistaconcept.eu" />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1122334" />
        </Field>
        <Field label="Address">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via Roma 12, Milano" rows={2} />
        </Field>

        <div className="border-t border-line pt-5">
          <div className="mb-3 flex items-center gap-2">
            <Bell size={15} strokeWidth={1.75} className="text-ink-600" />
            <h3 className="text-sm font-semibold">{t('profile.notifications')}</h3>
          </div>
          <NotificationPreferences />
        </div>

        {/* Language switcher — animated pills with the dimming overlay */}
        <div className="border-t border-line pt-5">
          <div className="mb-3 flex items-center gap-2">
            <Globe size={15} strokeWidth={1.75} className="text-ink-600" />
            <h3 className="text-sm font-semibold">{t('profile.language')}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <LangPill
              label="EN"
              title="English"
              active={locale === 'en'}
              onClick={() => setLocale('en')}
            />
            {locales.map((l) => (
              <LangPill
                key={l.id}
                label={l.locale.toUpperCase()}
                title={l.label || l.locale}
                active={locale === l.locale}
                onClick={() => setLocale(l.locale)}
              />
            ))}
          </div>
          <p className="mt-2 text-2xs text-ink-400">Applies only to your account — other users keep their own language.</p>
        </div>
      </div>
    </Modal>
  )
}

/* Language pill — same animated pattern as the invoice/contract
   language pills. */
function LangPill({ label, title, active, onClick }: { label: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      whileTap={{ scale: 0.94 }}
      animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={active ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] } : { duration: 0.15 }}
      className={`relative rounded-full px-3.5 py-1.5 text-2xs font-semibold tracking-wide transition-colors ${
        active
          ? 'text-info ring-2 ring-info/50 bg-infoBg'
          : 'text-ink-500 border border-line bg-surface hover:bg-ink-50 hover:text-ink'
      }`}
    >
      {label}
    </motion.button>
  )
}
