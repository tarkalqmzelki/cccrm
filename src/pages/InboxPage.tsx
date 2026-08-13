import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, Check, X, Bell, MessageSquare, ShieldCheck, CheckCheck, Mail, Trash2, Send, Users, MessagesSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Modal } from '../components/ui/Modal'
import { Input, Textarea, Select, Field } from '../components/ui/Input'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import type { InboxMessage, Profile, AccessRequest, ChatMessage } from '../lib/types'
import { dateShort, dateLong } from '../lib/format'

export default function InboxPage() {
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const { data, loading, reload } = useAsync(async () => {
    if (!user) return null
    const [messages, profiles, requests] = await Promise.all([
      db.listInbox(user.id),
      db.listProfiles(),
      db.listAccessRequests(user.id),
    ])
    return { messages, profiles: profiles as Profile[], requests: requests as AccessRequest[] }
  }, [user?.id])

  const [sendOpen, setSendOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  if (!user) return null

  const messages = data?.messages || []
  const requests = data?.requests || []
  const unread = messages.filter((m) => !m.read)

  async function markRead(id: string) {
    try { await db.markInboxRead(id); reload() } catch {}
  }
  async function markAllRead() {
    if (!user) return
    try { await db.markAllInboxRead(user.id); reload() } catch {}
  }
  async function respondToRequest(reqId: string, status: 'approved' | 'rejected') {
    try {
      await db.updateAccessRequest(reqId, { status })
      push({ tone: status === 'approved' ? 'success' : 'info', title: status === 'approved' ? 'Access approved' : 'Request declined' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not respond', desc: e?.message })
    }
  }
  async function deleteMessage(id: string) {
    try {
      const { error } = await (await import('../lib/supabase')).supabase!.from('inbox_messages').delete().eq('id', id)
      if (error) throw error
      push({ tone: 'success', title: 'Message deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function sendDirectMessage(recipientId: string, title: string, body: string) {
    if (!user) return
    try {
      await db.sendDirectMessage(recipientId, user.id, title, body)
      push({ tone: 'success', title: 'Message sent' })
      setSendOpen(false)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not send', desc: e?.message })
    }
  }

  function iconForType(type: string) {
    switch (type) {
      case 'access_request': return <MessageSquare size={16} strokeWidth={1.75} className="text-info" />
      case 'access_approved': return <Check size={16} strokeWidth={1.75} className="text-pos" />
      case 'access_rejected': return <X size={16} strokeWidth={1.75} className="text-neg" />
      case 'direct_message': return <Mail size={16} strokeWidth={1.75} className="text-info" />
      case 'note_reply': return <MessageSquare size={16} strokeWidth={1.75} className="text-ink-400" />
      case 'admin_grant': return <ShieldCheck size={16} strokeWidth={1.75} className="text-ink" />
      default: return <Bell size={16} strokeWidth={1.75} className="text-ink-400" />
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-ink-400">{unread.length > 0 ? `${unread.length} unread message${unread.length > 1 ? 's' : ''}` : 'All caught up'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Users size={14} strokeWidth={1.75} />} onClick={() => setChatOpen(true)}>Start chat</Button>
          <Button size="sm" icon={<Send size={14} strokeWidth={1.75} />} onClick={() => setSendOpen(true)}>Send message</Button>
          {unread.length > 0 && (
            <Button variant="subtle" size="sm" icon={<CheckCheck size={14} strokeWidth={1.75} />} onClick={markAllRead}>Mark all read</Button>
          )}
        </div>
      </div>

      {/* Access requests (for owner) */}
      {requests.filter((r) => r.owner_id === user.id && r.status === 'pending').length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Pending access requests" desc="People asking to see your leads" />
          <div className="space-y-3">
            {requests.filter((r) => r.owner_id === user.id && r.status === 'pending').map((r) => {
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

      {/* Messages */}
      <Card>
        <CardHeader title="Messages" desc={unread.length > 0 ? `${unread.length} unread` : 'No unread messages'} />
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Inbox size={24} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((m) => {
              const sender = m.sender_id ? profileMap[m.sender_id] : null
              const isDM = m.type === 'direct_message'
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${!m.read ? 'bg-infoBg/50' : 'hover:bg-ink-50'}`}
                  onClick={() => { if (!m.read) markRead(m.id) }}
                >
                  <div className="mt-0.5 shrink-0">{iconForType(m.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{m.title}</p>
                      {!m.read && <span className="h-1.5 w-1.5 rounded-full bg-neg" />}
                      <span className="ml-auto text-2xs text-ink-400">{dateShort(m.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-500">{m.body}</p>
                    {sender && <p className="mt-0.5 text-2xs text-ink-400">{isDM ? 'Message from' : 'from'} {sender.full_name}</p>}
                    {m.action_url && !isDM && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(m.action_url) }} className="mt-1 text-2xs font-medium text-info hover:underline">View →</button>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMessage(m.id) }}
                    className="shrink-0 p-1 text-ink-300 hover:text-neg transition-colors"
                    title="Delete message"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </Card>

      <SendMessageModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        profiles={data?.profiles || []}
        currentUserId={user.id}
        onSend={sendDirectMessage}
      />
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
/* Send Message modal (email-like direct message to another member)   */
/* ------------------------------------------------------------------ */
function SendMessageModal({
  open, onClose, profiles, currentUserId, onSend,
}: {
  open: boolean
  onClose: () => void
  profiles: Profile[]
  currentUserId: string
  onSend: (recipientId: string, title: string, body: string) => Promise<void>
}) {
  const [recipientId, setRecipientId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const others = useMemo(
    () => profiles.filter((p) => p.id !== currentUserId && p.active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles, currentUserId],
  )

  useEffect(() => {
    if (!open) {
      setRecipientId(''); setTitle(''); setBody(''); setSending(false)
    }
  }, [open])

  const canSend = recipientId && body.trim().length > 0 && !sending

  async function submit() {
    if (!canSend) return
    setSending(true)
    try { await onSend(recipientId, title.trim(), body.trim()) } finally { setSending(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send message"
      desc="Send an email-like message to another member. They'll see it in their inbox."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Send size={14} strokeWidth={1.75} />} disabled={!canSend} onClick={submit}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="To" required>
          <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
            <option value="">Select a member…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} · {p.role}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this about?" />
        </Field>
        <Field label="Message" required>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your message…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* General Chat modal (platform-wide channel, all members)            */
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