import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Network, ChevronRight, Clock, Check, Plus, FileText,
  Phone, Mail, Building2, DollarSign, Calendar, User as UserIcon, Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Input, Textarea, Select, Field } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { Dropdown } from '../components/ui/Dropdown'
import { Modal } from '../components/ui/Modal'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import { ContactCard } from '../components/ContactCard'
import type { Opportunity, Company, Profile, Activity, Task, ServiceItem, OppStatus } from '../lib/types'
import { OPP_STATUS_META, OPP_STATUSES } from '../lib/types'
import { eur, dateLong, dateShort } from '../lib/format'

type Tab = 'overview' | 'notes'

export default function OpportunityDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [noteText, setNoteText] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)

  const { data, loading, reload } = useAsync(async () => {
    const opp = await db.getOpportunity(id!)
    if (!opp) return null
    const [company, services, profiles, oppContacts, oppNotes] = await Promise.all([
      db.getCompany(opp.company_id),
      db.listServices(),
      db.listProfiles(),
      db.listOppContacts(id!),
      db.listOppNotes(id!),
    ])
    return {
      opp, company, services: services as ServiceItem[],
      profiles: profiles as Profile[], oppContacts, oppNotes,
    }
  }, [id])

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])
  const serviceMap = useMemo(() => {
    const m: Record<string, ServiceItem> = {}
    data?.services.forEach((s) => (m[s.id] = s))
    return m
  }, [data])

  if (loading) return <PageContainer><Skeleton className="h-40 w-full" /></PageContainer>
  if (!data) return <PageContainer><Card><p className="py-12 text-center text-sm text-ink-400">Opportunity not found.</p></Card></PageContainer>

  const { opp, company, oppContacts, oppNotes } = data
  const owner = profileMap[opp.owner_id]
  const service = serviceMap[opp.service_id]
  const m = OPP_STATUS_META[opp.status]
  const isOwner = user?.id === opp.owner_id
  const isAdmin = user?.role === 'admin'
  const canEdit = isOwner || isAdmin

  async function setStatus(s: OppStatus) {
    try {
      await db.updateOpp(opp.id, { status: s })
      push({ tone: 'success', title: 'Status updated', desc: OPP_STATUS_META[s].label })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function addNote() {
    if (!noteText.trim() || !user) return
    try {
      await db.createOppNote(opp.id, user.id, noteText)
      setNoteText('')
      push({ tone: 'success', title: 'Note added' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add note', desc: e?.message })
    }
  }

  async function convertToDeal(grossValue: number) {
    try {
      // Auto-calculate commission from seller's level or custom commission
      const deal = await db.convertOppToDeal(opp.id, opp.owner_id, grossValue)
      push({ tone: 'success', title: 'Converted to deal', desc: 'Commission auto-set from seller level.' })
      setConvertOpen(false)
      navigate(`/deals/${deal.id}`)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not convert', desc: e?.message })
    }
  }

  return (
    <PageContainer>
      <button onClick={() => navigate(`/leads/${opp.company_id}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink transition-colors">
        <ArrowLeft size={15} strokeWidth={1.75} /> {company?.name || 'Company'}
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-50 text-ink">
            <Network size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{opp.title || service?.name || 'Opportunity'}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={m.tone} dot>{m.label}</Badge>
              <span className="text-2xs text-ink-400">{service?.name}</span>
              {opp.converted_deal_id && <Badge tone="pos">Deal linked</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(canEdit) && !opp.converted_deal_id && (
            <Button icon={<Zap size={15} strokeWidth={1.75} />} onClick={() => setConvertOpen(true)}>Convert to Deal</Button>
          )}
          {(canEdit) && (
            <Dropdown
              width={200}
              trigger={
                <div className="flex items-center gap-1.5 rounded-xl border border-line px-3 h-10 text-sm font-medium hover:bg-ink-50 transition-colors">
                  Set status <ChevronRight size={14} strokeWidth={1.75} className="rotate-90 text-ink-400" />
                </div>
              }
              items={OPP_STATUSES.map((s) => ({
                label: OPP_STATUS_META[s].label,
                onClick: () => setStatus(s),
                disabled: opp.status === s,
              }))}
            />
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><p className="text-2xs text-ink-400">Owner</p><p className="mt-1 text-sm font-medium">{owner?.full_name || '—'}</p></Card>
        <Card><p className="text-2xs text-ink-400">Est. Revenue</p><p className="mt-1 num text-sm font-medium">{eur(opp.est_revenue)}</p></Card>
        <Card><p className="text-2xs text-ink-400">Priority</p><p className="mt-1 text-sm font-medium capitalize">{opp.priority}</p></Card>
        <Card><p className="text-2xs text-ink-400">Next follow-up</p><p className="mt-1 text-sm font-medium">{opp.next_follow_up ? dateShort(opp.next_follow_up) : '—'}</p></Card>
      </div>

      {/* Tabs */}
      <div className="mt-5 mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 overflow-x-auto">
        {([
          ['overview', 'Overview'],
          ['notes', 'Notes'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${tab === key ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            {tab === key && <motion.span layoutId="opp-tab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title="Details" />
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-2xs text-ink-400">Service</span><span className="text-sm font-medium">{service?.name}</span></div>
                <div className="flex justify-between"><span className="text-2xs text-ink-400">Company</span><span className="text-sm font-medium">{company?.name}</span></div>
                <div className="flex justify-between"><span className="text-2xs text-ink-400">Offer value</span><span className="text-sm font-medium num">{eur(opp.offer_value || opp.est_revenue || 0)}</span></div>
                <div className="flex justify-between"><span className="text-2xs text-ink-400">Created</span><span className="text-sm">{dateLong(opp.created_at)}</span></div>
                {opp.offer_description && (
                  <div className="pt-2 border-t border-line">
                    <p className="text-2xs text-ink-400 mb-1">Offer description</p>
                    <p className="text-sm text-ink-600">{opp.offer_description}</p>
                  </div>
                )}
                {opp.notes && <div className="pt-2 border-t border-line"><p className="text-2xs text-ink-400 mb-1">Notes</p><p className="text-sm text-ink-600">{opp.notes}</p></div>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Contacts" desc="People involved in this opportunity" />
              {oppContacts.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">No contacts linked yet.</p>
              ) : (
                <div className="space-y-2">
                  {oppContacts.map((c) => <ContactCard key={c.id} contact={c} ownerId={opp.company_id} canUnlock={true} />)}
                </div>
              )}
            </Card>
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader title="Owner" />
              {owner && (
                <div className="flex items-center gap-3">
                  <Avatar name={owner.full_name} color={owner.avatar_color} url={owner.avatar_url} size={40} />
                  <div><p className="text-sm font-medium">{owner.full_name}</p><p className="text-2xs text-ink-400 capitalize">{owner.role} · {owner.level}</p></div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <Card>
          <CardHeader title="Notes" desc="Private to this offer" />
          <div className="mb-4 flex gap-2">
            <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" rows={2} className="flex-1" />
            <Button onClick={addNote} disabled={!noteText.trim()}>Post</Button>
          </div>
          {oppNotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {oppNotes.map((n) => {
                const author = profileMap[n.author_id || '']
                return (
                  <div key={n.id} className="flex gap-3 rounded-xl border border-line p-3">
                    <Avatar name={author?.full_name || '?'} color={author?.avatar_color} url={author?.avatar_url} size={32} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{author?.full_name || 'Unknown'}</span>
                        <span className="text-2xs text-ink-400">{dateShort(n.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink-600">{n.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} onConvert={convertToDeal} estRevenue={opp.offer_value || opp.est_revenue} />
    </PageContainer>
  )
}

function ConvertModal({ open, onClose, onConvert, estRevenue }: { open: boolean; onClose: () => void; onConvert: (gross: number) => void; estRevenue: number }) {
  const [gross, setGross] = useState(String(estRevenue || 0))

  return (
    <Modal open={open} onClose={onClose} title="Convert to Deal" desc="Create a deal from this offer. Commission is auto-calculated from the seller's level or admin-set custom rate."
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Zap size={15} strokeWidth={1.75} />} onClick={() => onConvert(Number(gross))}>Convert</Button></>}
    >
      <div className="space-y-4">
        <Field label="Gross value (€)" required>
          <Input type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} />
        </Field>
        <div className="rounded-xl bg-ink-50 p-3">
          <p className="text-2xs text-ink-400">Commission</p>
          <p className="mt-1 text-sm font-medium">Auto-calculated from seller level</p>
          <p className="mt-0.5 text-2xs text-ink-400">The DB trigger computes the correct rate based on the seller's current revenue level (L1=10%, L2=15%, L3=20%) or any custom commission set by the admin.</p>
        </div>
      </div>
    </Modal>
  )
}
