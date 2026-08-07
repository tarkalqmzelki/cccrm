import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, Check, X, Bell, MessageSquare, ShieldCheck, CheckCheck, Mail, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import type { InboxMessage, Profile, AccessRequest } from '../lib/types'
import { dateShort } from '../lib/format'

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
      await db.markInboxRead(id)
      // We can't actually delete from client side easily with RLS,
      // but the inbox_delete policy allows recipient to delete
      const { error } = await (await import('../lib/supabase')).supabase!.from('inbox_messages').delete().eq('id', id)
      if (error) throw error
      push({ tone: 'success', title: 'Message deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  function iconForType(type: string) {
    switch (type) {
      case 'access_request': return <MessageSquare size={16} strokeWidth={1.75} className="text-info" />
      case 'access_approved': return <Check size={16} strokeWidth={1.75} className="text-pos" />
      case 'access_rejected': return <X size={16} strokeWidth={1.75} className="text-neg" />
      case 'note_reply': return <MessageSquare size={16} strokeWidth={1.75} className="text-ink-400" />
      case 'admin_grant': return <ShieldCheck size={16} strokeWidth={1.75} className="text-ink" />
      default: return <Bell size={16} strokeWidth={1.75} className="text-ink-400" />
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-ink-400">{unread.length > 0 ? `${unread.length} unread message${unread.length > 1 ? 's' : ''}` : 'All caught up'}</p>
        </div>
        {unread.length > 0 && (
          <Button variant="secondary" size="sm" icon={<CheckCheck size={14} strokeWidth={1.75} />} onClick={markAllRead}>Mark all read</Button>
        )}
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
                    <p className="mt-0.5 text-sm text-ink-500">{m.body}</p>
                    {sender && <p className="mt-0.5 text-2xs text-ink-400">from {sender.full_name}</p>}
                    {m.action_url && (
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
    </PageContainer>
  )
}
