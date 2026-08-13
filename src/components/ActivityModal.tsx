import { useEffect, useMemo, useState } from 'react'
import { Calendar, Trash2, MessageSquare, Pencil, Plus, EyeOff, Eye } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Textarea, Select, Field } from './ui/Input'
import { Avatar } from './ui/Avatar'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import { useAsync } from '../lib/hooks/useAsync'
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_TYPES,
  ACTIVITY_STATUS_META,
  KANBAN_COLUMNS,
  ACTIVITY_COLOR_PALETTE,
} from '../lib/types'
import type { ScheduledActivityType, ScheduledActivityStatus, ScheduledActivity, Company, Profile, ActivityComment } from '../lib/types'
import { dateLong } from '../lib/format'

type Draft = {
  title: string
  type: ScheduledActivityType
  status: ScheduledActivityStatus
  notes: string
  color: string
  scheduledAt: string
  durationMin: number
  companyId: string
  ownerId: string
  visibleOnCalendar: boolean
}

function isoToLocalInput(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function localInputToIso(s: string): string {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export function ActivityModal({
  open,
  onClose,
  onSaved,
  activity,
  profiles,
  companies,
  defaultOwnerId,
  defaultDate,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  activity: ScheduledActivity | null
  profiles: Profile[]
  companies: Company[]
  defaultOwnerId: string
  defaultDate?: string
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'edit' | 'comments'>('edit')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!open) return
    if (activity) {
      setDraft({
        title: activity.title,
        type: activity.type,
        status: activity.status,
        notes: activity.notes,
        color: activity.color,
        scheduledAt: isoToLocalInput(activity.scheduled_at),
        durationMin: activity.duration_min,
        companyId: activity.company_id || '',
        ownerId: activity.owner_id,
        visibleOnCalendar: activity.visible_on_calendar !== false,
      })
      setTab('edit')
    } else {
      const initIso = defaultDate ? localInputToIso(defaultDate) : new Date(Date.now() + 3600_000).toISOString()
      setDraft({
        title: '',
        type: 'meeting',
        status: 'planned',
        notes: '',
        color: '',
        scheduledAt: isoToLocalInput(initIso),
        durationMin: 30,
        companyId: '',
        ownerId: defaultOwnerId,
        visibleOnCalendar: true,
      })
      setTab('edit')
    }
  }, [open, activity, defaultDate, defaultOwnerId])

  /* The companies the current user can link to:
     - admins: any company
     - sellers: only companies they own (created_by === user.id)
     For other users' activities (admin editing), we still want to show all
     companies for admins. */
  const linkableCompanies = useMemo(() => {
    if (isAdmin) return companies
    return companies.filter((c) => c.created_by === user?.id)
  }, [companies, user?.id, isAdmin])

  if (!draft || !user) return null

  const isEditing = !!activity
  const canManage = !activity || activity.owner_id === user.id || isAdmin

  async function save() {
    if (!draft || !user) return
    if (!draft.title.trim()) {
      push({ tone: 'error', title: 'Title required' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        owner_id: draft.ownerId || user.id,
        type: draft.type,
        status: draft.status,
        title: draft.title.trim(),
        notes: draft.notes,
        color: draft.color,
        scheduled_at: localInputToIso(draft.scheduledAt),
        duration_min: Number(draft.durationMin) || 30,
        company_id: draft.companyId || null,
        visible_on_calendar: draft.visibleOnCalendar,
      }
      if (isEditing && activity) {
        await db.updateScheduledActivity(activity.id, payload)
        push({ tone: 'success', title: 'Activity updated' })
      } else {
        await db.createScheduledActivity(payload as never)
        push({ tone: 'success', title: 'Activity created' })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  async function destroy() {
    if (!activity) return
    if (!confirm('Delete this activity? Comments will be lost.')) return
    try {
      await db.deleteScheduledActivity(activity.id)
      push({ tone: 'success', title: 'Activity deleted' })
      onClose()
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Calendar size={18} strokeWidth={1.75} className="text-info" />
          {isEditing ? 'Edit activity' : 'New activity'}
        </div>
      }
      desc={isEditing && activity ? `${ACTIVITY_TYPE_META[activity.type].label} · ${dateLong(activity.scheduled_at)}` : 'A meeting, call, or task for your schedule.'}
      size="md"
      footer={
        <>
          {isEditing && canManage && (
            <Button variant="danger" icon={<Trash2 size={14} strokeWidth={1.75} />} onClick={destroy} className="mr-auto">Delete</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {canManage && (
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create activity'}
            </Button>
          )}
        </>
      }
    >
      {/* Tabs */}
      {isEditing && (
        <div className="mb-4 flex items-center gap-1 rounded-xl bg-ink-50 p-1">
          <button
            onClick={() => setTab('edit')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'edit' ? 'bg-surface text-ink shadow-sm' : 'text-ink-400 hover:text-ink'}`}
          >
            <Pencil size={13} strokeWidth={1.75} /> Details
          </button>
          <button
            onClick={() => setTab('comments')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'comments' ? 'bg-surface text-ink shadow-sm' : 'text-ink-400 hover:text-ink'}`}
          >
            <MessageSquare size={13} strokeWidth={1.75} /> Comments
          </button>
        </div>
      )}

      {tab === 'edit' ? (
        <div className="space-y-4">
          <Field label="Title" required>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Discovery call with ACME" disabled={!canManage} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ScheduledActivityType })} disabled={!canManage}>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_TYPE_META[t].label}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ScheduledActivityStatus })} disabled={!canManage}>
                {KANBAN_COLUMNS.map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_META[s].label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="When" required>
              <Input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} disabled={!canManage} />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={5} step={5} value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} disabled={!canManage} />
            </Field>
          </div>

          {isAdmin && (
            <Field label="Owner" hint="Admins can assign activities to other members">
              <Select value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.role}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Linked lead" hint={isAdmin ? 'Optional — admin can link to any lead.' : 'Optional — only leads you own can be linked. You can also create an unlinked meeting.'}>
            <Select value={draft.companyId} onChange={(e) => setDraft({ ...draft, companyId: e.target.value })} disabled={!canManage}>
              <option value="">— No linked lead —</option>
              {linkableCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>

          <Field label="Color" hint="Pick a highlight color, or leave empty to use the type default.">
            <div className="flex flex-wrap items-center gap-2">
              {ACTIVITY_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canManage}
                  onClick={() => setDraft({ ...draft, color: draft.color === c ? '' : c })}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${draft.color === c ? 'border-ink scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <button
                type="button"
                disabled={!canManage}
                onClick={() => setDraft({ ...draft, color: '' })}
                className="rounded-full border border-line px-2 py-1 text-2xs text-ink-400 hover:bg-ink-50"
              >
                Auto
              </button>
            </div>
          </Field>

          <Field label="Notes">
            <Textarea rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Agenda, prep notes, etc." disabled={!canManage} />
          </Field>

          {isAdmin && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-ink-50">
              <span className="mt-0.5 shrink-0">
                {draft.visibleOnCalendar ? (
                  <Eye size={16} strokeWidth={1.75} className="text-info" />
                ) : (
                  <EyeOff size={16} strokeWidth={1.75} className="text-ink-400" />
                )}
              </span>
              <span className="flex-1">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-700">Show in shared calendar</span>
                  <input
                    type="checkbox"
                    checked={draft.visibleOnCalendar}
                    onChange={(e) => setDraft({ ...draft, visibleOnCalendar: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-ink"
                  />
                </span>
                <span className="mt-0.5 block text-2xs text-ink-400">
                  When off, this meeting stays private — only you see it in your Kanban and calendar. Other members won't see it.
                </span>
              </span>
            </label>
          )}

          {!canManage && (
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-2xs text-ink-400">You can only view this activity. Switch to comments to leave a note.</p>
          )}
        </div>
      ) : (
        activity && <CommentsTab activityId={activity.id} profiles={profiles} currentUserId={user.id} isAdmin={isAdmin} />
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Comments tab                                                       */
/* ------------------------------------------------------------------ */
function CommentsTab({
  activityId, profiles, currentUserId, isAdmin,
}: {
  activityId: string
  profiles: Profile[]
  currentUserId: string
  isAdmin: boolean
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
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare size={20} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">No comments yet. Be the first to chime in.</p>
          </div>
        ) : (
          comments.map((c) => {
            const author = profileMap[c.author_id]
            const mine = c.author_id === currentUserId
            return (
              <div key={c.id} className="group flex items-start gap-3">
                <Avatar name={author?.full_name || '?'} color={author?.avatar_color} url={author?.avatar_url} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{author?.full_name || 'Unknown'}</p>
                    {(mine || isAdmin) && (
                      <button onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-neg transition-colors" title="Delete comment">
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  <p className="text-2xs text-ink-400">{dateLong(c.created_at)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{c.body}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-line pt-3">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="flex-1" />
        <Button onClick={post} disabled={!text.trim() || posting} icon={<Plus size={14} strokeWidth={1.75} />}>
          {posting ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  )
}