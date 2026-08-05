import { useState } from 'react'
import { motion } from 'framer-motion'
import { Phone, Mail, Lock, Unlock, MessageSquare, UserRound, ShieldCheck } from 'lucide-react'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Input, Field } from './ui/Input'
import { Badge } from './ui/Badge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import type { Contact } from '../lib/types'

type UnlockMode = 'owner_uid' | 'assignee' | 'admin'

export function ContactCard({ contact, ownerId, canUnlock }: {
  contact: Contact
  ownerId: string
  canUnlock: boolean
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const [revealed, setRevealed] = useState(false)
  const [unlockMode, setUnlockMode] = useState<UnlockMode | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [assigneeName, setAssigneeName] = useState<string | null>(null)

  const isOwner = user?.id === ownerId
  const isAdmin = user?.role === 'admin'
  const showFull = isOwner || isAdmin || revealed

  function blurName(name: string) {
    if (!name || showFull) return name
    if (name.length <= 2) return '••'
    return name.slice(0, 1) + '••••' + name.slice(-1)
  }
  function blurPhone(phone: string) {
    if (!phone || showFull) return phone
    if (phone.length <= 4) return '••••'
    return phone.slice(0, 3) + '••••••' + phone.slice(-2)
  }
  function blurEmail(email: string) {
    if (!email || showFull) return email
    const [name, domain] = email.split('@')
    if (!domain) return '••••'
    return (name.slice(0, 2) || '') + '••••@' + domain
  }

  async function verify() {
    if (!code.trim()) return
    setVerifying(true)
    try {
      if (unlockMode === 'admin') {
        // Admin bypass — just verify it's the admin's own UID
        if (!isAdmin) { push({ tone: 'error', title: 'Admin only' }); return }
        if (user?.uid && code.toUpperCase().trim() === user.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Admin unlock' })
        } else if (!user?.uid) {
          // If admin has no UID set, just unlock anyway
          setRevealed(true); close()
          push({ tone: 'success', title: 'Admin unlock' })
        } else {
          push({ tone: 'error', title: 'Invalid admin UID' })
        }
      } else if (unlockMode === 'owner_uid') {
        const owner = await db.getProfile(ownerId)
        if (!owner) { push({ tone: 'error', title: 'Owner not found' }); return }
        if (!owner.uid) { push({ tone: 'error', title: 'Owner has no UID', desc: 'Ask the admin to set their UID.' }); return }
        if (code.toUpperCase().trim() === owner.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Contacts unlocked' })
        } else {
          push({ tone: 'error', title: 'Invalid code' })
        }
      } else if (unlockMode === 'assignee') {
        const profiles = await db.listProfiles()
        const match = profiles.find((p) => p.uid && p.uid.toUpperCase() === code.toUpperCase().trim())
        if (match) {
          setRevealed(true); setAssigneeName(match.full_name); close()
          push({ tone: 'success', title: `Verified as ${match.full_name}` })
        } else {
          push({ tone: 'error', title: 'Invalid UID' })
        }
      }
    } catch (e: any) {
      push({ tone: 'error', title: 'Verification failed', desc: e?.message })
    } finally { setVerifying(false) }
  }

  function close() { setUnlockMode(null); setCode('') }

  return (
    <>
      <div className="flex items-start gap-3 rounded-xl border border-line p-3">
        {/* Avatar always blurred for non-owners */}
        <div className={showFull ? '' : 'blur-sm select-none'}>
          <Avatar name={contact.full_name || '?'} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{blurName(contact.full_name) || 'Unnamed'}</p>
          {contact.role && <p className="text-2xs text-ink-400 truncate">{contact.role}</p>}
          <div className="mt-1.5 space-y-0.5">
            {contact.phone && (
              <div className="flex items-center gap-1.5 text-2xs text-ink-500">
                <Phone size={11} strokeWidth={1.75} className="shrink-0" />
                <motion.span key={showFull ? 'shown' : 'blurred'} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="num">
                  {blurPhone(contact.phone)}
                </motion.span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-1.5 text-2xs text-ink-500">
                <Mail size={11} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{blurEmail(contact.email)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {canUnlock && !showFull && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={() => setUnlockMode('owner_uid')}
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-500 hover:bg-ink-50 transition-colors"
            >
              <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                <Lock size={12} strokeWidth={1.75} />
              </motion.span>
              Unlock
            </button>
            <button
              onClick={() => setUnlockMode('assignee')}
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-500 hover:bg-ink-50 transition-colors"
            >
              <MessageSquare size={12} strokeWidth={1.75} />
              Contact Lead
            </button>
            {isAdmin && (
              <button
                onClick={() => setUnlockMode('admin')}
                className="flex items-center gap-1 rounded-lg border border-ink px-2 py-1 text-2xs font-medium text-ink hover:bg-ink-50 transition-colors"
              >
                <ShieldCheck size={12} strokeWidth={1.75} />
                Admin
              </button>
            )}
          </div>
        )}
        {showFull && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge tone="pos"><Unlock size={11} strokeWidth={1.75} /> Unlocked</Badge>
            {assigneeName && <span className="text-2xs text-ink-400">via {assigneeName}</span>}
            {isAdmin && !isOwner && <span className="text-2xs text-ink-400">admin</span>}
          </div>
        )}
      </div>

      {/* Unified unlock modal */}
      <Modal
        open={!!unlockMode}
        onClose={close}
        title={unlockMode === 'admin' ? 'Admin unlock' : unlockMode === 'owner_uid' ? 'Unlock contacts' : 'Contact Lead Assignee'}
        desc={unlockMode === 'admin'
          ? 'Enter your admin UID to bypass and reveal all details.'
          : unlockMode === 'owner_uid'
          ? 'Enter the contact owner\'s UID to reveal details.'
          : 'Enter your own UID to verify you\'re a seller and collaborate.'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={verify} disabled={verifying || !code.trim()} icon={<Unlock size={15} strokeWidth={1.75} />}>
              {verifying ? 'Verifying…' : 'Verify'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label={unlockMode === 'admin' ? 'Your admin UID' : unlockMode === 'owner_uid' ? 'Owner UID' : 'Your UID'}
            required
            hint={unlockMode === 'admin' ? 'Your 6-character admin UID.' : unlockMode === 'owner_uid' ? 'Ask the owner for their 6-character code.' : 'Enter your own 6-character UID.'}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AB12CD"
              maxLength={6}
              className="text-center text-lg tracking-[0.3em] font-mono uppercase"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && verify()}
            />
          </Field>
          {unlockMode === 'assignee' && (
            <div className="flex items-start gap-2 rounded-xl bg-infoBg border border-info/20 p-3">
              <UserRound size={15} strokeWidth={1.75} className="mt-0.5 text-info shrink-0" />
              <p className="text-2xs text-info">Once verified, you'll see the owner's name and contact details for collaboration.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
