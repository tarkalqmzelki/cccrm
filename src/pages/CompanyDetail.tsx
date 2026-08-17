import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Building2, Globe, MapPin, Plus, Clock, Briefcase,
  ChevronRight, UserPlus, FileText, Network, Lock, Pencil, Bell,
  ArrowBigUp, ArrowBigDown, MessageSquare, Send, Phone, Mail, Calendar,
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
import { RequestAccessButton } from '../components/RequestAccessButton'
import { LeadReminderModal } from '../components/LeadReminderModal'
import { LeadStatusPicker } from '../components/LeadStatusPicker'
import type { Company, Opportunity, Profile, Activity, CompanyNote, ServiceItem, Contact, NoteComment, AccessRequest, CompanyFollowUp } from '../lib/types'
import { OPP_STATUS_META, LEAD_STATUS_META } from '../lib/types'
import type { LeadStatus } from '../lib/types'
import { eur, dateShort, dateLong } from '../lib/format'

type Tab = 'summary' | 'offers' | 'contacts' | 'comments' | 'timeline'

export default function CompanyDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('summary')
  const [createOppOpen, setCreateOppOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editSummaryOpen, setEditSummaryOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const { data, loading, reload } = useAsync(async () => {
    const company = await db.getCompany(id!)
    if (!company) return null
    const [opps, contacts, activities, notes, services, profiles, requests, followups] = await Promise.all([
      db.listOpportunitiesByCompany(id!),
      db.listContacts(id!),
      db.listCompanyActivities(id!),
      db.listCompanyNotes(id!),
      db.listServices(),
      db.listProfiles(),
      user ? db.listAccessRequests(user.id) : Promise.resolve([]),
      db.listFollowUps(id!),
    ])
    return { company, opps, contacts, activities, notes, services, profiles: profiles as Profile[], requests: requests as AccessRequest[], followups }
  }, [id, user?.id])

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

  const accessMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    if (data?.requests && user) {
      data.requests.forEach((r) => {
        if (r.status === 'approved' && r.requester_id === user.id) {
          if (r.opportunity_id) m[r.opportunity_id] = true
          if (r.company_id) m[`company_${r.company_id}`] = true
        }
      })
    }
    return m
  }, [data, user])

  if (loading) return <PageContainer><Skeleton className="h-40 w-full" /></PageContainer>
  if (!data) return <PageContainer><Card><p className="py-12 text-center text-sm text-ink-400">Company not found.</p></Card></PageContainer>

  const { company, opps, contacts, activities, notes, followups } = data
  const hasCompanyAccess = accessMap[`company_${company.id}`]
  const isCreator = user?.id === company.created_by
  const isAdmin = user?.role === 'admin'
  const canEditCompany = isCreator || isAdmin
  const canAddOffer = canEditCompany

  async function addNote() {
    if (!noteText.trim() || !user) return
    try {
      await db.createCompanyNote(company.id, user.id, noteText)
      setNoteText('')
      push({ tone: 'success', title: 'Comment posted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not post', desc: e?.message })
    }
  }

  const tabs: [Tab, string, React.ReactNode, boolean][] = [
    ['summary', 'Summary', <FileText size={15} strokeWidth={1.75} key="s" />, false],
    ['offers', 'Offers', <Briefcase size={15} strokeWidth={1.75} key="o" />, false],
    ['contacts', 'Contacts', <UserPlus size={15} strokeWidth={1.75} key="c" />, true],
    ['comments', 'Comments', <MessageSquare size={15} strokeWidth={1.75} key="n" />, false],
    ['timeline', 'Timeline', <Clock size={15} strokeWidth={1.75} key="t" />, true],
  ]

  return (
    <PageContainer>
      <button onClick={() => navigate('/leads')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink transition-colors">
        <ArrowLeft size={15} strokeWidth={1.75} /> Leads
      </button>

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
        {/* Lead owner bubble */}
        {company.created_by && profileMap[company.created_by] && (
          <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
            <Avatar name={profileMap[company.created_by].full_name} color={profileMap[company.created_by].avatar_color} url={profileMap[company.created_by].avatar_url} size={32} />
            <div className="leading-tight">
              <p className="text-2xs text-ink-400">Lead Owner</p>
              <p className="text-sm font-medium">{profileMap[company.created_by].full_name}</p>
            </div>
          </div>
        )}
        {/* Lead status — inline changer for owner/admin, badge for others */}
        {company.lead_status && (
          <div className="flex items-center gap-2">
            <LeadStatusPicker
              status={company.lead_status as LeadStatus}
              canEdit={!!canEditCompany}
              onChange={async (s) => {
                try {
                  await db.updateLeadStatus(company.id, s)
                  push({ tone: 'success', title: 'Lead status updated', desc: LEAD_STATUS_META[s].label })
                  reload()
                } catch (e: any) {
                  push({ tone: 'error', title: 'Could not update', desc: e?.message })
                }
              }}
            />
          </div>
        )}
        {canEditCompany && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Pencil size={15} strokeWidth={1.75} />} onClick={() => setEditOpen(true)}>Edit</Button>
            <Button variant="secondary" icon={<Bell size={15} strokeWidth={1.75} />} onClick={() => setReminderOpen(true)}>Remind Me</Button>
            {canAddOffer && <Button variant="secondary" icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setCreateOppOpen(true)}>New Offer</Button>}
          </div>
        )}
        {!canEditCompany && user && (
          <Button variant="secondary" icon={<Bell size={15} strokeWidth={1.75} />} onClick={() => setReminderOpen(true)}>Remind Me</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 overflow-x-auto">
        {tabs.map(([key, label, icon, locked]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${tab === key ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            {tab === key && <motion.span layoutId="company-tab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative flex items-center gap-1.5">{icon}{label}{locked && <Lock size={10} strokeWidth={2} className="text-ink-300" />}</span>
          </button>
        ))}
      </div>

      {/* Summary tab — PUBLIC, first */}
      {tab === 'summary' && (
        <SummaryTab company={company} followups={followups} profileMap={profileMap} canEdit={canEditCompany} userId={user?.id || ''}
          onEditSummary={() => setEditSummaryOpen(true)} onAddFollowUp={() => setFollowUpOpen(true)} onDeleteFollowUp={(fid) => { db.deleteFollowUp(fid).then(reload) }}
        />
      )}

      {/* Offers tab — all private except value */}
      {tab === 'offers' && (
        <div className="space-y-3">
          {opps.length === 0 ? (
            <Card><p className="py-10 text-center text-sm text-ink-400">No offers yet.</p></Card>
          ) : opps.map((opp) => {
            const m = OPP_STATUS_META[opp.status]
            const owner = profileMap[opp.owner_id]
            const service = serviceMap[opp.service_id]
            const isOppOwner = user?.id === opp.owner_id
            const hasAccess = isOppOwner || isAdmin || accessMap[opp.id] || hasCompanyAccess
            if (hasAccess) {
              return (
                <button key={opp.id} onClick={() => navigate(`/leads/opp/${opp.id}`)}
                  className="card w-full text-left hover:border-ink-200 transition-colors flex items-center gap-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-50 text-ink">
                    <Network size={18} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{opp.title || service?.name || 'Offer'}</p>
                    <p className="text-2xs text-ink-400">{service?.name} · {isOppOwner ? `${owner?.full_name} (you)` : owner?.full_name || '—'}</p>
                  </div>
                  <Badge tone={m.tone} dot>{m.label}</Badge>
                  {(opp.offer_value || opp.est_revenue) > 0 && <span className="num text-sm font-bold">{eur(opp.offer_value || opp.est_revenue)}</span>}
                  {opp.converted_deal_id && <Badge tone="pos">Deal</Badge>}
                  <ChevronRight size={16} strokeWidth={1.75} className="text-ink-300" />
                </button>
              )
            }
            // No access — show only the value, blur everything else, with Request Access
            return (
              <LockedRow key={opp.id} ownerId={opp.owner_id} ownerName={owner?.full_name || ''} opportunityId={opp.id} companyId={company.id} onGranted={() => reload()}>
                <div className="pointer-events-none select-none blur-md opacity-40 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-50"><Network size={18} strokeWidth={1.75} /></div>
                  <div className="flex-1"><p className="text-sm font-medium">••••••••</p><p className="text-2xs text-ink-400">••••••</p></div>
                </div>
                {/* Value is always visible */}
                <div className="absolute right-16 top-1/2 -translate-y-1/2">
                  {(opp.offer_value || opp.est_revenue) > 0 && <span className="num text-sm font-bold">{eur(opp.offer_value || opp.est_revenue)}</span>}
                </div>
              </LockedRow>
            )
          })}
        </div>
      )}

      {/* Contacts tab — locked per-contact */}
      {tab === 'contacts' && (
        <Card>
          <CardHeader title="Contacts" desc="Contact details require access" action={canEditCompany ? <Button size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setAddContactOpen(true)}>Add</Button> : undefined} />
          {contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No contacts yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contacts.map((c) => {
                const isMine = c.created_by === user?.id || isAdmin || hasCompanyAccess
                if (isMine) return <ContactCard key={c.id} contact={c} ownerId={c.created_by || ''} canUnlock={false} unlocked={true} />
                return (
                  <LockedRow key={c.id} ownerId={c.created_by || ''} ownerName={profileMap[c.created_by || '']?.full_name || ''} companyId={company.id} onGranted={() => reload()}>
                    <div className="pointer-events-none select-none blur-md opacity-40 flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-ink-100" />
                      <div className="flex-1"><p className="text-sm font-medium">{c.full_name}</p><p className="text-2xs text-ink-400">{c.role}</p></div>
                    </div>
                  </LockedRow>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Comments tab — PUBLIC */}
      {tab === 'comments' && (
        <CommentsTab notes={notes} profileMap={profileMap} userId={user?.id || ''} companyId={company.id} onReload={reload} noteText={noteText} setNoteText={setNoteText} onPost={addNote} />
      )}

      {/* Timeline tab — locked per-activity */}
      {tab === 'timeline' && (
        <Card>
          <CardHeader title="Timeline" desc="Your activities are visible — others require access" />
          {activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => {
                const actor = profileMap[a.actor_id || '']
                const isMine = a.actor_id === user?.id || isAdmin || hasCompanyAccess
                if (isMine) {
                  return (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-400"><Clock size={13} strokeWidth={1.75} /></div>
                      <div className="flex-1">
                        <p className="text-sm text-ink-700"><span className="font-medium">{actor?.full_name || 'System'}</span> — {a.title}</p>
                        {a.description && <p className="text-2xs text-ink-400 mt-0.5">{a.description}</p>}
                        <p className="text-2xs text-ink-300 mt-0.5">{dateLong(a.created_at)}</p>
                      </div>
                    </div>
                  )
                }
                return (
                  <LockedRow key={a.id} ownerId={a.actor_id || ''} ownerName={actor?.full_name || ''} companyId={company.id} onGranted={() => reload()}>
                    <div className="pointer-events-none select-none blur-md opacity-40 flex items-start gap-3 w-full">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-50"><Clock size={13} strokeWidth={1.75} /></div>
                      <div className="flex-1"><p className="text-sm text-ink-700">•••• — ••••••</p><p className="text-2xs text-ink-300">{dateLong(a.created_at)}</p></div>
                    </div>
                  </LockedRow>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <CreateOppModal open={createOppOpen} onClose={() => setCreateOppOpen(false)} onSaved={() => { setCreateOppOpen(false); reload() }} presetCompany={company} />
      <LeadReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} company={company} />
      {canEditCompany && <AddContactModal open={addContactOpen} onClose={() => setAddContactOpen(false)} companyId={company.id} userId={user?.id || ''} onSaved={() => { setAddContactOpen(false); reload() }} />}
      {canEditCompany && <EditCompanyModal open={editOpen} onClose={() => setEditOpen(false)} company={company} onSaved={() => { setEditOpen(false); reload() }} />}
      {canEditCompany && <EditSummaryModal open={editSummaryOpen} onClose={() => setEditSummaryOpen(false)} company={company} onSaved={() => { setEditSummaryOpen(false); reload() }} />}
      {canEditCompany && <FollowUpModal open={followUpOpen} onClose={() => setFollowUpOpen(false)} companyId={company.id} userId={user?.id || ''} onSaved={() => { setFollowUpOpen(false); reload() }} />}
    </PageContainer>
  )
}

/* ---- Summary tab ---- */
function SummaryTab({ company, followups, profileMap, canEdit, userId, onEditSummary, onAddFollowUp, onDeleteFollowUp }: {
  company: Company; followups: CompanyFollowUp[]; profileMap: Record<string, Profile>; canEdit: boolean; userId: string
  onEditSummary: () => void; onAddFollowUp: () => void; onDeleteFollowUp: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Cold Call Summary" desc="What happened during the initial call" action={canEdit ? <Button size="sm" variant="secondary" icon={<Pencil size={14} strokeWidth={1.75} />} onClick={onEditSummary}>Edit</Button> : undefined} />
        {company.summary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{company.summary}</p>
        ) : (
          <p className="text-sm text-ink-400">No summary yet.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Follow-ups" desc="Call log and follow-up notes" action={canEdit ? <Button size="sm" variant="secondary" icon={<Plus size={14} strokeWidth={1.75} />} onClick={onAddFollowUp}>Add</Button> : undefined} />
        {followups.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No follow-ups yet.</p>
        ) : (
          <div className="space-y-3">
            {followups.map((f) => {
              const author = profileMap[f.author_id]
              const canDelete = f.author_id === userId || canEdit
              return (
                <div key={f.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    {f.follow_up_date && <span className="flex items-center gap-1 text-2xs text-ink-400"><Calendar size={11} strokeWidth={1.75} /> {dateShort(f.follow_up_date)}</span>}
                    <span className="text-2xs text-ink-400">{author?.full_name || 'Unknown'}</span>
                    {canDelete && <button onClick={() => onDeleteFollowUp(f.id)} className="ml-auto text-2xs text-ink-300 hover:text-neg transition-colors">Delete</button>}
                  </div>
                  {f.title && <p className="mt-1 text-sm font-medium">{f.title}</p>}
                  <p className="mt-1 text-sm text-ink-600">{f.body}</p>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---- Comments tab (public, reddit-style) ---- */
function CommentsTab({ notes, profileMap, userId, companyId, onReload, noteText, setNoteText, onPost }: {
  notes: CompanyNote[]; profileMap: Record<string, Profile>; userId: string; companyId: string; onReload: () => void; noteText: string; setNoteText: (v: string) => void; onPost: () => void
}) {
  const { push } = useToast()
  const { user } = useAuth()
  const [commentsMap, setCommentsMap] = useState<Record<string, NoteComment[]>>({})
  const [votesMap, setVotesMap] = useState<Record<string, { ups: number; downs: number; myVote?: 'up' | 'down' }>>({})
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [commentText, setCommentText] = useState<Record<string, string>>({})

  useMemo(() => {
    const noteIds = notes.map((n) => n.id)
    if (noteIds.length === 0) return
    Promise.all([
      Promise.all(noteIds.map((id) => db.listNoteComments(id))),
      db.getNoteVotes(noteIds),
    ]).then(([commentResults, votes]) => {
      const cMap: Record<string, NoteComment[]> = {}
      commentResults.forEach((c, i) => { cMap[noteIds[i]] = c })
      setCommentsMap(cMap)
      const vMap: Record<string, { ups: number; downs: number; myVote?: 'up' | 'down' }> = {}
      notes.forEach((n) => { vMap[n.id] = { ups: 0, downs: 0 } })
      votes.forEach((v) => {
        if (v.note_id) {
          if (!vMap[v.note_id]) vMap[v.note_id] = { ups: 0, downs: 0 }
          if (v.vote === 'up') vMap[v.note_id].ups++
          else vMap[v.note_id].downs++
          if (v.voter_id === userId) vMap[v.note_id].myVote = v.vote
        }
      })
      setVotesMap(vMap)
    })
  }, [notes, userId])

  async function vote(noteId: string, vote: 'up' | 'down') {
    const existing = votesMap[noteId]
    if (existing?.myVote === vote) { await db.unvoteNote(noteId, userId) }
    else { await db.voteNote(noteId, userId, vote) }
    onReload()
  }

  async function postComment(noteId: string) {
    const text = commentText[noteId]?.trim()
    if (!text) return
    try {
      await db.createNoteComment(noteId, userId, text)
      setCommentText({ ...commentText, [noteId]: '' })
      push({ tone: 'success', title: 'Reply posted' })
      onReload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not reply', desc: e?.message })
    }
  }

  return (
    <Card>
      <CardHeader title="Comments" desc="Public — visible to everyone. Discuss, upvote, and collaborate." />
      <div className="mb-5 flex gap-2">
        <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Share something with the team…" rows={2} className="flex-1" />
        <Button onClick={onPost} disabled={!noteText.trim()} icon={<Send size={15} strokeWidth={1.75} />}>Post</Button>
      </div>
      {notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No comments yet — be the first to post.</p>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => {
            const author = profileMap[n.author_id || '']
            const v = votesMap[n.id] || { ups: 0, downs: 0 }
            const comments = commentsMap[n.id] || []
            const expanded = expandedComments[n.id]
            const canDeleteNote = n.author_id === userId || user?.role === 'admin'
            return (
              <div key={n.id} className="rounded-xl border border-line p-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={() => vote(n.id, 'up')} className={`p-0.5 transition-colors ${v.myVote === 'up' ? 'text-pos' : 'text-ink-300 hover:text-ink'}`}>
                      <ArrowBigUp size={18} strokeWidth={1.75} fill={v.myVote === 'up' ? 'currentColor' : 'none'} />
                    </button>
                    <span className="num text-2xs font-semibold">{v.ups - v.downs}</span>
                    <button onClick={() => vote(n.id, 'down')} className={`p-0.5 transition-colors ${v.myVote === 'down' ? 'text-neg' : 'text-ink-300 hover:text-ink'}`}>
                      <ArrowBigDown size={18} strokeWidth={1.75} fill={v.myVote === 'down' ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Avatar name={author?.full_name || '?'} color={author?.avatar_color} url={author?.avatar_url} size={24} />
                      <span className="text-sm font-medium">{author?.full_name || 'Unknown'}</span>
                      <span className="text-2xs text-ink-400">{dateShort(n.created_at)}</span>
                      {canDeleteNote && <button onClick={async () => { try { await db.deleteCompanyNote(n.id); onReload() } catch {} }} className="ml-auto text-2xs text-ink-300 hover:text-neg transition-colors">Delete</button>}
                    </div>
                    <p className="mt-2 text-sm text-ink-600">{n.body}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <button onClick={() => setExpandedComments({ ...expandedComments, [n.id]: !expanded })} className="flex items-center gap-1 text-2xs text-ink-400 hover:text-ink transition-colors">
                        <MessageSquare size={12} strokeWidth={1.75} /> {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
                        {comments.map((c) => {
                          const cAuthor = profileMap[c.author_id || '']
                          const canDeleteComment = c.author_id === userId || user?.role === 'admin'
                          return (
                            <div key={c.id} className="flex gap-2">
                              <Avatar name={cAuthor?.full_name || '?'} color={cAuthor?.avatar_color} size={20} />
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium">{cAuthor?.full_name || 'Unknown'}</span>
                                  <span className="text-2xs text-ink-400">{dateShort(c.created_at)}</span>
                                  {canDeleteComment && <button onClick={async () => { try { await db.deleteNoteComment(c.id); onReload() } catch {} }} className="ml-auto text-2xs text-ink-300 hover:text-neg transition-colors">Delete</button>}
                                </div>
                                <p className="text-sm text-ink-600">{c.body}</p>
                              </div>
                            </div>
                          )
                        })}
                        <div className="flex gap-2 mt-2">
                          <Input value={commentText[n.id] || ''} onChange={(e) => setCommentText({ ...commentText, [n.id]: e.target.value })} placeholder="Reply…" className="h-9 text-sm" />
                          <Button size="sm" onClick={() => postComment(n.id)} disabled={!commentText[n.id]?.trim()}>Reply</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ---- LockedRow ---- */
function LockedRow({ ownerId, ownerName, opportunityId, companyId, onGranted, children }: {
  ownerId: string; ownerName: string; opportunityId?: string; companyId?: string; onGranted?: () => void; children: React.ReactNode
}) {
  return (
    <div className="card relative overflow-hidden">
      {children}
      <div className="absolute inset-0 flex items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            <Lock size={16} strokeWidth={1.75} className="text-ink-300" />
          </motion.span>
          <span className="text-sm text-ink-400">Private</span>
        </div>
        <RequestAccessButton ownerId={ownerId} ownerName={ownerName} opportunityId={opportunityId} companyId={companyId} onGranted={onGranted} />
      </div>
    </div>
  )
}

/* ---- Edit Summary Modal ---- */
function EditSummaryModal({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company: Company; onSaved: () => void }) {
  const { push } = useToast()
  const [summary, setSummary] = useState(company.summary)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await db.updateCompany(company.id, { summary })
      push({ tone: 'success', title: 'Summary updated' })
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit summary" desc="Describe what happened during the cold call." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
    >
      <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} placeholder="Describe the cold call: who you spoke to, their interest level, pain points, next steps…" />
    </Modal>
  )
}

/* ---- Follow-up Modal ---- */
function FollowUpModal({ open, onClose, companyId, userId, onSaved }: { open: boolean; onClose: () => void; companyId: string; userId: string; onSaved: () => void }) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim()) { push({ tone: 'error', title: 'Body is required' }); return }
    setSaving(true)
    try {
      await db.createFollowUp({ company_id: companyId, author_id: userId, title, body, follow_up_date: date || null })
      push({ tone: 'success', title: 'Follow-up added' })
      setTitle(''); setBody(''); setDate('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add follow-up" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>Add</Button></>}
    >
      <div className="space-y-4">
        <Field label="Title" hint="Optional"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Second call — interested" /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Notes" required><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What was discussed…" /></Field>
      </div>
    </Modal>
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
