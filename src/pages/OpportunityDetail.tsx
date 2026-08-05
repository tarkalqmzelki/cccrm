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

type Tab = 'overview' | 'activities' | 'tasks' | 'notes'

export default function OpportunityDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { push } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [taskOpen, setTaskOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)

  const { data, loading, reload } = useAsync(async () => {
    const opp = await db.getOpportunity(id!)
    if (!opp) return null
    const [company, services, profiles, activities, tasks, oppContacts, oppNotes] = await Promise.all([
      db.getCompany(opp.company_id),
      db.listServices(),
      db.listProfiles(),
      db.listActivities(id!),
      db.listTasks(id!),
      db.listOppContacts(id!),
      db.listOppNotes(id!),
    ])
    return {
      opp, company, services: services as ServiceItem[],
      profiles: profiles as Profile[], activities, tasks,
      oppContacts, oppNotes,
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

  const { opp, company, activities, tasks, oppContacts, oppNotes } = data
  const owner = profileMap[opp.owner_id]
  const service = serviceMap[opp.service_id]
  const m = OPP_STATUS_META[opp.status]
  const isOwner = user?.id === opp.owner_id

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

  async function convertToDeal(grossValue: number, commissionPct: number) {
    try {
      const deal = await db.convertOppToDeal(opp.id, opp.owner_id, grossValue, commissionPct)
      push({ tone: 'success', title: 'Converted to deal', desc: 'The opportunity is now linked to a deal.' })
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
          {(isAdmin || isOwner) && !opp.converted_deal_id && (
            <Button icon={<Zap size={15} strokeWidth={1.75} />} onClick={() => setConvertOpen(true)}>Convert to Deal</Button>
          )}
          {(isAdmin || isOwner) && (
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
          ['activities', 'Activities'],
          ['tasks', 'Tasks'],
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
                <div className="flex justify-between"><span className="text-2xs text-ink-400">Created</span><span className="text-sm">{dateLong(opp.created_at)}</span></div>
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

      {tab === 'activities' && (
        <Card>
          <CardHeader title="Activity log" desc="Immutable history of all interactions"
            action={<Button size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setActivityOpen(true)}>Log</Button>}
          />
          {activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => {
                const actor = profileMap[a.actor_id || '']
                return (
                  <div key={a.id} className="flex items-start gap-3 border-b border-line pb-3 last:border-0">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-400">
                      <Clock size={13} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-ink-700"><span className="font-medium">{actor?.full_name || 'System'}</span> — {a.title}</p>
                      {a.description && <p className="text-2xs text-ink-400 mt-0.5">{a.description}</p>}
                      <p className="text-2xs text-ink-300 mt-0.5">{dateLong(a.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'tasks' && (
        <Card>
          <CardHeader title="Tasks"
            action={<Button size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setTaskOpen(true)}>Add</Button>}
          />
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <input type="checkbox" checked={t.status === 'done'} onChange={() => db.updateTask(t.id, { status: t.status === 'done' ? 'open' : 'done' }).then(reload)} className="h-4 w-4 rounded border-line" />
                  <div className="flex-1">
                    <p className={`text-sm ${t.status === 'done' ? 'line-through text-ink-300' : 'font-medium'}`}>{t.title}</p>
                    {t.due_date && <p className="text-2xs text-ink-400">Due {dateShort(t.due_date)}</p>}
                  </div>
                  <Badge tone={t.status === 'done' ? 'pos' : 'neutral'}>{t.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <CardHeader title="Opportunity notes" desc="Private to this opportunity" />
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
      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} oppId={opp.id} onSaved={() => { setTaskOpen(false); reload() }} />
      <ActivityModal open={activityOpen} onClose={() => setActivityOpen(false)} oppId={opp.id} companyId={opp.company_id} actorId={user?.id || ''} onSaved={() => { setActivityOpen(false); reload() }} />
      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} onConvert={convertToDeal} estRevenue={opp.est_revenue} />
    </PageContainer>
  )
}

function TaskModal({ open, onClose, oppId, onSaved }: { open: boolean; onClose: () => void; oppId: string; onSaved: () => void }) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { push({ tone: 'error', title: 'Title required' }); return }
    setSaving(true)
    try {
      await db.createTask({ opportunity_id: oppId, title, due_date: dueDate || null })
      push({ tone: 'success', title: 'Task added' })
      setTitle(''); setDueDate('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add task', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add task" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>Add</Button></>}
    >
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up call" /></Field>
        <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function ActivityModal({ open, onClose, oppId, companyId, actorId, onSaved }: { open: boolean; onClose: () => void; oppId: string; companyId: string; actorId: string; onSaved: () => void }) {
  const { push } = useToast()
  const [type, setType] = useState('note')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { push({ tone: 'error', title: 'Title required' }); return }
    setSaving(true)
    try {
      await db.createActivity({ opportunity_id: oppId, company_id: companyId, actor_id: actorId, type: type as any, title, description: desc })
      push({ tone: 'success', title: 'Activity logged' })
      setTitle(''); setDesc('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not log', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log activity" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>Log</Button></>}
    >
      <div className="space-y-4">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="message">Message</option>
            <option value="reminder">Reminder</option>
          </Select>
        </Field>
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Called Camille — interested" /></Field>
        <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Details…" /></Field>
      </div>
    </Modal>
  )
}

function ConvertModal({ open, onClose, onConvert, estRevenue }: { open: boolean; onClose: () => void; onConvert: (gross: number, pct: number) => void; estRevenue: number }) {
  const [gross, setGross] = useState(String(estRevenue || 0))
  const [pct, setPct] = useState('10')

  return (
    <Modal open={open} onClose={onClose} title="Convert to Deal" desc="Create a deal from this opportunity. It will appear in the Deals tab and leaderboard."
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Zap size={15} strokeWidth={1.75} />} onClick={() => onConvert(Number(gross), Number(pct))}>Convert</Button></>}
    >
      <div className="space-y-4">
        <Field label="Gross value (€)" required>
          <Input type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} />
        </Field>
        <Field label="Commission %" hint="Auto-calculated from seller level on approval">
          <Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
