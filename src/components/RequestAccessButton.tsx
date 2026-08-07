import { useState } from 'react'
import { Lock, MessageSquare, ShieldCheck, Check, Clock } from 'lucide-react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Textarea, Field } from './ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'

export function RequestAccessButton({
  ownerId,
  ownerName,
  opportunityId,
  companyId,
  onGranted,
}: {
  ownerId: string
  ownerName: string
  opportunityId?: string
  companyId?: string
  onGranted?: () => void
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [granted, setGranted] = useState(false)
  const [alreadyRequested, setAlreadyRequested] = useState(false)

  const isAdmin = user?.role === 'admin'

  async function checkExisting() {
    if (!user) return
    try {
      const requests = await db.listAccessRequests(user.id)
      const now = Date.now()
      const dayAgo = now - 24 * 60 * 60 * 1000
      const hasPending = requests.some((r) => {
        if (r.requester_id !== user.id || r.status !== 'pending') return false
        if (new Date(r.created_at).getTime() < dayAgo) return false
        // Same opportunity or same company
        if (opportunityId && r.opportunity_id === opportunityId) return true
        if (companyId && r.company_id === companyId && !r.opportunity_id) return true
        return false
      })
      setAlreadyRequested(hasPending)
    } catch { /* ignore */ }
  }

  async function adminGrant() {
    if (!isAdmin || !user) return
    try {
      await db.createAccessRequest({
        requester_id: user.id,
        owner_id: ownerId,
        opportunity_id: opportunityId || null,
        company_id: companyId || null,
        status: 'approved',
        message: 'Admin granted access',
      })
      setGranted(true)
      push({ tone: 'success', title: 'Admin access granted' })
      onGranted?.()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not grant', desc: e?.message })
    }
  }

  async function sendRequest() {
    if (!user) return
    setSending(true)
    try {
      await db.createAccessRequest({
        requester_id: user.id,
        owner_id: ownerId,
        opportunity_id: opportunityId || null,
        company_id: companyId || null,
        status: 'pending',
        message,
      })
      push({ tone: 'success', title: 'Request sent', desc: `${ownerName} will be notified in their inbox.` })
      setAlreadyRequested(true)
      setOpen(false)
      setMessage('')
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send request', desc: e?.message })
    } finally {
      setSending(false)
    }
  }

  if (granted) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-pos/30 bg-posBg px-2 py-1 text-2xs font-medium text-pos">
        <Check size={11} strokeWidth={1.75} /> Access granted
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => { checkExisting(); setOpen(true) }}
          className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <Lock size={11} strokeWidth={1.75} /> Request Access
        </button>
        {isAdmin && (
          <button
            onClick={adminGrant}
            className="flex items-center gap-1 rounded-lg border border-ink bg-surface px-2 py-1 text-2xs font-medium text-ink hover:bg-ink-50 transition-colors"
          >
            <ShieldCheck size={11} strokeWidth={1.75} /> Admin
          </button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request access"
        desc={alreadyRequested
          ? `You already have a pending request to ${ownerName}. Please wait 24 hours before requesting again.`
          : `Send a request to ${ownerName}. They'll be notified in their inbox.`}
        size="sm"
        footer={
          alreadyRequested ? (
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={sendRequest} disabled={sending} icon={<MessageSquare size={15} strokeWidth={1.75} />}>
                {sending ? 'Sending…' : 'Send request'}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {alreadyRequested ? (
            <div className="flex items-start gap-2 rounded-xl bg-warnBg border border-warn/20 p-3">
              <Clock size={15} strokeWidth={1.75} className="mt-0.5 text-warn shrink-0" />
              <p className="text-2xs text-warn">You've already sent a request for this lead in the last 24 hours. Please wait for a response before sending another.</p>
            </div>
          ) : (
            <Field label="Message" hint="Optional — explain why you need access">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="I'd like to collaborate on this lead…" rows={3} />
            </Field>
          )}
        </div>
      </Modal>
    </>
  )
}
