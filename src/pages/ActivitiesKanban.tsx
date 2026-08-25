import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Phone, Users, Link2, Mail, ListTodo, Bell, MoreHorizontal,
  Pencil, Trash2, Check, X, Play, Eye, CalendarClock, AlarmClockOff, CheckCheck,
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

/** Per-status accent used for column headers & drop glows. */
const STATUS_ACCENT: Record<ScheduledActivityStatus, string> = {
  planned: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#737373',
  no_show: '#ef4444',
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Native drag event union (DOM globals). */
type DragEvt = globalThis.MouseEvent | globalThis.TouchEvent | globalThis.PointerEvent

/** Pointer position from whatever native event framer hands us. */
function clientPoint(e: DragEvt): { x: number; y: number } {
  if ('clientX' in e && typeof e.clientX === 'number') return { x: e.clientX, y: (e as PointerEvent).clientY }
  const te = e as TouchEvent
  const t = te.changedTouches?.[0] || te.touches?.[0]
  return t ? { x: t.clientX, y: t.clientY } : { x: -9999, y: -9999 }
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

  /* Motion-drag state */
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ScheduledActivityStatus | null>(null)
  /** Timestamp of the last real drag release — clicks within 250ms of a
   *  drag end are drag artifacts, not user clicks. */
  const lastDragEnd = useRef(0)

  /* Optimistic overrides so cards fly into their new column instantly */
  const [override, setOverride] = useState<Record<string, ScheduledActivityStatus>>({})
  useEffect(() => { setOverride({}) }, [activities])

  const isAdmin = user?.role === 'admin'

  /* Kanban is always personal — only the current user's own activities. */
  const visible = useMemo(
    () => (user ? activities.filter((a) => a.owner_id === user.id) : []),
    [activities, user?.id],
  )

  const effStatus = (a: ScheduledActivity): ScheduledActivityStatus => override[a.id] ?? a.status

  const byStatus = useMemo(() => {
    const m: Record<ScheduledActivityStatus, ScheduledActivity[]> = {
      planned: [], in_progress: [], completed: [], cancelled: [], no_show: [],
    }
    const sorted = [...visible].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    )
    sorted.forEach((a) => { m[effStatus(a)]?.push(a) })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, override])

  /* Header mini-stats */
  const strip = useMemo(() => {
    const t0 = startOfToday()
    const t1 = t0 + 86400000
    const active = new Set<ScheduledActivityStatus>(['planned', 'in_progress'])
    let today = 0
    let overdue = 0
    let doneWeek = 0
    for (const a of visible) {
      const st = effStatus(a)
      const t = new Date(a.scheduled_at).getTime()
      if (st === 'completed' && t >= t0 - 7 * 86400000 && t < t1) doneWeek++
      if (!active.has(st)) continue
      if (t >= t0 && t < t1) today++
      else if (t < t0) overdue++
    }
    return { today, overdue, doneWeek }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, override])

  function canManage(a: ScheduledActivity) {
    return !!user && (a.owner_id === user.id || user.role === 'admin')
  }

  function openNew() { setEditing(null); setEditOpen(true) }
  function openEdit(a: ScheduledActivity) { setEditing(a); setEditOpen(true) }
  function openInfo(a: ScheduledActivity) { setInfoActivity(a); setInfoOpen(true) }

  /* Left-click opens the read-only info modal — unless the pointer just
     finished a real drag (framer fires click on release). */
  function onCardClick(a: ScheduledActivity) {
    if (Date.now() - lastDragEnd.current < 250) return
    openInfo(a)
  }

  function cardContextItems(a: ScheduledActivity): CtxItem[] {
    const items: CtxItem[] = [
      { label: 'Open', icon: <Eye size={14} strokeWidth={1.75} />, onClick: () => openInfo(a) },
    ]
    if (canManage(a)) {
      items.push(
        { divider: true },
        { label: 'Edit', icon: <Pencil size={14} strokeWidth={1.75} />, onClick: () => openEdit(a) },
        { label: 'Mark in progress', icon: <Play size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'in_progress'), disabled: effStatus(a) === 'in_progress' },
        { label: 'Mark done', icon: <Check size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'completed'), disabled: effStatus(a) === 'completed' },
        { label: 'Mark no-show', icon: <X size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'no_show'), disabled: effStatus(a) === 'no_show' },
        { label: 'Cancel activity', icon: <X size={14} strokeWidth={1.75} />, onClick: () => setStatus(a, 'cancelled'), disabled: effStatus(a) === 'cancelled' },
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

  function colFromPoint(x: number, y: number): ScheduledActivityStatus | null {
    for (const s of KANBAN_COLUMNS) {
      const el = document.querySelector<HTMLElement>(`[data-kanban-col="${s}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s
    }
    return null
  }

  async function commitMove(a: ScheduledActivity, target: ScheduledActivityStatus) {
    if (target === effStatus(a)) return
    if (!canManage(a)) {
      push({ tone: 'error', title: 'Not allowed', desc: 'You can only move your own activities.' })
      return
    }
    const prev = effStatus(a)
    setOverride((o) => ({ ...o, [a.id]: target })) // fly immediately
    try {
      await db.updateScheduledActivity(a.id, { status: target })
      push({ tone: 'success', title: `Moved to ${ACTIVITY_STATUS_META[target].label}` })
    } catch (e: any) {
      setOverride((o) => ({ ...o, [a.id]: prev }))
      push({ tone: 'error', title: 'Could not move', desc: e?.message })
    } finally {
      reload()
    }
  }

  return (
    <PageContainer>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kanban</h1>
          <p className="mt-1 text-sm text-ink-400">
            Latest activities on top. Drag a card between stages — it saves instantly. Click for details, right-click for actions.
          </p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={openNew}>New activity</Button>
      </div>

      {/* Mini stats strip */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          <StripPill icon={<CalendarClock size={12} strokeWidth={2} />} label="Today" value={strip.today} cls="border-info/25 bg-infoBg text-info" delay={0} />
          <StripPill icon={<AlarmClockOff size={12} strokeWidth={2} />} label="Overdue" value={strip.overdue} cls="border-neg/25 bg-negBg text-neg" delay={0.06} />
          <StripPill icon={<CheckCheck size={12} strokeWidth={2} />} label="Done · 7 days" value={strip.doneWeek} cls="border-pos/25 bg-posBg text-pos" delay={0.12} />
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        {/* Board */}
        <div className="min-w-0">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {KANBAN_COLUMNS.map((s) => <Skeleton key={s} className="h-72 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {KANBAN_COLUMNS.map((status, ci) => {
                const meta = ACTIVITY_STATUS_META[status]
                const cards = byStatus[status]
                const accent = STATUS_ACCENT[status]
                const isTarget = dragId != null && dragOver === status
                /* When one of THIS column's cards is being dragged we
                   lift the whole column above its siblings and release
                   the scroll clipping so the card floats over every
                   other column while in transit. */
                const draggingFromHere = dragId != null && cards.some((c) => c.id === dragId)
                return (
                  <motion.div
                    key={status}
                    data-kanban-col={status}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: isTarget ? 1.015 : 1,
                    }}
                    transition={{ duration: 0.35, delay: ci * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className={`relative flex flex-col rounded-2xl border p-2 transition-colors duration-150 ${
                      draggingFromHere
                        ? 'z-40 border-line bg-ink-50/40'
                        : isTarget
                          ? 'z-10 border-info bg-infoBg/50 shadow-[0_0_0_4px_rgba(59,130,246,0.10)]'
                          : dragId != null && dragOver != null
                            ? 'border-line bg-ink-50/40 opacity-70'
                            : 'border-line bg-ink-50/40'
                    }`}
                  >
                    {/* Column header */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                      <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">{meta.label}</p>
                      <span
                        className={`num ml-auto rounded-full px-1.5 text-2xs font-bold ${
                          cards.length > 0 ? 'text-white' : 'bg-ink-100 text-ink-400 dark:bg-ink-200'
                        }`}
                        style={cards.length > 0 ? { background: `${accent}cc` } : undefined}
                      >
                        {cards.length}
                      </span>
                    </div>

                    <div className={`mt-1 flex-1 space-y-2 px-0.5 pb-0.5 ${draggingFromHere ? 'overflow-visible' : 'overflow-y-auto max-h-[70vh]'}`}>
                      {cards.length === 0 ? (
                        <div
                          className={`mt-1 flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-center transition-colors ${
                            isTarget ? 'border-info/50 bg-infoBg/30' : 'border-line'
                          }`}
                        >
                          <Plus size={14} strokeWidth={1.75} className="text-ink-300" />
                          <p className="px-3 text-2xs text-ink-300">Drop activities here</p>
                        </div>
                      ) : (
                        cards.map((a, i) => (
                          <KanbanCard
                            key={a.id}
                            activity={a}
                            index={i}
                            dragging={dragId === a.id}
                            dimmed={dragId != null && dragId !== a.id}
                            draggable={canManage(a)}
                            done={effStatus(a) === 'completed'}
                            onClick={() => onCardClick(a)}
                            onContext={(e) => openContextMenu(e, cardContextItems(a))}
                            onDragStart={() => { setDragId(a.id); setDragOver(status) }}
                            onDragMove={(e) => setDragOver(colFromPoint(clientPoint(e).x, clientPoint(e).y))}
                            onDragEnd={(e) => {
                              lastDragEnd.current = Date.now()
                              const target = colFromPoint(clientPoint(e).x, clientPoint(e).y)
                              setDragId(null)
                              setDragOver(null)
                              if (target) commitMove(a, target)
                            }}
                            profileMap={profileMap}
                            companyMap={companyMap}
                            onQuickDone={() => setStatus(a, 'completed')}
                          />
                        ))
                      )}
                    </div>
                  </motion.div>
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

      <KanbanHint />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Strip pill                                                          */
/* ------------------------------------------------------------------ */
function StripPill({ icon, label, value, cls, delay }: { icon: React.ReactNode; label: string; value: number; cls: string; delay: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, delay }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${cls}`}
    >
      {icon}
      {label}
      <span className="num font-black">{value}</span>
    </motion.span>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */
function KanbanCard({
  activity, index, dragging, dimmed, draggable, done, onClick, onContext,
  onDragStart, onDragMove, onDragEnd, profileMap, companyMap, onQuickDone,
}: {
  activity: ScheduledActivity
  index: number
  dragging: boolean
  dimmed: boolean
  draggable: boolean
  done: boolean
  onClick: () => void
  onContext: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDragMove: (e: DragEvt) => void
  onDragEnd: (e: DragEvt) => void
  profileMap: Record<string, any>
  companyMap: Record<string, any>
  onQuickDone: () => void
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const color = activity.color || tMeta.color
  const owner = profileMap[activity.owner_id]
  const company = activity.company_id ? companyMap[activity.company_id] : null

  /* Urgency vs today */
  const t0 = startOfToday()
  const t = new Date(activity.scheduled_at).getTime()
  const overdue = t < t0 && ['planned', 'in_progress'].includes(activity.status)
  const isToday = t >= t0 && t < t0 + 86400000

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{
        opacity: dimmed ? 0.45 : 1,
        y: 0,
        scale: dragging ? 1.05 : 1,
        rotate: dragging ? -1.2 : 0,
      }}
      transition={
        dragging
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 380, damping: 30, delay: Math.min(index * 0.03, 0.24) }
      }
      drag={draggable}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={onDragStart}
      whileDrag={{ boxShadow: '0 22px 48px -14px rgba(0,0,0,0.38)' }}
      onDrag={(e) => onDragMove(e as DragEvt)}
      onDragEnd={(e) => onDragEnd(e as DragEvt)}
      onClick={onClick}
      onContextMenu={onContext}
      style={{ borderLeftColor: color, borderLeftWidth: 3, touchAction: draggable ? 'pan-y' : undefined, zIndex: dragging ? 60 : undefined }}
      className={`group relative cursor-pointer rounded-xl border bg-surface p-3 transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-md ${
        dragging ? 'cursor-grabbing border-info/50 shadow-xl' : 'border-line shadow-sm'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: color }}>
          {TYPE_ICON[activity.type]}
        </span>
        <p className="flex-1 truncate text-sm font-medium">{activity.title || tMeta.label}</p>

        {/* Quick-complete on hover */}
        {draggable && !done && (
          <button
            title="Mark done"
            onClick={(e) => { e.stopPropagation(); onQuickDone() }}
            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-pos text-white opacity-0 shadow-md ring-2 ring-surface transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Check size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="capitalize">{tMeta.label}</Badge>
        {company && (
          <Badge tone="info">{company.name}</Badge>
        )}
        {overdue ? (
          <Badge tone="neg" dot>Overdue</Badge>
        ) : isToday && !done ? (
          <Badge tone="warn" dot>Today</Badge>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Avatar name={owner?.full_name || '?'} color={owner?.avatar_color} url={owner?.avatar_url} size={22} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs text-ink-500">{owner?.full_name || 'Unknown'}</p>
          <p className={`num text-2xs ${overdue ? 'font-semibold text-neg' : 'text-ink-400'}`}>
            {dateShort(activity.scheduled_at)} · {activity.duration_min}m
          </p>
        </div>
        <MoreHorizontal size={14} strokeWidth={1.75} className="text-ink-300 opacity-0 group-hover:opacity-100" />
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Footer hint                                                         */
/* ------------------------------------------------------------------ */
function KanbanHint() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 0.5 }}
      className="mt-6 text-center text-2xs text-ink-300"
    >
      Tip: on touch devices drag horizontally between columns, or use the green ✓ to complete a card instantly.
    </motion.p>
  )
}
