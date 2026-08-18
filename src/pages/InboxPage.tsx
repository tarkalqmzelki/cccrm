import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, Check, X, Bell, MessageSquare, ShieldCheck, CheckCheck, Mail,
  Trash2, Send, Users, MessagesSquare, Star, Reply, Forward, Archive,
  Pencil, Flag, Search, Send as SendIcon, Star as StarIcon,
  Calendar as CalIcon, CornerUpLeft, CornerUpRight, MailOpen, FolderInput, AlertOctagon, UsersRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Modal } from '../components/ui/Modal'
import { Input, Textarea, Field } from '../components/ui/Input'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { EntityPickerModal, profileEntities } from '../components/EntityPickerModal'
import type {
  InboxMessage, Profile, AccessRequest, ChatMessage,
  MessagePriority, MessageFolder, InboxType,
} from '../lib/types'
import {
  MESSAGE_PRIORITY_META, MESSAGE_PRIORITIES,
} from '../lib/types'
import { dateShort, dateLong } from '../lib/format'

type Tab = 'received' | 'sent' | 'starred' | 'archive' | 'trash'

const TAB_META: Record<Tab, { label: string; icon: typeof Inbox }> = {
  received: { label: 'Received', icon: Inbox },
  sent:     { label: 'Sent',       icon: SendIcon },
  starred:  { label: 'Starred',    icon: StarIcon },
  archive:  { label: 'Archive',    icon: Archive },
  trash:    { label: 'Trash',      icon: Trash2 },
}

/* Helpers -------------------------------------------------------- */
function effectivePriority(m: InboxMessage): MessagePriority {
  return (m.priority_override || m.priority || 'normal') as MessagePriority
}
function effectiveCategory(m: InboxMessage): string {
  return ((m.category_override ?? m.category) || '').trim()
}
function priorityCounts(messages: InboxMessage[]): Record<MessagePriority, number> {
  const out: Record<MessagePriority, number> = { low: 0, normal: 0, high: 0, urgent: 0 }
  for (const m of messages) out[effectivePriority(m)]++
  return out
}

function iconForType(type: InboxType) {
  switch (type) {
    case 'access_request': return <MessageSquare size={14} strokeWidth={1.75} className="text-info" />
    case 'access_approved': return <Check size={14} strokeWidth={1.75} className="text-pos" />
    case 'access_rejected': return <X size={14} strokeWidth={1.75} className="text-neg" />
    case 'direct_message': return <Mail size={14} strokeWidth={1.75} className="text-info" />
    case 'note_reply': return <MessageSquare size={14} strokeWidth={1.75} className="text-ink-400" />
    case 'admin_grant': return <ShieldCheck size={14} strokeWidth={1.75} className="text-ink" />
    case 'activity_assigned': return <CalIcon size={14} strokeWidth={1.75} className="text-info" />
    case 'activity_reassigned': return <CalIcon size={14} strokeWidth={1.75} className="text-warn" />
    default: return <Bell size={14} strokeWidth={1.75} className="text-ink-400" />
  }
}

type ComposePrefill = {
  recipientId: string
  recipientName?: string
  title: string
  body: string
  priority: MessagePriority
  category: string
  parentId?: string | null
  threadId?: string | null
}

/* ------------------------------------------------------------------ */
/* InboxPage                                                           */
/* ------------------------------------------------------------------ */
export default function InboxPage() {
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const { data, loading, reload } = useAsync(async () => {
    if (!user) return null
    const [messages, sent, profiles, requests] = await Promise.all([
      db.listInbox(user.id),
      db.listInboxSent(user.id),
      db.listProfiles(),
      db.listAccessRequests(user.id),
    ])
    return {
      messages: messages as InboxMessage[],
      sent: sent as InboxMessage[],
      profiles: profiles as Profile[],
      requests: requests as AccessRequest[],
    }
  }, [user?.id])

  const [tab, setTab] = useState<Tab>('received')
  const [priorityFilter, setPriorityFilter] = useState<MessagePriority | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composePre, setComposePre] = useState<ComposePrefill | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  if (!user) return null

  const received = (data?.messages || []).filter((m) => (m.folder || 'inbox') === 'inbox')
  const archived = (data?.messages || []).filter((m) => m.folder === 'archive')
  const trashed = (data?.messages || []).filter((m) => m.folder === 'trash')
  const starred = (data?.messages || []).filter((m) => m.is_starred && m.folder !== 'trash')
  const sent = data?.sent || []

  const requests = data?.requests || []
  const pendingIncomingReqs = requests.filter((r) => r.owner_id === user.id && r.status === 'pending')
  const unreadCount = received.filter((m) => !m.read).length

  const listForTab: InboxMessage[] =
    tab === 'received' ? received
    : tab === 'sent' ? sent
    : tab === 'starred' ? starred
    : tab === 'archive' ? archived
    : trashed

  const categoriesInTab = useMemo(() => {
    const set = new Set<string>()
    for (const m of listForTab) {
      const c = effectiveCategory(m)
      if (c) set.add(c)
    }
    return Array.from(set).sort()
  }, [listForTab])

  const filtered = useMemo(() => {
    let out = listForTab
    if (priorityFilter) {
      out = out.filter((m) => effectivePriority(m) === priorityFilter)
    }
    if (categoryFilter) {
      out = out.filter((m) => effectiveCategory(m) === categoryFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter((m) =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.body || '').toLowerCase().includes(q) ||
        (m.sender_id && profileMap[m.sender_id]?.full_name || '').toLowerCase().includes(q),
      )
    }
    /* Sort: higher priority first, then newest */
    return out.slice().sort((a, b) => {
      const pa = MESSAGE_PRIORITY_META[effectivePriority(a)].weight
      const pb = MESSAGE_PRIORITY_META[effectivePriority(b)].weight
      if (pa !== pb) return pb - pa
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [listForTab, priorityFilter, categoryFilter, search, profileMap])

  const allForSelected = received.concat(sent, archived, trashed, starred)
  const selected = selectedId ? allForSelected.find((m) => m.id === selectedId) || null : null

  async function reloadAll() { reload() }

  async function markRead(id: string) {
    try { await db.markInboxRead(id); reloadAll() } catch {}
  }
  async function markAllRead() {
    if (!user) return
    try { await db.markAllInboxRead(user.id); reloadAll() } catch {}
  }
  async function respondToRequest(reqId: string, status: 'approved' | 'rejected') {
    try {
      await db.updateAccessRequest(reqId, { status })
      push({ tone: status === 'approved' ? 'success' : 'info', title: status === 'approved' ? 'Access approved' : 'Request declined' })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not respond', desc: e?.message })
    }
  }

  async function toggleStar(m: InboxMessage) {
    try {
      await db.updateInboxMessage(m.id, { is_starred: !m.is_starred })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function setFolder(m: InboxMessage, folder: MessageFolder) {
    try {
      await db.updateInboxMessage(m.id, { folder })
      if (selectedId === m.id) setSelectedId(null)
      push({ tone: 'success', title: folder === 'trash' ? 'Moved to Trash' : folder === 'archive' ? 'Archived' : 'Moved to Inbox' })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not move', desc: e?.message })
    }
  }

  async function setPriorityOverride(m: InboxMessage, p: MessagePriority | null) {
    try {
      await db.updateInboxMessage(m.id, { priority_override: p })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update priority', desc: e?.message })
    }
  }

  async function setCategoryOverride(m: InboxMessage, c: string | null) {
    try {
      await db.updateInboxMessage(m.id, { category_override: c })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update category', desc: e?.message })
    }
  }

  async function deleteMessage(m: InboxMessage) {
    try {
      await db.deleteInboxMessage(m.id)
      if (selectedId === m.id) setSelectedId(null)
      push({ tone: 'success', title: 'Message deleted' })
      reloadAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  function openMessage(m: InboxMessage) {
    setSelectedId(m.id)
    if (user && !m.read && m.recipient_id === user.id) markRead(m.id)
  }

  function openCompose(pre?: ComposePrefill) {
    setComposePre(pre || null)
    setComposeOpen(true)
  }

  function openReply(m: InboxMessage) {
    if (!m.sender_id) return
    const sender = profileMap[m.sender_id]
    openCompose({
      recipientId: m.sender_id,
      recipientName: sender?.full_name,
      title: m.title.toLowerCase().startsWith('re:') ? m.title : `Re: ${m.title || ''}`.trim(),
      body: `\n\n— On ${dateLong(m.created_at)}, ${sender?.full_name || 'Someone'} wrote:\n${(m.body || '').split('\n').map((l) => `> ${l}`).join('\n')}`,
      priority: effectivePriority(m),
      category: effectiveCategory(m),
      parentId: m.id,
      threadId: m.thread_id || m.id,
    })
  }

  function openForward(m: InboxMessage) {
    openCompose({
      recipientId: '',
      title: m.title.toLowerCase().startsWith('fwd:') ? m.title : `Fwd: ${m.title || ''}`.trim(),
      body: `\n\n— Forwarded message —\nFrom: ${m.sender_id ? profileMap[m.sender_id]?.full_name || 'Someone' : 'System'}\nDate: ${dateLong(m.created_at)}\nSubject: ${m.title}\n\n${m.body || ''}`,
      priority: effectivePriority(m),
      category: effectiveCategory(m),
      parentId: m.id,
      threadId: m.thread_id || m.id,
    })
  }

  function rowContextItems(m: InboxMessage): CtxItem[] {
    const items: CtxItem[] = [
      { label: 'Open', icon: <Mail size={14} strokeWidth={1.75} />, onClick: () => openMessage(m) },
    ]
    if (m.type === 'direct_message' && m.sender_id) {
      items.push(
        { divider: true },
        { label: 'Reply', icon: <Reply size={14} strokeWidth={1.75} />, onClick: () => openReply(m) },
        { label: 'Forward', icon: <Forward size={14} strokeWidth={1.75} />, onClick: () => openForward(m) },
      )
    }
    items.push(
      { divider: true },
      { label: m.is_starred ? 'Unstar' : 'Star', icon: <Star size={14} strokeWidth={1.75} />, onClick: () => toggleStar(m) },
      {
        label: m.read ? 'Mark as unread' : 'Mark as read',
        icon: m.read ? <Mail size={14} strokeWidth={1.75} /> : <Check size={14} strokeWidth={1.75} />,
        onClick: async () => {
          try { await db.updateInboxMessage(m.id, { read: !m.read }); reloadAll() } catch (e: any) { push({ tone: 'error', title: 'Could not update', desc: e?.message }) }
        },
      },
    )
    if (m.folder !== 'archive') items.push({ label: 'Archive', icon: <Archive size={14} strokeWidth={1.75} />, onClick: () => setFolder(m, 'archive') })
    if (m.folder !== 'inbox') items.push({ label: 'Move to Inbox', icon: <Inbox size={14} strokeWidth={1.75} />, onClick: () => setFolder(m, 'inbox') })
    if (m.folder !== 'trash') items.push({ label: 'Move to Trash', icon: <Trash2 size={14} strokeWidth={1.75} />, onClick: () => setFolder(m, 'trash') })
    items.push(
      { divider: true },
      { label: 'Delete forever', danger: true, icon: <Trash2 size={14} strokeWidth={1.75} />, onClick: () => deleteMessage(m) },
    )
    return items
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-ink-400">
            {unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<MessagesSquare size={14} strokeWidth={1.75} />} onClick={() => setChatOpen(true)}>General chat</Button>
          <Button size="sm" icon={<Send size={14} strokeWidth={1.75} />} onClick={() => openCompose()}>New message</Button>
          {unreadCount > 0 && (
            <Button variant="subtle" size="sm" icon={<CheckCheck size={14} strokeWidth={1.75} />} onClick={markAllRead}>Mark all read</Button>
          )}
        </div>
      </div>

      {/* Pending access requests */}
      {pendingIncomingReqs.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Pending access requests" desc="People asking to see your leads" />
          <div className="space-y-3">
            {pendingIncomingReqs.map((r) => {
              const requester = profileMap[r.requester_id]
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar name={requester?.full_name || '?'} color={requester?.avatar_color} url={requester?.avatar_url} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{requester?.full_name || 'Unknown'}</p>
                    <p className="text-2xs text-ink-400">{dateShort(r.created_at)} · {r.message || 'No message'}</p>
                  </div>
                  <Button size="sm" icon={<Check size={14} strokeWidth={1.75} />} onClick={() => respondToRequest(r.id, 'approved')}>Approve</Button>
                  <Button size="sm" variant="secondary" icon={<X size={14} strokeWidth={1.75} />} onClick={() => respondToRequest(r.id, 'rejected')}>Decline</Button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="order-first xl:order-none">
          <FilterSidebar
            tab={tab}
            setTab={(t) => { setTab(t); setSelectedId(null); setPriorityFilter(null); setCategoryFilter(null) }}
            counts={{
              received: received.length,
              sent: sent.length,
              starred: starred.length,
              archive: archived.length,
              trash: trashed.length,
            }}
            unreadByPriority={priorityCounts(received)}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            categoriesInTab={categoriesInTab}
          />
        </aside>

        {/* Main: search + message list */}
        <div className="min-w-0">
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <div className="relative flex-1 max-w-md">
                <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${TAB_META[tab].label.toLowerCase()}…`}
                  className="h-9 w-full rounded-lg border border-line bg-ink-50/50 pl-9 pr-3 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
                />
              </div>
              <span className="ml-auto text-2xs text-ink-400">
                {filtered.length} {filtered.length === 1 ? 'message' : 'messages'}
                {priorityFilter || categoryFilter ? ' · filtered' : ''}
              </span>
            </div>

            {loading ? (
              <div className="space-y-1 p-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Inbox size={24} strokeWidth={1.75} className="text-ink-300" />
                <p className="text-sm text-ink-400">
                  {tab === 'received' ? 'No messages yet' : tab === 'sent' ? 'No messages sent yet' : 'Nothing here'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    tab={tab}
                    profileMap={profileMap}
                    currentUserId={user.id}
                    onOpen={() => openMessage(m)}
                    onStar={() => toggleStar(m)}
                    onContext={(e) => openContextMenu(e, rowContextItems(m))}
                    isSelected={selectedId === m.id}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => { setComposeOpen(false); setComposePre(null) }}
        profiles={data?.profiles || []}
        currentUserId={user.id}
        isAdmin={user.role === 'admin'}
        prefill={composePre}
        onSent={() => { setComposeOpen(false); setComposePre(null); reloadAll() }}
      />

      {/* Message detail modal */}
      <MessageDetailModal
        message={selected}
        profileMap={profileMap}
        currentUserId={user.id}
        onClose={() => setSelectedId(null)}
        onReply={(m) => { setSelectedId(null); openReply(m) }}
        onForward={(m) => { setSelectedId(null); openForward(m) }}
        onStar={toggleStar}
        onSetFolder={setFolder}
        onSetPriorityOverride={setPriorityOverride}
        onSetCategoryOverride={setCategoryOverride}
        onDelete={deleteMessage}
        onMarkUnread={async (m) => {
          try { await db.updateInboxMessage(m.id, { read: false }); setSelectedId(null); reloadAll() } catch (e: any) { push({ tone: 'error', title: 'Could not update', desc: e?.message }) }
        }}
        onJump={(url) => { setSelectedId(null); navigate(url) }}
      />

      {/* General chat */}
      <GeneralChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        profiles={data?.profiles || []}
        currentUserId={user.id}
        isAdmin={user.role === 'admin'}
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Filter sidebar                                                      */
/* ------------------------------------------------------------------ */
function FilterSidebar({
  tab, setTab, counts, unreadByPriority,
  priorityFilter, setPriorityFilter,
  categoryFilter, setCategoryFilter,
  categoriesInTab,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  counts: Record<Tab, number>
  unreadByPriority: Record<MessagePriority, number>
  priorityFilter: MessagePriority | null
  setPriorityFilter: (p: MessagePriority | null) => void
  categoryFilter: string | null
  setCategoryFilter: (c: string | null) => void
  categoriesInTab: string[]
}) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-400">Folders</p>
        <div className="space-y-0.5">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const meta = TAB_META[t]
            const Icon = meta.icon
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                <Icon size={15} strokeWidth={1.75} />
                <span className="flex-1 text-left">{meta.label}</span>
                <span className={`text-2xs ${active ? 'text-white/80' : 'text-ink-400'}`}>{counts[t]}</span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-400">Priority</p>
        <div className="space-y-0.5">
          <FilterRow label="All priorities" active={priorityFilter === null} onClick={() => setPriorityFilter(null)} />
          {MESSAGE_PRIORITIES.map((p) => {
            const meta = MESSAGE_PRIORITY_META[p]
            const unread = unreadByPriority[p] || 0
            return (
              <FilterRow
                key={p}
                label={meta.label}
                tone={meta.color}
                count={unread}
                active={priorityFilter === p}
                onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
              />
            )
          })}
        </div>
      </Card>

      {categoriesInTab.length > 0 && (
        <Card>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-400">Categories</p>
          <div className="space-y-0.5">
            <FilterRow label="All categories" active={categoryFilter === null} onClick={() => setCategoryFilter(null)} />
            {categoriesInTab.map((c) => (
              <FilterRow
                key={c}
                label={c}
                active={categoryFilter === c}
                onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function FilterRow({ label, tone, count, active, onClick }: { label: string; tone?: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active ? 'bg-ink-50 text-ink font-medium' : 'text-ink-500 hover:bg-ink-50 hover:text-ink'
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone || 'transparent' }} />
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && <span className="text-2xs text-ink-400">{count}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Message row in the list                                            */
/* ------------------------------------------------------------------ */
function MessageRow({
  m, tab, profileMap, currentUserId, onOpen, onStar, onContext, isSelected,
}: {
  m: InboxMessage
  tab: Tab
  profileMap: Record<string, Profile>
  currentUserId: string
  onOpen: () => void
  onStar: () => void
  onContext: (e: React.MouseEvent) => void
  isSelected: boolean
}) {
  const isSentView = tab === 'sent'
  const otherId = isSentView ? m.recipient_id : m.sender_id
  const other = otherId ? profileMap[otherId] : null
  const priority = effectivePriority(m)
  const pMeta = MESSAGE_PRIORITY_META[priority]
  const category = effectiveCategory(m)
  const isDirect = m.type === 'direct_message'
  const unread = !m.read && !isSentView

  return (
    <li
      onClick={onOpen}
      onContextMenu={onContext}
      className={`group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
        isSelected ? 'bg-infoBg/60' : unread ? 'bg-infoBg/30 hover:bg-infoBg/50' : 'hover:bg-ink-50'
      } ${pMeta.weight >= 2 ? 'border-l-2' : ''}`}
      style={pMeta.weight >= 2 ? { borderLeftColor: pMeta.color } : undefined}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onStar() }}
        className={`mt-0.5 shrink-0 p-0.5 transition-colors ${m.is_starred ? 'text-warn' : 'text-ink-300 opacity-0 group-hover:opacity-100 hover:text-warn'}`}
        title={m.is_starred ? 'Unstar' : 'Star'}
      >
        <Star size={14} strokeWidth={1.75} fill={m.is_starred ? 'currentColor' : 'none'} />
      </button>

      <div className="mt-0.5 shrink-0">
        {isDirect && other ? (
          <Avatar name={other.full_name} color={other.avatar_color} url={other.avatar_url} size={32} />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-50">{iconForType(m.type)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'font-medium text-ink-700'}`}>
            {isSentView ? `To: ${other?.full_name || '—'}` : other?.full_name || (m.sender_id ? 'Member' : 'System')}
          </p>
          {pMeta.weight >= 2 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium"
              style={{ background: `${pMeta.color}1a`, color: pMeta.color }}
            >
              <Flag size={9} strokeWidth={2.5} /> {pMeta.label}
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-50 px-1.5 py-0.5 text-2xs text-ink-500">
              {category}
            </span>
          )}
          <span className="ml-auto shrink-0 text-2xs text-ink-400" title={dateLong(m.created_at)}>{dateShort(m.created_at)}</span>
        </div>
        <p className={`mt-0.5 truncate text-sm ${unread ? 'font-medium text-ink' : 'text-ink-600'}`}>
          {m.title || '(no subject)'}
        </p>
        <p className="mt-0.5 truncate text-2xs text-ink-400">{m.body || '—'}</p>
      </div>

      {unread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neg" />}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Compose modal — single recipient (everyone) or bulk (admin only)     */
/* ------------------------------------------------------------------ */
function ComposeModal({
  open, onClose, profiles, currentUserId, isAdmin, prefill, onSent,
}: {
  open: boolean
  onClose: () => void
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
  prefill: ComposePrefill | null
  onSent: () => void
}) {
  const { push } = useToast()
  const [recipientId, setRecipientId] = useState('')
  const [recipientName, setRecipientName] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<MessagePriority>('normal')
  const [category, setCategory] = useState('')
  const [sending, setSending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Bulk mode — admins only.  When `bulk` is true we send the same
  // message to every selected recipient via db.sendDirectMessageBulk.
  const [bulk, setBulk] = useState(false)
  const [bulkIds, setBulkIds] = useState<string[]>([])
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    if (prefill) {
      // Prefills only make sense in single-recipient mode (reply / forward)
      setBulk(false)
      setBulkIds([])
      setRecipientId(prefill.recipientId)
      setRecipientName(prefill.recipientName)
      setTitle(prefill.title)
      setBody(prefill.body)
      setPriority(prefill.priority)
      setCategory(prefill.category)
    } else {
      setRecipientId(''); setRecipientName(undefined); setTitle(''); setBody(''); setPriority('normal'); setCategory('')
      // Don't reset `bulk` here — let the admin keep their bulk setting
      // across sends.  Bulk ids ARE cleared after a successful send.
    }
    setSending(false)
  }, [open, prefill])

  const canSend = bulk
    ? bulkIds.length > 0 && body.trim().length > 0 && !sending
    : !!recipientId && body.trim().length > 0 && !sending

  async function submit() {
    if (!canSend) return
    setSending(true)
    try {
      if (bulk) {
        const { sent } = await db.sendDirectMessageBulk({
          recipientIds: bulkIds,
          senderId: currentUserId,
          title: title.trim(),
          body: body.trim(),
          priority,
          category: category.trim(),
        })
        push({
          tone: 'success',
          title: 'Bulk message sent',
          desc: `Delivered to ${sent} recipient${sent === 1 ? '' : 's'}.`,
        })
        setBulkIds([])
      } else {
        await db.sendDirectMessage({
          recipientId,
          senderId: currentUserId,
          title: title.trim(),
          body: body.trim(),
          priority,
          category: category.trim(),
          parentId: prefill?.parentId || null,
          threadId: prefill?.threadId || null,
        })
        push({ tone: 'success', title: 'Message sent' })
      }
      onSent()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send', desc: e?.message })
    } finally {
      setSending(false)
    }
  }

  const recipientProfile = profiles.find((p) => p.id === recipientId)
  // Exclude the current user from bulk recipients — you can't bulk-send
  // to yourself.
  const bulkEntities = profileEntities(profiles, currentUserId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 pr-6">
          {bulk ? <UsersRound size={16} strokeWidth={1.75} className="text-info" /> : <Send size={16} strokeWidth={1.75} className="text-info" />}
          {prefill?.parentId
            ? (bulk ? 'Bulk message' : 'Reply / Forward')
            : bulk ? 'Bulk message' : 'New message'}
        </div>
      }
      desc={
        bulk
          ? 'Send the same message to multiple recipients at once. Each recipient gets their own copy and a separate push notification.'
          : 'Send an email-like message to another member. They\'ll see it in their inbox with your chosen priority and category.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Send size={14} strokeWidth={1.75} />} disabled={!canSend} onClick={submit}>
            {sending ? 'Sending…' : bulk ? `Send to ${bulkIds.length || '—'}` : 'Send'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Bulk toggle — admins only */}
        {isAdmin && !prefill?.parentId && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-50/60 px-3 py-2">
            <UsersRound size={14} strokeWidth={1.75} className="text-ink-600" />
            <p className="flex-1 text-2xs text-ink-600">
              {bulk ? 'Bulk mode — message many recipients at once.' : 'Single recipient mode.'}
            </p>
            <button
              type="button"
              onClick={() => { setBulk((v) => !v); setBulkIds([]); setRecipientId(''); setRecipientName(undefined) }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${bulk ? 'bg-ink' : 'bg-ink-200'}`}
              aria-label="Toggle bulk mode"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${bulk ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}

        {/* Recipient picker — different UI per mode */}
        {bulk ? (
          <Field label="Recipients" required hint={`${bulkIds.length} selected`}>
            <button
              type="button"
              onClick={() => setBulkPickerOpen(true)}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
            >
              {bulkIds.length === 0 ? (
                <span className="flex-1 text-left text-ink-400">Select recipients…</span>
              ) : (
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {bulkIds.slice(0, 4).map((id) => {
                    const p = profiles.find((x) => x.id === id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-2xs font-medium text-ink-600">
                        <Avatar name={p?.full_name || '?'} color={p?.avatar_color} url={p?.avatar_url} size={14} />
                        {p?.full_name || 'Unknown'}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setBulkIds((cur) => cur.filter((x) => x !== id)) }}
                          className="text-ink-300 hover:text-neg"
                        >
                          <X size={10} strokeWidth={2} />
                        </button>
                      </span>
                    )
                  })}
                  {bulkIds.length > 4 && <span className="text-2xs text-ink-400">+{bulkIds.length - 4} more</span>}
                </div>
              )}
              <UsersRound size={15} strokeWidth={1.75} className="text-ink-400" />
            </button>
          </Field>
        ) : (
          <Field label="To" required>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
            >
              {recipientProfile ? (
                <>
                  <Avatar name={recipientProfile.full_name} color={recipientProfile.avatar_color} url={recipientProfile.avatar_url} size={22} />
                  <span className="flex-1 text-left truncate">{recipientProfile.full_name}</span>
                  <span className="text-2xs text-ink-400 capitalize">{recipientProfile.role}</span>
                </>
              ) : (
                <span className="flex-1 text-left text-ink-400">Select a recipient…</span>
              )}
            </button>
          </Field>
        )}

        <Field label="Subject">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this about?" />
        </Field>

        <Field label="Priority" hint="Higher-priority messages rise to the top of the recipient's inbox. They can still adjust it on their side.">
          <div className="flex flex-wrap gap-1.5">
            {MESSAGE_PRIORITIES.map((p) => {
              const meta = MESSAGE_PRIORITY_META[p]
              const active = priority === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-2xs font-medium transition-colors ${
                    active ? 'text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                  }`}
                  style={active ? { background: meta.color } : undefined}
                >
                  <Flag size={11} strokeWidth={2} /> {meta.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Category" hint="Optional — a free-form label to help the recipient organize your message.">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Sales, Onboarding, Personal" />
        </Field>

        <Field label="Message" required>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write your message…" />
        </Field>
      </div>

      {/* Single-recipient picker */}
      <EntityPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select recipient"
        desc="Search by name, role, or phone."
        entities={profileEntities(profiles, currentUserId)}
        selectedId={recipientId}
        onSelect={(id) => {
          setRecipientId(id)
          const p = profiles.find((x) => x.id === id)
          setRecipientName(p?.full_name)
        }}
      />

      {/* Multi-recipient picker — admins only */}
      <EntityPickerModal
        open={bulkPickerOpen}
        onClose={() => setBulkPickerOpen(false)}
        title="Select recipients"
        desc="Tap each member to add them. Search by name, role, or phone."
        entities={bulkEntities}
        multi
        selectedIds={bulkIds}
        onSelectIds={setBulkIds}
      />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Message detail modal                                                */
/* ------------------------------------------------------------------ */
function MessageDetailModal({
  message, profileMap, currentUserId, onClose,
  onReply, onForward, onStar, onSetFolder, onSetPriorityOverride, onSetCategoryOverride,
  onDelete, onMarkUnread, onJump,
}: {
  message: InboxMessage | null
  profileMap: Record<string, Profile>
  currentUserId: string
  onClose: () => void
  onReply: (m: InboxMessage) => void
  onForward: (m: InboxMessage) => void
  onStar: (m: InboxMessage) => void
  onSetFolder: (m: InboxMessage, f: MessageFolder) => void
  onSetPriorityOverride: (m: InboxMessage, p: MessagePriority | null) => void
  onSetCategoryOverride: (m: InboxMessage, c: string | null) => void
  onDelete: (m: InboxMessage) => void
  onMarkUnread: (m: InboxMessage) => void
  onJump: (url: string) => void
}) {
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const [categoryInput, setCategoryInput] = useState('')
  const [categoryEditing, setCategoryEditing] = useState(false)
  const m = message

  useEffect(() => {
    if (!m) { setPriorityMenuOpen(false); setCategoryEditing(false); setCategoryInput('') }
    else setCategoryInput(effectiveCategory(m))
  }, [m?.id])

  if (!m) return null

  const sender = m.sender_id ? profileMap[m.sender_id] : null
  const priority = effectivePriority(m)
  const pMeta = MESSAGE_PRIORITY_META[priority]
  const category = effectiveCategory(m)
  const isDirect = m.type === 'direct_message'
  const isMine = m.recipient_id === currentUserId
  const senderPriority = (m.priority || 'normal') as MessagePriority
  const overridden = m.priority_override !== null && m.priority_override !== undefined && m.priority_override !== m.priority

  function saveCategoryOverride() {
    if (!m) return
    onSetCategoryOverride(m, categoryInput.trim() || null)
    setCategoryEditing(false)
  }

  return (
    <Modal
      open={!!m}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2 pr-6">
          {iconForType(m.type)}
          <span className="truncate">{m.title || '(no subject)'}</span>
        </div>
      }
      desc={
        <span className="flex flex-wrap items-center gap-2 text-2xs">
          {isMine ? (
            <>
              <span className="text-ink-500">From</span>
              <span className="font-medium text-ink">{sender?.full_name || 'System'}</span>
            </>
          ) : (
            <>
              <span className="text-ink-500">To</span>
              <span className="font-medium text-ink">{profileMap[m.recipient_id]?.full_name || '—'}</span>
            </>
          )}
          <span className="text-ink-300">·</span>
          <span className="text-ink-500">{dateLong(m.created_at)}</span>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<X size={13} strokeWidth={1.75} />} onClick={onClose}>Close</Button>
          {isMine && (
            <>
              <Button variant="ghost" size="sm" icon={<Star size={13} strokeWidth={1.75} fill={m.is_starred ? 'currentColor' : 'none'} />} onClick={() => onStar(m)}>
                {m.is_starred ? 'Unstar' : 'Star'}
              </Button>
              {isDirect && m.sender_id && (
                <>
                  <Button variant="ghost" size="sm" icon={<CornerUpLeft size={13} strokeWidth={1.75} />} onClick={() => onReply(m)}>Reply</Button>
                  <Button variant="ghost" size="sm" icon={<CornerUpRight size={13} strokeWidth={1.75} />} onClick={() => onForward(m)}>Forward</Button>
                </>
              )}
              <Button variant="ghost" size="sm" icon={<MailOpen size={13} strokeWidth={1.75} />} onClick={() => onMarkUnread(m)}>Mark unread</Button>
              {m.folder !== 'archive' && <Button variant="ghost" size="sm" icon={<Archive size={13} strokeWidth={1.75} />} onClick={() => onSetFolder(m, 'archive')}>Archive</Button>}
              {m.folder !== 'inbox' && <Button variant="ghost" size="sm" icon={<FolderInput size={13} strokeWidth={1.75} />} onClick={() => onSetFolder(m, 'inbox')}>Move to Inbox</Button>}
              {m.folder !== 'trash' && <Button variant="ghost" size="sm" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => onSetFolder(m, 'trash')}>Move to Trash</Button>}
              <Button variant="danger" size="sm" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => onDelete(m)} className="ml-auto">Delete forever</Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Email-style header block */}
        <div className="rounded-xl border border-line bg-ink-50/40 p-3 text-sm">
          <div className="flex items-start gap-3">
            {isDirect && sender ? (
              <Avatar name={sender.full_name} color={sender.avatar_color} url={sender.avatar_url} size={36} />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface">{iconForType(m.type)}</span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <Row label="From">{isMine ? (sender?.full_name || 'System') : (profileMap[m.recipient_id]?.full_name || '—')}</Row>
              <Row label="Date">{dateLong(m.created_at)} · {new Date(m.created_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}</Row>
              <Row label="Subject">{m.title || '(no subject)'}</Row>
            </div>
          </div>
        </div>

        {/* Priority + category strip (only for received direct messages) */}
        {isMine && isDirect && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
            {/* Priority (with override) */}
            <div className="relative">
              <button
                onClick={() => setPriorityMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium"
                style={{ background: `${pMeta.color}1a`, color: pMeta.color }}
                title={overridden ? `Sender priority: ${MESSAGE_PRIORITY_META[senderPriority].label}. You changed it to ${pMeta.label}.` : `Sender priority: ${pMeta.label}`}
              >
                <Flag size={10} strokeWidth={2.5} /> Priority: {pMeta.label}
                {overridden && <span className="text-2xs opacity-70">(was {MESSAGE_PRIORITY_META[senderPriority].label})</span>}
              </button>
              <AnimatePresence>
                {priorityMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[110]" onClick={() => setPriorityMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.99 }}
                      className="absolute left-0 top-full z-[120] mt-1 w-44 glass-strong rounded-xl shadow-glass p-1.5"
                    >
                      <p className="px-2.5 py-1 text-2xs font-medium uppercase text-ink-400">Reset to sender's priority</p>
                      <button
                        onClick={() => { onSetPriorityOverride(m, null); setPriorityMenuOpen(false) }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-2xs text-ink hover:bg-ink-100"
                      >
                        <Flag size={11} strokeWidth={2.5} style={{ color: MESSAGE_PRIORITY_META[senderPriority].color }} /> {MESSAGE_PRIORITY_META[senderPriority].label}
                      </button>
                      <div className="my-1 h-px bg-line" />
                      <p className="px-2.5 py-1 text-2xs font-medium uppercase text-ink-400">Set your own priority</p>
                      {MESSAGE_PRIORITIES.map((p) => {
                        const meta = MESSAGE_PRIORITY_META[p]
                        return (
                          <button
                            key={p}
                            onClick={() => { onSetPriorityOverride(m, p); setPriorityMenuOpen(false) }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-2xs hover:bg-ink-100 ${p === priority ? 'text-ink font-medium' : 'text-ink-500'}`}
                          >
                            <Flag size={11} strokeWidth={2.5} style={{ color: meta.color }} /> {meta.label}
                          </button>
                        )
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Category */}
            {categoryEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveCategoryOverride(); if (e.key === 'Escape') setCategoryEditing(false) }}
                  placeholder="Category…"
                  className="h-7 w-32 rounded-md border border-line bg-surface px-2 text-2xs focus:outline-none focus:border-ink"
                />
                <button onClick={saveCategoryOverride} className="text-2xs font-medium text-info hover:underline">Save</button>
                <button onClick={() => setCategoryEditing(false)} className="text-2xs text-ink-400 hover:underline">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setCategoryEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-50 px-2.5 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-100"
              >
                {category || <span className="text-ink-400">+ Category</span>}
                <Pencil size={10} strokeWidth={1.75} className="opacity-50" />
              </button>
            )}

            <span className="ml-auto text-2xs text-ink-400">Tip: you can change priority or category — only you'll see the change.</span>
          </div>
        )}

        {/* Body — rendered in its own box so it reads like an email:
            the metadata header above, the body in a bordered
            container below, action button below that. */}
        <div className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5 sm:py-5">
          <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-400">
            <MailOpen size={11} strokeWidth={1.75} />
            Message
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">
            {m.body || '(empty message)'}
          </p>
        </div>

        {/* Action button (system notifications) */}
        {m.action_url && !isDirect && (
          <button
            onClick={() => onJump(m.action_url)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-info hover:bg-infoBg/50 transition-colors"
          >
            View related
          </button>
        )}

        {/* Thread info */}
        {m.thread_id && (
          <p className="text-2xs text-ink-400 italic">Part of a conversation thread</p>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-2xs">
      <span className="w-14 shrink-0 text-ink-400">{label}</span>
      <span className="flex-1 text-ink-700">{children}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* General Chat modal                                                  */
/* ------------------------------------------------------------------ */
function GeneralChatModal({
  open, onClose, profiles, currentUserId, isAdmin,
}: {
  open: boolean
  onClose: () => void
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
}) {
  const { push } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [profiles])

  async function load() {
    try {
      const list = await db.listChatMessages(300)
      setMessages(list)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not load chat', desc: e?.message })
    }
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    load().finally(() => setLoading(false))
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  async function post() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await db.sendChatMessage(currentUserId, text)
      setDraft('')
      await load()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send', desc: e?.message })
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    try {
      await db.deleteChatMessage(id)
      await load()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      post()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <MessagesSquare size={18} strokeWidth={1.75} className="text-info" />
          General chat
        </span>
      }
      desc="Everyone on the platform can see and post in this channel."
      size="lg"
      footer={
        <div className="flex w-full items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            className="flex-1"
          />
          <Button icon={<Send size={14} strokeWidth={1.75} />} disabled={!draft.trim() || sending} onClick={post}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      }
    >
      <div ref={scrollRef} className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {loading && messages.length === 0 ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <MessagesSquare size={22} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">No messages yet — start the conversation.</p>
          </div>
        ) : (
          messages.map((m) => {
            const sender = profileMap[m.sender_id]
            const mine = m.sender_id === currentUserId
            return (
              <div key={m.id} className={`group flex items-start gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={sender?.full_name || '?'} color={sender?.avatar_color} url={sender?.avatar_url} size={30} />
                <div className={`max-w-[78%] ${mine ? 'items-end' : ''}`}>
                  <div className={`flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className="text-2xs font-medium text-ink-700">{mine ? 'You' : sender?.full_name || 'Unknown'}</span>
                    <span className="text-2xs text-ink-400" title={dateLong(m.created_at)}>{dateShort(m.created_at)}</span>
                  </div>
                  <div
                    className={`mt-0.5 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-ink text-white rounded-tr-sm' : 'bg-ink-50 text-ink rounded-tl-sm'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
                {(mine || isAdmin) && (
                  <button
                    onClick={() => remove(m.id)}
                    className="mt-6 shrink-0 p-1 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neg"
                    title="Delete message"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
