import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Phone, Users, Link2, Mail, ListTodo, Bell, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useActivitiesData } from '../lib/hooks/useActivitiesData'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { ActivityModal } from '../components/ActivityModal'
import { ActivitiesStatsPanel } from '../components/ActivitiesStatsPanel'
import { useToast } from '../context/ToastContext'
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
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledActivity | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ScheduledActivityStatus | null>(null)

  const isAdmin = user?.role === 'admin'

  // Kanban is always personal — only the current user's own activities.
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

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(a: ScheduledActivity) { setEditing(a); setModalOpen(true) }

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
          <p className="mt-1 text-sm text-ink-400">Your personal board. Drag cards across stages to update their status.</p>
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
                            onClick={() => openEdit(a)}
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

      <ActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        activity={editing}
        profiles={profiles}
        companies={companies}
        defaultOwnerId={user?.id || ''}
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */
function KanbanCard({
  activity, draggable, onClick, onDragStart, onDragEnd, profileMap, companyMap,
}: {
  activity: ScheduledActivity
  draggable: boolean
  onClick: () => void
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
