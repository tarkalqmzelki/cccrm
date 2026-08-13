import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Phone, Users, Link2, Mail, ListTodo, Bell, Pencil, MapPin,
  Clock, ChevronDown, User as UserIcon, Building2, MessageSquare, Trash2, Send, Plus,
} from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Avatar } from './ui/Avatar'
import { Badge } from './ui/Badge'
import { Textarea } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_STATUS_META,
} from '../lib/types'
import type {
  ScheduledActivity, ScheduledActivityType, Company, Profile,
  ActivityComment,
} from '../lib/types'
import { dateLong } from '../lib/format'

const TYPE_ICON: Record<ScheduledActivityType, React.ReactNode> = {
  call: <Phone size={14} strokeWidth={1.75} />,
  meeting: <Users size={14} strokeWidth={1.75} />,
  potential_meeting: <Link2 size={14} strokeWidth={1.75} />,
  email: <Mail size={14} strokeWidth={1.75} />,
  task: <ListTodo size={14} strokeWidth={1.75} />,
  reminder: <Bell size={14} strokeWidth={1.75} />,
}

interface Props {
  open: boolean
  onClose: () => void
  activity: ScheduledActivity | null
  profiles: Profile[]
  companies: Company[]
  onEdit: (a: ScheduledActivity) => void
  onChanged: () => void
}

/**
 * Read-only activity detail modal. Shown when the user left-clicks a
 * Kanban card. Contains an Edit button that hands off to the editing
 * modal.  Includes a comments thread.
 */
export function ActivityInfoModal({
  open, onClose, activity, profiles, companies, onEdit, onChanged,
}: Props) {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user?.role === 'admin'
  const [expanded, setExpanded] = useState(true)
  const [draft, setDraft] = useState('')

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [profiles])

  const companyMap = useMemo(() => {
    const m: Record<string, Company> = {}
    companies.forEach((c) => (m[c.id] = c))
    return m
  }, [companies])

  if (!activity) return null

  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const sMeta = ACTIVITY_STATUS_META[activity.status]
  const color = activity.color || tMeta.color
  const owner = profileMap[activity.owner_id]
  const company = activity.company_id ? companyMap[activity.company_id] : null
  const canManage = !!user && (activity.owner_id === user.id || isAdmin)
  const startDate = new Date(activity.scheduled_at)
  const endDate = new Date(startDate.getTime() + (activity.duration_min || 30) * 60_000)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2 pr-6">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-white"
            style={{ background: color }}
          >
            {TYPE_ICON[activity.type]}
          </span>
          <span className="flex-1 truncate text-base font-semibold">
            {activity.title || tMeta.label}
          </span>
        </div>
      }
      desc={
        <span className="flex flex-wrap items-center gap-2 text-2xs">
          <Badge tone={sMeta.tone} dot>{sMeta.label}</Badge>
          <Badge tone="neutral">{tMeta.label}</Badge>
          {activity.visible_on_calendar === false && (
            <Badge tone="neutral">Hidden from calendar</Badge>
          )}
        </span>
      }
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          {canManage && (
            <>
              <Button size="sm" icon={<Pencil size={13} strokeWidth={1.75} />} onClick={() => onEdit(activity)} className="ml-auto">
                Edit
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Quick facts */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fact icon={<UserIcon size={13} strokeWidth={1.75} />} label="Owner">
            <span className="flex items-center gap-1.5">
              <Avatar name={owner?.full_name || '?'} color={owner?.avatar_color} url={owner?.avatar_url} size={18} />
              <span className="truncate">{owner?.full_name || 'Unknown'}</span>
            </span>
          </Fact>
          <Fact icon={<Building2 size={13} strokeWidth={1.75} />} label="Linked lead">
            {company ? company.name : <span className="text-ink-400">— no linked lead —</span>}
          </Fact>
          <Fact icon={<Calendar size={13} strokeWidth={1.75} />} label="When">
            <span className="text-ink">{dateLong(activity.scheduled_at)}</span>
          </Fact>
          <Fact icon={<Clock size={13} strokeWidth={1.75} />} label="Duration">
            {activity.duration_min} min <span className="text-ink-400">· ends {endDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}</span>
          </Fact>
          <Fact icon={<Clock size={13} strokeWidth={1.75} />} label="Time">
            <span className="num">{startDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}</span>
          </Fact>
        </div>

        {/* Notes (collapsible) */}
        {activity.notes && (
          <div className="rounded-xl border border-line bg-ink-50/40">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-ink-700"
            >
              <MessageSquare size={13} strokeWidth={1.75} className="text-ink-400" />
              Notes
              <motion.span animate={{ rotate: expanded ? 0 : -90 }} className="ml-auto">
                <ChevronDown size={14} strokeWidth={1.75} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <p className="whitespace-pre-wrap px-3 pb-3 text-sm text-ink-700">{activity.notes}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Comments thread */}
        <CommentsBlock activityId={activity.id} profiles={profiles} currentUserId={user?.id || ''} isAdmin={isAdmin} onChanged={onChanged} />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */
function CommentsBlock({
  activityId, profiles, currentUserId, isAdmin, onChanged,
}: {
  activityId: string
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
  onChanged: () => void
}) {
  const { push } = useToast()
  const { data, reload } = useAsync(async () => db.listActivityComments(activityId), [activityId])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [profiles])

  const comments: ActivityComment[] = data || []

  async function post() {
    const body = text.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await db.createActivityComment(activityId, currentUserId, body)
      setText('')
      reload()
      onChanged()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not post', desc: e?.message })
    } finally {
      setPosting(false)
    }
  }

  async function remove(id: string) {
    try {
      await db.deleteActivityComment(id)
      reload()
      onChanged()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div className="rounded-xl border border-line">
      <p className="flex items-center gap-2 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-400">
        <MessageSquare size={12} strokeWidth={1.75} /> Comments ({comments.length})
      </p>
      <div className="space-y-2.5 px-3 pb-2 max-h-44 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="py-3 text-center text-2xs text-ink-400">No comments yet. Be the first to chime in.</p>
        ) : (
          comments.map((c) => {
            const author = profileMap[c.author_id]
            const mine = c.author_id === currentUserId
            return (
              <div key={c.id} className="group flex items-start gap-2.5">
                <Avatar name={author?.full_name || '?'} color={author?.avatar_color} url={author?.avatar_url} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{author?.full_name || 'Unknown'}</p>
                    <span className="text-2xs text-ink-400">{dateLong(c.created_at)}</span>
                    {(mine || isAdmin) && (
                      <button onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-neg transition-colors" title="Delete comment">
                        <Trash2 size={11} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{c.body}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-line p-2">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="flex-1 !h-auto !py-2" />
        <Button size="sm" onClick={post} disabled={!text.trim() || posting} icon={<Send size={13} strokeWidth={1.75} />}>
          {posting ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-ink-50/60 px-3 py-2">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <div className="mt-0.5 truncate text-sm text-ink-700">{children}</div>
      </div>
    </div>
  )
}
