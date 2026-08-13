import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Phone, Users, Link2, Mail, ListTodo, Bell, MoreHorizontal,
  Pencil, Trash2, Check, X, Play, Eye,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useActivitiesData } from '../lib/hooks/useActivitiesData'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { ActivityModal } from '../components/ActivityModal'
import { ActivityInfoModal } from '../components/ActivityInfoModal'
import { ActivitiesStatsPanel } from '../components/ActivitiesStatsPanel'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { db } from '../lib/db'
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_STATUS_META,
  KANBAN_COLUMNS,
} from '../lib/types'
import type { ScheduledActivityType, ScheduledActivityStatus, ScheduledActivity } from '../lib/types'
import { dateShort } from '../lib/format'

const TYPE_ICON: Record<ScheduledActivityType, React.ReactNode> = {
  call: <Phone size={11} strokeWidth={1.75} />,
  meeting: <Users size={11} strokeWidth={1.75} />,
  potential_meeting: <Link2 size={11} strokeWidth={1.75} />,
  email: <Mail size={11} strokeWidth={1.75} />,
  task: <ListTodo size={11} strokeWidth={1.75} />,
  reminder: <Bell size={11} strokeWidth={1.75} />,
}

export default function ActivitiesKanban() {
  const { user } = useAuth()
  const { push } = useToast()
  const {
    loading, reload, activities, profiles, companies, deals,
    profileMap, companyMap, stats,
  } = useActivitiesData()
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledActivity | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoActivity, setInfoActivity] = useState<ScheduledActivity | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ScheduledActivityStatus | null>(null)

  const isAdmin = user?.role === 'admin'

  /* Kanban is always personal — only the current user's own activities. */
  const visible = useMemo(
    () => (user ? activities.filter((a) => a.owner_id === user.id) : []),
    [activities, user?.id],
  )

  const byStatus = useMemo(() => {
    const m: Record<ScheduledActivityStatus, ScheduledActivity[]> = {
      planned: [], in_progress: [], completed: [], cancelled: [], no_show: [],
    }
    visible.forEach((a) => { m[a.status]?.push(a) })
    return m
  }, [visible])

  function canManage(a: ScheduledActivity) {
    return !!user && (a.owner_id === user.id || user.role === 'admin')
  }

  function openNew() { setEditing(null); setEditOpen(true) }
  function openEdit(a: ScheduledActivity) { setEditing(a); setEditOpen(true) }
  function openInfo(a: ScheduledActivity) { setInfoActivity(a); setInfoOpen(true) }

  /* Left-click on a card opens the read-only info modal; from there,
     the user can hit "Edit" to switch to the edit modal. */
  function onCardClick(a: ScheduledActivity) { openInfo(a) }

  function cardContextItems(a: ScheduledActivity): CtxItem[] {
    const items: CtxItem[] = [
      { label: 'Open', icon: <Eye size={14} strokeWidth={1.75} />, onClick: () => openInfo(a) },
    ]
    if (canManage(a)) {
      items.push(
        { divider: true },
        { label: 'Edit', icon: <Pencil size={14} strokeWidth={1.75} />, onClick: () => openEdit(a) },
        { label: 'Mark in progress', icon: <Play size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'in_progress'), disabled: a.status === 'in_progress' },
        { label: 'Mark done', icon: <Check size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'completed'), disabled: a.status === 'completed' },
        { label: 'Mark no-show', icon: <X size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'no_show'), disabled: a.status === 'no_show' },
        { label: 'Cancel activity', icon: <X size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'cancelled'), disabled: a.status === 'cancelled' },
        { divider: true },
        { label: 'Delete', danger: true, icon: <Trash2 size={14} strokeWidth={1.75} />, onClick: () => destroy(a) },
      )
    }
    return items
  }

  async function setStatus(a: ScheduledActivity, status: ScheduledActivityStatus) {
    if (!canManage(a)) return
    try {
      await db.updateScheduledActivity(a.id, { status })
      push({ tone: 'success', title: `Marked ${ACTIVITY_STATUS_META[status].label}` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function destroy(a: ScheduledActivity) {
    if (!canManage(a)) return
    if (!confirm('Delete this activity?')) return
    try {
      await db.deleteScheduledActivity(a.id)
      push({ tone: 'success', title: 'Activity deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function onDrop(status: ScheduledActivityStatus) {
    setDragOver(null)
    if (!dragId) return
    const a = activities.find((x) => x.id === dragId)
    setDragId(null)
    if (!a || a.status === status) return
    if (!canManage(a)) {
      push({ tone: 'error', title: 'Not allowed', desc: 'You can only move your own activities.' })
      return
    }
    try {
      await db.updateScheduledActivity(a.id, { status })
      push({ tone: 'success', title: `Moved to ${ACTIVITY_STATUS_META[status].label}` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not move', desc: e?.message })
    }
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kanban</h1>
          <p className="mt-1 text-sm text-ink-400">Your personal board. Drag cards across stages to update their status. Click a card to see details, right-click to edit.</p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={openNew}>New activity</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        {/* Board */}
        <div className="min-w-0">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {KANBAN_COLUMNS.map((s) => <Skeleton key={s} className="h-72 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {KANBAN_COLUMNS.map((status) => {
                const meta = ACTIVITY_STATUS_META[status]
                const cards = byStatus[status]
                return (
                  <div
                    key={status}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(status) }}
                    onDragLeave={() => setDragOver((v) => (v === status ? null : v))}
                    onDrop={() => onDrop(status)}
                    className={`flex flex-col rounded-2xl border p-2 transition-colors ${
                      dragOver === status ? 'border-info bg-infoBg/40' : 'border-line bg-ink-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">{meta.label}</p>
                      <span className="rounded-full bg-ink-100 px-1.5 text-2xs font-medium text-ink-500">{cards.length}</span>
                    </div>

                    <div className="mt-1 flex-1 space-y-2 overflow-y-auto max-h-[70vh]">
                      {cards.length === 0 ? (
                        <p className="px-2 py-3 text-center text-2xs text-ink-300">Drop activities here</p>
                      ) : (
                        cards.map((a) => (
                          <KanbanCard
                            key={a.id}
                            activity={a}
                            draggable={canManage(a)}
                            onClick={() => onCardClick(a)}
                            onContext={(e) => openContextMenu(e, cardContextItems(a))}
                            onDragStart={() => setDragId(a.id)}
                            onDragEnd={() => setDragId(null)}
                            profileMap={profileMap}
                            companyMap={companyMap}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right-side stats */}
        <div className="order-first xl:order-last">
          <ActivitiesStatsPanel
            loading={loading}
            isAdmin={isAdmin}
            activities={activities}
            companies={companies}
            deals={deals}
            profiles={profiles}
            selfStats={stats}
            selfProfile={user || null}
          />
        </div>
      </div>

      {/* Edit modal */}
      <ActivityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={reload}
        activity={editing}
        profiles={profiles}
        companies={companies}
        defaultOwnerId={user?.id || ''}
      />

      {/* Info modal (read-only, with Edit button) */}
      <ActivityInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        activity={infoActivity}
        profiles={profiles}
        companies={companies}
        onEdit={(a) => { setInfoOpen(false); openEdit(a) }}
        onChanged={reload}
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */
function KanbanCard({
  activity, draggable, onClick, onContext, onDragStart, onDragEnd, profileMap, companyMap,
}: {
  activity: ScheduledActivity
  draggable: boolean
  onClick: () => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDragEnd: () => void
  profileMap: Record<string, any>
  companyMap: Record<string, any>
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const color = activity.color || tMeta.color
  const owner = profileMap[activity.owner_id]
  const company = activity.company_id ? companyMap[activity.company_id] : null
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContext}
      className="group cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-sm hover:border-ink-200 transition-colors"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: color }}>
          {TYPE_ICON[activity.type]}
        </span>
        <p className="flex-1 truncate text-sm font-medium">{activity.title || tMeta.label}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="capitalize">{tMeta.label}</Badge>
        {company && (
          <Badge tone="info">{company.name}</Badge>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Avatar name={owner?.full_name || '?'} color={owner?.avatar_color} url={owner?.avatar_url} size={22} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs text-ink-500">{owner?.full_name || 'Unknown'}</p>
          <p className="text-2xs text-ink-400">{dateShort(activity.scheduled_at)} · {activity.duration_min}m</p>
        </div>
        <MoreHorizontal size={14} strokeWidth={1.75} className="text-ink-300 opacity-0 group-hover:opacity-100" />
      </div>
    </motion.div>
  )
}
