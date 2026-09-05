import { useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Building2, Pencil, Check, X,
  Wallet, Clock, Hash, User as UserIcon, ChevronDown, Network, Unlock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { Dropdown } from '../components/ui/Dropdown'
import { Modal } from '../components/ui/Modal'
import { DealModal } from '../components/DealModal'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import type { Deal, Profile, Payout, Referral, DealStatus } from '../lib/types'
import { STATUS_META } from '../lib/types'
import { eur, eurFull, dateLong } from '../lib/format'

const ALL_STATUSES = Object.keys(STATUS_META) as DealStatus[]

export default function DealDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { push } = useToast()
  const navigate = useNavigate()
  const { data, loading, reload } = useAsync(async () => {
    const [deals, profiles, payouts, referrals] = await Promise.all([db.listDeals(), db.listProfiles(), db.listPayouts(), db.listReferrals()])
    return {
      deal: (deals as Deal[]).find((d) => d.id === id) ?? null,
      profiles: profiles as Profile[],
      payouts: payouts as Payout[],
      referrals: referrals as Referral[],
    }
  }, [id])

  const deal = data?.deal ?? null
  const seller = useMemo(() => (deal ? data?.profiles.find((p) => p.id === deal.seller_id) : undefined), [deal, data])
  const salePayout = useMemo(() => (deal ? data?.payouts.find((p) => p.deal_id === deal.id && p.payout_type === 'sale') : undefined), [deal, data])
  const referralPayout = useMemo(() => (deal ? data?.payouts.find((p) => p.deal_id === deal.id && p.payout_type === 'referral') : undefined), [deal, data])
  const referrer = useMemo(() => {
    if (!deal || !data?.referrals) return undefined
    const ref = data.referrals.find((r) => r.referee_id === deal.seller_id)
    return ref ? data.profiles.find((p) => p.id === ref.referrer_id) : undefined
  }, [deal, data])
  const [editOpen, setEditOpen] = useState(false)
  const [contactsUnlocked, setContactsUnlocked] = useState(false)

  const canEdit = isAdmin || (deal?.status === 'pending_review')
  const canChangeStatus = isAdmin
  const isOwner = user?.id === deal?.seller_id

  async function setStatus(s: DealStatus) {
    if (!deal) return
    await db.updateDeal(deal.id, { status: s })
    push({ tone: 'success', title: 'Status updated', desc: STATUS_META[s].label })
    reload()
  }

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-40 w-full" />
        <div className="mt-5 grid gap-5 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
      </PageContainer>
    )
  }

  if (!deal) {
    return (
      <PageContainer>
        <Card>
          <div className="py-16 text-center">
            <p className="text-sm text-ink-400">This deal could not be found.</p>
            <Link to="/deals" className="mt-3 inline-block text-sm font-medium underline">Back to deals</Link>
          </div>
        </Card>
      </PageContainer>
    )
  }
  const m = STATUS_META[deal.status]

  return (
    <PageContainer>
      <button onClick={() => navigate('/deals')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink transition-colors">
        <ArrowLeft size={15} strokeWidth={1.75} /> Deals
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink">
            <Building2 size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{deal.company || 'Untitled deal'}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={m.tone} dot>{m.label}</Badge>
              <span className="text-2xs text-ink-400">Submitted {dateLong(deal.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {canChangeStatus && (
            <div className="w-full sm:w-auto">
              <Dropdown
                width={200}
                trigger={
                  <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line px-3 h-10 text-sm font-medium hover:bg-ink-50 transition-colors sm:w-auto">
                    Set status <ChevronDown size={14} strokeWidth={1.75} className="text-ink-400" />
                  </div>
                }
                items={ALL_STATUSES.map((s) => ({
                  label: STATUS_META[s].label,
                  onClick: () => setStatus(s),
                  disabled: deal.status === s,
                }))}
              />
            </div>
          )}
          {canChangeStatus && deal.status === 'pending_review' && (
            <>
              <Button variant="secondary" className="flex-1 sm:flex-none" icon={<X size={15} strokeWidth={1.75} />} onClick={() => setStatus('rejected')}>Reject</Button>
              <Button className="flex-1 sm:flex-none" icon={<Check size={15} strokeWidth={1.75} />} onClick={() => setStatus('approved')}>Approve</Button>
            </>
          )}
          {canChangeStatus && (deal.status === 'approved' || deal.status === 'warm_call' || deal.status === 'to_be_finished' || deal.status === 'unfinished' || deal.status === 'cold_call') && (
            <Button variant="primary" className="flex-1 sm:flex-none" icon={<Check size={15} strokeWidth={1.75} />} onClick={() => setStatus('closed')}>Close sale</Button>
          )}
          {canEdit && (
            <Button variant="secondary" className="flex-1 sm:flex-none" icon={<Pencil size={15} strokeWidth={1.75} />} onClick={() => setEditOpen(true)}>Edit</Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Deal value" desc="Gross volume, collections, and commission" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric label="Gross value" value={eur(deal.gross_value)} />
              <Metric label="Collected" value={eur(deal.collected_amount || 0)} />
              <Metric label="Commission" value={`${deal.commission_pct}%`} />
            </div>
            {/* Progress bar for collections */}
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-2xs text-ink-400">
                <span>Collected from client</span>
                <span className="num">{eur(deal.collected_amount || 0)} / {eur(deal.gross_value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full bg-ink transition-all duration-300"
                  style={{ width: `${deal.gross_value > 0 ? Math.min((deal.collected_amount / deal.gross_value) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Client & contact" desc="Details for cold / warm calls" action={
              isAdmin && deal.opportunity_id ? <AdminUnlockButton onUnlock={() => setContactsUnlocked(true)} /> : undefined
            } />
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <Info icon={<Building2 size={15} strokeWidth={1.75} />} label="Company" value={deal.company || '—'} />
              <Info icon={<UserIcon size={15} strokeWidth={1.75} />} label="Contact" value={deal.opportunity_id && !contactsUnlocked && !isOwner ? blurText(deal.contact_name) : (deal.contact_name || '—')} />
              <Info icon={<Mail size={15} strokeWidth={1.75} />} label="Email" value={deal.opportunity_id && !contactsUnlocked && !isOwner ? blurText(deal.email) : (deal.email || '—')} href={!contactsUnlocked && !isOwner ? undefined : `mailto:${deal.email}`} />
              <Info icon={<Phone size={15} strokeWidth={1.75} />} label="Phone" value={deal.opportunity_id && !contactsUnlocked && !isOwner ? blurText(deal.phone) : (deal.phone || '—')} href={!contactsUnlocked && !isOwner ? undefined : `tel:${deal.phone}`} />
              <Info icon={<Globe size={15} strokeWidth={1.75} />} label="Website" value={deal.website || '—'} href={deal.website ? `https://${deal.website}` : undefined} />
              <Info icon={<MapPin size={15} strokeWidth={1.75} />} label="Meeting place" value={deal.meeting_place || '—'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" desc="Internal context, next steps" />
            {deal.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{deal.notes}</p>
            ) : (
              <p className="text-sm text-ink-400">No notes added yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Owner" />
            {seller && (
              <div className="flex items-center gap-3">
                <Avatar name={seller.full_name} color={seller.avatar_color} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{seller.full_name}</p>
                  <p className="text-2xs text-ink-400 capitalize">{seller.role} · {seller.level}</p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <div className="space-y-3 text-sm">
              <Timeline icon={<Clock size={14} strokeWidth={1.75} />} label="Submitted" value={dateLong(deal.created_at)} />
              {deal.closed_at && <Timeline icon={<Check size={14} strokeWidth={1.75} />} label="Closed" value={dateLong(deal.closed_at)} />}
              <Timeline icon={<Hash size={14} strokeWidth={1.75} />} label="Deal ID" value={deal.id.slice(0, 8).toUpperCase()} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Seller payout" action={<Wallet size={16} strokeWidth={1.75} className="text-ink-300" />} />
            {salePayout ? (() => {
              const total = salePayout.amount
              const collectable = deal.gross_value > 0
                ? Math.min(Math.round(total * ((deal.collected_amount || 0) / deal.gross_value)), total)
                : 0
              const paid = salePayout.paid_amount || 0
              const remaining = collectable - paid
              return (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-2xs text-ink-400">
                      <span>Paid to seller</span>
                      <span className="num">{eurFull(paid)} / {eurFull(collectable)} / {eurFull(total)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-pos transition-all duration-300" style={{ width: `${total > 0 ? Math.min((paid / total) * 100, 100) : 0}%` }} />
                    </div>
                    <p className="mt-1 text-2xs text-ink-400">
                      {paid >= total ? 'Fully paid' : remaining > 0 ? `${eurFull(remaining)} collectable now` : 'Waiting for client payment'}
                    </p>
                  </div>
                  <div className="space-y-2 border-t border-line pt-3">
                    <Row label="Total payout" value={eurFull(total)} />
                    <Row label="Collectable now" value={eurFull(collectable)} />
                    <Row label="Paid" value={eurFull(paid)} />
                    <Row label="Status" value={<Badge tone={salePayout.status === 'paid' ? 'pos' : 'warn'} dot>{salePayout.status}</Badge>} />
                  </div>
                  {isAdmin && salePayout.status !== 'paid' && collectable > paid && (
                    <Button
                      size="sm"
                      block
                      icon={<Check size={14} strokeWidth={1.75} />}
                      onClick={async () => {
                        try {
                          const payAmount = collectable - paid
                          await db.recordPayoutPayment(salePayout.id, payAmount)
                          push({ tone: 'success', title: 'Payment recorded', desc: `${eurFull(payAmount)} paid to seller` })
                          reload()
                        } catch (e: any) {
                          push({ tone: 'error', title: 'Could not record payment', desc: e?.message })
                        }
                      }}
                    >
                      Pay seller {eurFull(collectable - paid)}
                    </Button>
                  )}
                </div>
              )
            })() : (
              <p className="text-sm text-ink-400">No payout yet — created automatically on approval.</p>
            )}
          </Card>

          {referralPayout && referrer && (
            <Card>
              <CardHeader title="Referral payout" action={<Network size={16} strokeWidth={1.75} className="text-ink-300" />} />
              <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 p-3">
                <Avatar name={referrer.full_name} color={referrer.avatar_color} url={referrer.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{referrer.full_name}</p>
                  <p className="text-2xs text-ink-400">Earned referral commission</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Row label="Referral payout" value={eurFull(referralPayout.amount)} />
                <Row label="Paid" value={eurFull(referralPayout.paid_amount || 0)} />
                <Row label="Status" value={<Badge tone={referralPayout.status === 'paid' ? 'pos' : 'warn'} dot>{referralPayout.status}</Badge>} />
              </div>
            </Card>
          )}
        </div>
      </div>

      <DealModal open={editOpen} onClose={() => setEditOpen(false)} deal={deal} isAdmin={isAdmin} onSaved={() => { setEditOpen(false); reload() }} title="Edit deal" />
    </PageContainer>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-ink-400">{label}</p>
      <p className={`mt-1 num text-lg font-semibold ${highlight ? 'text-ink' : 'text-ink-700'}`}>{value}</p>
    </div>
  )
}
function Info({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-ink-300">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xs text-ink-400">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">{value}</a>
        ) : (
          <p className="truncate text-sm font-medium text-ink">{value}</p>
        )}
      </div>
    </div>
  )
}
function Timeline({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-ink-300">{icon}</span>
      <span className="text-ink-400">{label}</span>
      <span className="ml-auto num text-ink-600">{value}</span>
    </div>
  )
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-2xs text-ink-400">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function blurText(text: string) {
  if (!text) return '—'
  if (text.length <= 2) return '••'
  return text.slice(0, 2) + '••••' + text.slice(-2)
}

function AdminUnlockButton({ onUnlock }: { onUnlock: () => void }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)

  async function verify() {
    setVerifying(true)
    try {
      // Admin simply confirms — no UID needed anymore
      onUnlock(); setOpen(false)
      push({ tone: 'success', title: 'Admin unlock' })
    } finally { setVerifying(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-2xs font-medium text-ink-500 hover:bg-ink-50 transition-colors">
        <Unlock size={12} strokeWidth={1.75} /> Unlock
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Admin unlock" desc="Confirm to reveal contact details." size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={verify} disabled={verifying}>Unlock</Button></>}
      >
        <p className="text-sm text-ink-500">Are you sure you want to reveal the contact details for this deal?</p>
      </Modal>
    </>
  )
}
