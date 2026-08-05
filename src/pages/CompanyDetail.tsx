import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Building2, Globe, MapPin, Plus, Clock, Briefcase,
  ChevronRight, UserPlus, FileText, Network, Lock, Unlock, MessageSquare, UserRound, ShieldCheck, Pencil,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Input, Textarea, Field } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import { CreateOppModal } from '../components/CreateOppModal'
import { ContactCard } from '../components/ContactCard'
import type { Company, Opportunity, Profile, Activity, CompanyNote, ServiceItem, Contact } from '../lib/types'
import { OPP_STATUS_META } from '../lib/types'
import { eur, dateShort, dateLong } from '../lib/format'

type Tab = 'opportunities' | 'contacts' | 'notes' | 'timeline'

export default function CompanyDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('opportunities')
  const [createOppOpen, setCreateOppOpen] = useState(false)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const { data, loading, reload } = useAsync(async () => {
    const company = await db.getCompany(id!)
    if (!company) return null
    const [opps, contacts, activities, notes, services, profiles] = await Promise.all([
      db.listOpportunitiesByCompany(id!),
      db.listContacts(id!),
      db.listCompanyActivities(id!),
      db.listCompanyNotes(id!),
      db.listServices(),
      db.listProfiles(),
    ])
    return { company, opps, contacts, activities, notes, services, profiles: profiles as Profile[] }
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
  if (!data) return <PageContainer><Card><p className="py-12 text-center text-sm text-ink-400">Company not found.</p></Card></PageContainer>

  const { company, opps, contacts, activities, notes } = data
  // First opportunity owner is the "primary" owner for unlock purposes
  const firstOwnerId = opps[0]?.owner_id || ''
  const firstOwner = profileMap[firstOwnerId]

  async function addNote() {
    if (!noteText.trim() || !user) return
    try {
      await db.createCompanyNote(company.id, user.id, noteText)
      setNoteText('')
      push({ tone: 'success', title: 'Note added' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add note', desc: e?.message })
    }
  }

  return (
    <PageContainer>
      <button onClick={() => navigate('/leads')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink transition-colors">
        <ArrowLeft size={15} strokeWidth={1.75} /> Leads
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        {company.logo_url ? (
          <img src={company.logo_url} alt={company.name} className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white">
            <Building2 size={26} strokeWidth={1.75} />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-400">
            {company.website && <span className="flex items-center gap-1"><Globe size={13} strokeWidth={1.75} /> {company.website}</span>}
            {company.industry && <span className="flex items-center gap-1"><Briefcase size={13} strokeWidth={1.75} /> {company.industry}</span>}
            {company.address && <span className="flex items-center gap-1"><MapPin size={13} strokeWidth={1.75} /> {company.address}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Pencil size={15} strokeWidth={1.75} />} onClick={() => setEditOpen(true)}>Edit</Button>
          <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setCreateOppOpen(true)}>New Opportunity</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 overflow-x-auto">
        {([
          ['opportunities', 'Opportunities', <Briefcase size={15} strokeWidth={1.75} key="b" />, true],
          ['contacts', 'Contacts', <UserPlus size={15} strokeWidth={1.75} key="u" />, true],
          ['notes', 'Notes', <FileText size={15} strokeWidth={1.75} key="n" />, false],
          ['timeline', 'Timeline', <Clock size={15} strokeWidth={1.75} key="t" />, true],
        ] as [Tab, string, React.ReactNode, boolean][]).map(([key, label, icon, locked]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === key ? 'text-white' : 'text-ink-500 hover:text-ink'
            }`}
          >
            {tab === key && <motion.span layoutId="company-tab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative flex items-center gap-1.5">
              {icon}{label}
              {locked && <Lock size={10} strokeWidth={2} className="text-ink-300" />}
            </span>
          </button>
        ))}
      </div>

      {/* Opportunities tab — per-opp locking */}
      {tab === 'opportunities' && (
        <div className="space-y-3">
          {opps.length === 0 ? (
            <Card><p className="py-10 text-center text-sm text-ink-400">No opportunities yet.</p></Card>
          ) : opps.map((opp) => {
            const m = OPP_STATUS_META[opp.status]
            const owner = profileMap[opp.owner_id]
            const service = serviceMap[opp.service_id]
            const isOppOwner = user?.id === opp.owner_id
            if (isOppOwner) {
              // My opportunity — fully visible
              return (
                <button
                  key={opp.id}
                  onClick={() => navigate(`/leads/opp/${opp.id}`)}
                  className="card w-full text-left hover:border-ink-200 transition-colors flex items-center gap-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-50 text-ink">
                    <Network size={18} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{opp.title || service?.name || 'Opportunity'}</p>
                    <p className="text-2xs text-ink-400">{service?.name} · {owner?.full_name || '—'} (you)</p>
                  </div>
                  <Badge tone={m.tone} dot>{m.label}</Badge>
                  {opp.est_revenue > 0 && <span className="num text-sm font-medium">{eur(opp.est_revenue)}</span>}
                  {opp.converted_deal_id && <Badge tone="pos">Deal</Badge>}
                  <ChevronRight size={16} strokeWidth={1.75} className="text-ink-300" />
                </button>
              )
            }
            // Not my opportunity — blurred with inline unlock
            return (
              <LockedOppRow
                key={opp.id}
                opp={opp}
                owner={owner}
                service={service}
                onClick={() => navigate(`/leads/opp/${opp.id}`)}
              />
            )
          })}
        </div>
      )}

      {/* Contacts tab — per-contact locking */}
      {tab === 'contacts' && (
        <Card>
          <CardHeader
            title="Contacts"
            desc="Your contacts are visible — others are locked"
            action={<Button size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setAddContactOpen(true)}>Add</Button>}
          />
          {contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No contacts yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contacts.map((c) => {
                const isMine = c.created_by === user?.id || user?.role === 'admin'
                if (isMine) {
                  return <ContactCard key={c.id} contact={c} ownerId={c.created_by || firstOwnerId} canUnlock={false} />
                }
                return (
                  <LockedContactRow key={c.id} contact={c} ownerId={c.created_by || firstOwnerId} />
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Notes tab — PUBLIC */}
      {tab === 'notes' && (
        <Card>
          <CardHeader title="Company notes" desc="Shared internal notes for team coordination — visible to everyone" />
          <div className="mb-4 flex gap-2">
            <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Leave a note for the team…" rows={2} className="flex-1" />
            <Button onClick={addNote} disabled={!noteText.trim()}>Post</Button>
          </div>
          {notes.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => {
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

      {/* Timeline tab — per-activity locking */}
      {tab === 'timeline' && (
        <Card>
          <CardHeader title="Timeline" desc="Your activities are visible — others are locked" />
          {activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => {
                const actor = profileMap[a.actor_id || '']
                const isMine = a.actor_id === user?.id || user?.role === 'admin'
                if (isMine) {
                  return (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-400">
                        <Clock size={13} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-ink-700">
                          <span className="font-medium">{actor?.full_name || 'System'}</span>
                          {' — '}{a.title}
                        </p>
                        {a.description && <p className="text-2xs text-ink-400 mt-0.5">{a.description}</p>}
                        <p className="text-2xs text-ink-300 mt-0.5">{dateLong(a.created_at)}</p>
                      </div>
                    </div>
                  )
                }
                return <LockedActivityRow key={a.id} activity={a} actor={actor} />
              })}
            </div>
          )}
        </Card>
      )}

      <CreateOppModal
        open={createOppOpen}
        onClose={() => setCreateOppOpen(false)}
        onSaved={(oppId) => { setCreateOppOpen(false); navigate(`/leads/opp/${oppId}`) }}
        presetCompany={company}
      />

      <AddContactModal open={addContactOpen} onClose={() => setAddContactOpen(false)} companyId={company.id} userId={user?.id || ''} onSaved={() => { setAddContactOpen(false); reload() }} />

      <EditCompanyModal open={editOpen} onClose={() => setEditOpen(false)} company={company} onSaved={() => { setEditOpen(false); reload() }} />
    </PageContainer>
  )
}

function EditCompanyModal({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company: Company; onSaved: () => void }) {
  const { push } = useToast()
  const [name, setName] = useState(company.name)
  const [website, setWebsite] = useState(company.website)
  const [industry, setIndustry] = useState(company.industry)
  const [address, setAddress] = useState(company.address)
  const [logoUrl, setLogoUrl] = useState(company.logo_url)
  const [vatNumber, setVatNumber] = useState(company.vat_number)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) { push({ tone: 'error', title: 'Name is required' }); return }
    setSaving(true)
    try {
      await db.updateCompany(company.id, { name, website, industry, address, logo_url: logoUrl, vat_number: vatNumber })
      push({ tone: 'success', title: 'Company updated' })
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit company" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Company name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website"><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="company.com" /></Field>
          <Field label="VAT number"><Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} /></Field>
        </div>
        <Field label="Industry"><Input value={industry} onChange={(e) => setIndustry(e.target.value)} /></Field>
        <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Logo URL" hint="Optional"><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></Field>
      </div>
    </Modal>
  )
}

function AddContactModal({ open, onClose, companyId, userId, onSaved }: { open: boolean; onClose: () => void; companyId: string; userId: string; onSaved: () => void }) {
  const { push } = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!fullName.trim()) { push({ tone: 'error', title: 'Name is required' }); return }
    setSaving(true)
    try {
      await db.createContact({ company_id: companyId, full_name: fullName, email, phone, role, created_by: userId })
      push({ tone: 'success', title: 'Contact added' })
      setFullName(''); setEmail(''); setPhone(''); setRole('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add contact', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add contact" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Full name" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Camille Faure" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
          <Field label="Phone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 1 4020 3040" /></Field>
        </div>
        <Field label="Role"><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="CEO / CTO" /></Field>
      </div>
    </Modal>
  )
}

/* ---- Locked opportunity row (for other people's opportunities) ---- */
function LockedOppRow({ opp, owner, service, onClick }: {
  opp: Opportunity
  owner?: Profile
  service?: ServiceItem
  onClick: () => void
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user?.role === 'admin'
  const [revealed, setRevealed] = useState(false)
  const [unlockMode, setUnlockMode] = useState<'owner_uid' | 'assignee' | 'admin' | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [assigneeName, setAssigneeName] = useState<string | null>(null)

  const m = OPP_STATUS_META[opp.status]

  async function verify() {
    if (!code.trim()) return
    setVerifying(true)
    try {
      if (unlockMode === 'admin') {
        if (!isAdmin) { push({ tone: 'error', title: 'Admin only' }); return }
        setRevealed(true); close()
        push({ tone: 'success', title: 'Admin unlock' })
      } else if (unlockMode === 'owner_uid') {
        const o = await db.getProfile(opp.owner_id)
        if (!o?.uid) { push({ tone: 'error', title: 'Owner has no UID', desc: 'Ask the admin to set their UID.' }); return }
        if (code.toUpperCase().trim() === o.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Unlocked' })
        } else { push({ tone: 'error', title: 'Invalid code' }) }
      } else {
        const profiles = await db.listProfiles()
        const match = profiles.find((p) => p.uid && p.uid.toUpperCase() === code.toUpperCase().trim())
        if (match) {
          setRevealed(true); setAssigneeName(match.full_name); close()
          push({ tone: 'success', title: `Verified as ${match.full_name}` })
        } else { push({ tone: 'error', title: 'Invalid UID' }) }
      }
    } catch (e: any) {
      push({ tone: 'error', title: 'Verification failed', desc: e?.message })
    } finally { setVerifying(false) }
  }
  function close() { setUnlockMode(null); setCode('') }

  if (revealed || isAdmin) {
    return (
      <button
        onClick={onClick}
        className="card w-full text-left hover:border-ink-200 transition-colors flex items-center gap-4"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-50 text-ink">
          <Network size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{opp.title || service?.name || 'Opportunity'}</p>
          <p className="text-2xs text-ink-400">{service?.name} · {owner?.full_name || '—'}</p>
        </div>
        <Badge tone={m.tone} dot>{m.label}</Badge>
        {opp.est_revenue > 0 && <span className="num text-sm font-medium">{eur(opp.est_revenue)}</span>}
        {opp.converted_deal_id && <Badge tone="pos">Deal</Badge>}
        <ChevronRight size={16} strokeWidth={1.75} className="text-ink-300" />
      </button>
    )
  }

  return (
    <>
      <div className="card relative overflow-hidden">
        {/* Blurred preview */}
        <div className="pointer-events-none select-none blur-md opacity-40 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-50">
            <Network size={18} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{opp.title || service?.name || 'Opportunity'}</p>
            <p className="text-2xs text-ink-400">{service?.name} · {owner?.full_name || '—'}</p>
          </div>
          <Badge tone={m.tone} dot>{m.label}</Badge>
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
              <Lock size={16} strokeWidth={1.75} className="text-ink-300" />
            </motion.span>
            <span className="text-sm text-ink-400">Private opportunity</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setUnlockMode('owner_uid')}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <Unlock size={11} strokeWidth={1.75} /> Unlock
            </button>
            <button
              onClick={() => setUnlockMode('assignee')}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <MessageSquare size={11} strokeWidth={1.75} /> Contact Lead
            </button>
            {isAdmin && (
              <button
                onClick={() => setUnlockMode('admin')}
                className="flex items-center gap-1 rounded-lg border border-ink bg-surface px-2 py-1 text-2xs font-medium text-ink hover:bg-ink-50 transition-colors"
              >
                <ShieldCheck size={11} strokeWidth={1.75} /> Admin
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={!!unlockMode}
        onClose={close}
        title={unlockMode === 'owner_uid' ? 'Unlock opportunity' : 'Contact Lead Assignee'}
        desc={unlockMode === 'owner_uid'
          ? 'Enter the opportunity owner\'s UID to reveal details.'
          : 'Enter your own UID to verify you\'re a seller and collaborate.'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={verify} disabled={verifying || !code.trim()} icon={<Unlock size={15} strokeWidth={1.75} />}>
              {verifying ? 'Verifying…' : unlockMode === 'owner_uid' ? 'Unlock' : 'Verify'}
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
              <p className="text-2xs text-info">Once verified, you'll see the owner's name and can collaborate on this opportunity.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

/* ---- Locked contact row (for other people's contacts) ---- */
function LockedContactRow({ contact, ownerId }: { contact: Contact; ownerId: string }) {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user?.role === 'admin'
  const [revealed, setRevealed] = useState(false)
  const [unlockMode, setUnlockMode] = useState<'owner_uid' | 'assignee' | 'admin' | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function verify() {
    if (!code.trim()) return
    setVerifying(true)
    try {
      if (unlockMode === 'admin') {
        if (!isAdmin) { push({ tone: 'error', title: 'Admin only' }); return }
        setRevealed(true); close()
        push({ tone: 'success', title: 'Admin unlock' })
      } else if (unlockMode === 'owner_uid') {
        const o = await db.getProfile(ownerId)
        if (!o?.uid) { push({ tone: 'error', title: 'Owner has no UID', desc: 'Ask the admin to set their UID.' }); return }
        if (code.toUpperCase().trim() === o.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Contact unlocked' })
        } else { push({ tone: 'error', title: 'Invalid code' }) }
      } else {
        const profiles = await db.listProfiles()
        const match = profiles.find((p) => p.uid && p.uid.toUpperCase() === code.toUpperCase().trim())
        if (match) {
          setRevealed(true); close()
          push({ tone: 'success', title: `Verified as ${match.full_name}`, desc: 'Contact is now visible.' })
        } else { push({ tone: 'error', title: 'Invalid UID' }) }
      }
    } catch (e: any) {
      push({ tone: 'error', title: 'Verification failed', desc: e?.message })
    } finally { setVerifying(false) }
  }
  function close() { setUnlockMode(null); setCode('') }

  if (revealed || isAdmin) {
    return <ContactCard contact={contact} ownerId={ownerId} canUnlock={false} />
  }

  return (
    <>
      <div className="relative rounded-xl border border-line p-3 overflow-hidden">
        <div className="pointer-events-none select-none blur-md opacity-40 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-ink-100" />
          <div className="flex-1">
            <p className="text-sm font-medium">{contact.full_name || 'Unnamed'}</p>
            <p className="text-2xs text-ink-400">{contact.role}</p>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-2xs text-ink-500 num">••••••••</p>
              <p className="text-2xs text-ink-500">••••@••••</p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
              <Lock size={14} strokeWidth={1.75} className="text-ink-300" />
            </motion.span>
            <span className="text-2xs text-ink-400">Private contact</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setUnlockMode('owner_uid')} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors">
              <Unlock size={11} strokeWidth={1.75} /> Unlock
            </button>
            <button onClick={() => setUnlockMode('assignee')} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors">
              <MessageSquare size={11} strokeWidth={1.75} /> Contact
            </button>
            {isAdmin && (
              <button onClick={() => setUnlockMode('admin')} className="flex items-center gap-1 rounded-lg border border-ink bg-surface px-2 py-1 text-2xs font-medium text-ink hover:bg-ink-50 transition-colors">
                <ShieldCheck size={11} strokeWidth={1.75} /> Admin
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={!!unlockMode}
        onClose={close}
        title={unlockMode === 'owner_uid' ? 'Unlock contact' : 'Contact Lead Assignee'}
        desc={unlockMode === 'owner_uid'
          ? 'Enter the contact owner\'s UID to reveal details.'
          : 'Enter your own UID to verify and collaborate.'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={verify} disabled={verifying || !code.trim()} icon={<Unlock size={15} strokeWidth={1.75} />}>
              {verifying ? 'Verifying…' : unlockMode === 'owner_uid' ? 'Unlock' : 'Verify'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={unlockMode === 'owner_uid' ? 'Owner UID' : 'Your UID'} required
            hint={unlockMode === 'owner_uid' ? 'Ask the owner for their 6-character code.' : 'Enter your own 6-character UID.'}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB12CD" maxLength={6}
              className="text-center text-lg tracking-[0.3em] font-mono uppercase" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && verify()}
            />
          </Field>
          {unlockMode === 'assignee' && (
            <div className="flex items-start gap-2 rounded-xl bg-infoBg border border-info/20 p-3">
              <UserRound size={15} strokeWidth={1.75} className="mt-0.5 text-info shrink-0" />
              <p className="text-2xs text-info">Once verified, you'll see the contact owner and can collaborate.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

/* ---- Locked activity row (for other people's timeline entries) ---- */
function LockedActivityRow({ activity, actor }: { activity: Activity; actor?: Profile }) {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user?.role === 'admin'
  const [revealed, setRevealed] = useState(false)
  const [unlockMode, setUnlockMode] = useState<'owner_uid' | 'assignee' | 'admin' | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function verify() {
    if (!code.trim()) return
    setVerifying(true)
    try {
      if (unlockMode === 'admin') {
        if (!isAdmin) { push({ tone: 'error', title: 'Admin only' }); return }
        setRevealed(true); close()
        push({ tone: 'success', title: 'Admin unlock' })
      } else if (unlockMode === 'owner_uid') {
        const o = await db.getProfile(activity.actor_id || '')
        if (!o?.uid) { push({ tone: 'error', title: 'No UID set' }); return }
        if (code.toUpperCase().trim() === o.uid.toUpperCase()) {
          setRevealed(true); close()
          push({ tone: 'success', title: 'Unlocked' })
        } else { push({ tone: 'error', title: 'Invalid code' }) }
      } else {
        const profiles = await db.listProfiles()
        const match = profiles.find((p) => p.uid && p.uid.toUpperCase() === code.toUpperCase().trim())
        if (match) { setRevealed(true); close(); push({ tone: 'success', title: `Verified as ${match.full_name}` }) }
        else { push({ tone: 'error', title: 'Invalid UID' }) }
      }
    } catch (e: any) {
      push({ tone: 'error', title: 'Verification failed', desc: e?.message })
    } finally { setVerifying(false) }
  }
  function close() { setUnlockMode(null); setCode('') }

  if (revealed || isAdmin) {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-400">
          <Clock size={13} strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-ink-700">
            <span className="font-medium">{actor?.full_name || 'System'}</span>
            {' — '}{activity.title}
          </p>
          {activity.description && <p className="text-2xs text-ink-400 mt-0.5">{activity.description}</p>}
          <p className="text-2xs text-ink-300 mt-0.5">{dateLong(activity.created_at)}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="relative flex items-start gap-3 overflow-hidden rounded-lg py-2">
        <div className="pointer-events-none select-none blur-md opacity-40 flex items-start gap-3 w-full">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50">
            <Clock size={13} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-sm text-ink-700">{actor?.full_name || 'Someone'} — {activity.title}</p>
            <p className="text-2xs text-ink-300">{dateLong(activity.created_at)}</p>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Lock size={12} strokeWidth={1.75} className="text-ink-300" />
            <span className="text-2xs text-ink-400">Private activity</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setUnlockMode('owner_uid')} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors">
              <Unlock size={10} strokeWidth={1.75} /> Unlock
            </button>
            <button onClick={() => setUnlockMode('assignee')} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-2xs font-medium text-ink-600 hover:bg-ink-50 transition-colors">
              <MessageSquare size={10} strokeWidth={1.75} /> Contact
            </button>
            {isAdmin && (
              <button onClick={() => setUnlockMode('admin')} className="flex items-center gap-1 rounded-lg border border-ink bg-surface px-2 py-0.5 text-2xs font-medium text-ink hover:bg-ink-50 transition-colors">
                <ShieldCheck size={10} strokeWidth={1.75} /> Admin
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={!!unlockMode}
        onClose={close}
        title={unlockMode === 'owner_uid' ? 'Unlock activity' : 'Contact Lead Assignee'}
        desc={unlockMode === 'owner_uid' ? 'Enter the author\'s UID.' : 'Enter your own UID to verify.'}
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
        <Field label={unlockMode === 'owner_uid' ? 'Author UID' : 'Your UID'} required>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB12CD" maxLength={6}
            className="text-center text-lg tracking-[0.3em] font-mono uppercase" autoFocus
            onKeyDown={(e) => e.key === 'Enter' && verify()}
          />
        </Field>
      </Modal>
    </>
  )
}
