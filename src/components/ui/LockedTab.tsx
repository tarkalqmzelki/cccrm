import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, MessageSquare, UserRound } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'
import { Input, Field } from './Input'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { db } from '../../lib/db'

type UnlockMode = 'owner_uid' | 'assignee'

export function LockedTab({
  ownerId,
  ownerName,
  children,
  lockedContent,
}: {
  ownerId: string
  ownerName: string
  children: ReactNode
  lockedContent?: ReactNode
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const [revealed, setRevealed] = useState(false)
  const [unlockMode, setUnlockMode] = useState<UnlockMode | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const isOwner = user?.id === ownerId
  const showFull = isOwner || revealed

  async function verify() {
    if (!code.trim()) return
    setVerifying(true)
    try {
      if (unlockMode === 'owner_uid') {
        const owner = await db.getProfile(ownerId)
        if (!owner?.uid) { push({ tone: 'error', title: 'Owner has no UID', desc: 'Ask the admin to set their UID.' }); return }
        if (code.toUpperCase().trim() === owner.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Unlocked' })
        } else {
          push({ tone: 'error', title: 'Invalid code' })
        }
      } else {
        const profiles = await db.listProfiles()
        const match = profiles.find((p) => p.uid && p.uid.toUpperCase() === code.toUpperCase().trim())
        if (match) {
          setRevealed(true); close()
          push({ tone: 'success', title: `Verified as ${match.full_name}`, desc: 'Content is now visible for collaboration.' })
        } else {
          push({ tone: 'error', title: 'Invalid UID' })
        }
      }
    } catch (e: any) {
      push({ tone: 'error', title: 'Verification failed', desc: e?.message })
    } finally { setVerifying(false) }
  }

  function close() { setUnlockMode(null); setCode('') }

  if (showFull) return <>{children}</>

  return (
    <>
      <div className="relative">
        {/* Blurred preview */}
        <div className="pointer-events-none select-none blur-md opacity-40">
          {lockedContent || children}
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
            <Lock size={28} strokeWidth={1.5} className="text-ink-300" />
          </motion.div>
          <p className="text-sm text-ink-400">This content is private</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Unlock size={14} strokeWidth={1.75} />} onClick={() => setUnlockMode('owner_uid')}>
              Unlock
            </Button>
            <Button size="sm" variant="secondary" icon={<MessageSquare size={14} strokeWidth={1.75} />} onClick={() => setUnlockMode('assignee')}>
              Contact Lead
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={!!unlockMode}
        onClose={close}
        title={unlockMode === 'owner_uid' ? 'Unlock content' : 'Contact Lead Assignee'}
        desc={unlockMode === 'owner_uid'
          ? `Enter the opportunity owner's UID to reveal this content.`
          : 'Enter your own UID to verify you\'re a seller and collaborate.'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={verify} disabled={verifying || !code.trim()} icon={<Unlock size={15} strokeWidth={1.75} />}>
              {verifying ? 'Verifying…' : unlockMode === 'owner_uid' ? 'Unlock' : 'Verify & Collaborate'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label={unlockMode === 'owner_uid' ? 'Owner UID' : 'Your UID'}
            required
            hint={unlockMode === 'owner_uid' ? 'Ask the owner for their 6-character code.' : 'Enter your own 6-character UID.'}
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
              <p className="text-2xs text-info">Once verified, you'll see the owner's name and all content for collaboration.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
