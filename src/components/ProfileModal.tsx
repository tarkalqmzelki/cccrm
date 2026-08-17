import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Avatar } from './ui/Avatar'
import { Bell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import { NotificationPreferences } from './NotificationPreferences'

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth()
  const { push } = useToast()
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
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>
          <NotificationPreferences />
        </div>
      </div>
    </Modal>
  )
}
