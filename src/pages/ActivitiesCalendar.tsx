import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, Phone, Users, Link2, Mail, ListTodo, Bell,
  Pencil, Trash2, Check, X, Play, Eye, EyeOff, ChevronDown, Clock, User as UserIcon,
  Building2, Calendar as CalIcon, Inbox,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useActivitiesData } from '../lib/hooks/useActivitiesData'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { ActivityModal } from '../components/ActivityModal'
import { ActivitiesStatsPanel } from '../components/ActivitiesStatsPanel'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { db } from '../lib/db'
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_STATUS_META,
} from '../lib/types'
import type { ScheduledActivityType, ScheduledActivityStatus, ScheduledActivity, Profile, Company } from '../lib/types'

const TYPE_ICON: Record<ScheduledActivityType, React.ReactNode> = {
  call: <Phone size={10} strokeWidth={2} />,
  meeting: <Users size={10} strokeWidth={2} />,
  potential_meeting: <Link2 size={10} strokeWidth={2} />,
  email: <Mail size={10} strokeWidth={2} />,
  task: <ListTodo size={10} strokeWidth={2} />,
  reminder: <Bell size={10} strokeWidth={2} />,
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const dayOfWeek = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(year, month, 1 - dayOfWeek)
  const out: Date[] = []
  for (let i = 0; i < 42; i++) {
    out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return out
}

export default function ActivitiesCalendar() {
  const { user } = useAuth()
  const { push } = useToast()
  const {
    loading, reload, activities, profiles, companies, deals,
    profileMap, companyMap, stats,
  } = useActivitiesData()

  const isAdmin = user?.role === 'admin'
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  /* Default to "Everyone" so all users can see other members' meetings.
     Only hidden meetings are excluded for non-owners. */
  const [scopeMine, setScopeMine] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledActivity | null>(null)
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined)
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null)
  const [rightClickedKey, setRightClickedKey] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (!user) return []
    if (scopeMine) return activities.filter((a) => a.owner_id === user.id)
    /* Calendar shows everyone's activities, but a meeting flagged as
       hidden (visible_on_calendar === false) is only shown to its
       owner — invisible to all other members. */
    return activities.filter((a) => a.visible_on_calendar !== false || a.owner_id === user.id)
  }, [activities, scopeMine, user])

  const grid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const activitiesByDay = useMemo(() => {
    const m: Record<string, ScheduledActivity[]> = {}
    visible.forEach((a) => {
      const key = toLocalDate(new Date(a.scheduled_at))
      if (!m[key]) m[key] = []
      m[key].push(a)
    })
    Object.values(m).forEach((arr) => arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))
    return m
  }, [visible])

  function canManage(a: ScheduledActivity) {
    return !!user && (a.owner_id === user.id || user.role === 'admin')
  }

  function openNew(date?: Date) {
    setEditing(null)
    setDefaultDate(date ? `${toLocalDate(date)}T10:00` : undefined)
    setModalOpen(true)
  }
  function openEdit(a: ScheduledActivity) { setEditing(a); setModalOpen(true) }

  function gotoPrev() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)) }
  function gotoNext() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) }
  function gotoToday() { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)) }

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

  function activityContextItems(a: ScheduledActivity): CtxItem[] {
    const items: CtxItem[] = [
      { label: 'Open', icon: <Eye size={14} strokeWidth={1.75} />, onClick: () => openEdit(a) },
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

  function cellContextItems(d: Date): CtxItem[] {
    const inMonth = d.getMonth() === cursor.getMonth()
    return [
      { label: `New activity on ${d.toLocaleDateString('en-IE')}`, icon: <Plus size={14} strokeWidth={1.75} />, onClick: () => openNew(d), disabled: !inMonth },
    ]
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-ink-400">
            {scopeMine ? 'Your scheduled meetings and calls.' : 'Everyone\'s scheduled activities across the platform. Tap a day to see all meetings on it.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line p-1">
            <button
              onClick={() => setScopeMine(true)}
              className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${scopeMine ? 'bg-ink text-white' : 'text-ink-500 hover:bg-ink-50'}`}
            >
              Mine
            </button>
            <button
              onClick={() => setScopeMine(false)}
              className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${!scopeMine ? 'bg-ink text-white' : 'text-ink-500 hover:bg-ink-50'}`}
            >
              Everyone
            </button>
          </div>
          <Button variant="secondary" icon={<ChevronLeft size={15} strokeWidth={1.75} />} onClick={gotoPrev} className="px-2.5" />
          <Button variant="secondary" onClick={gotoToday} className="px-3">Today</Button>
          <Button variant="secondary" iconRight={<ChevronRight size={15} strokeWidth={1.75} />} onClick={gotoNext} className="px-2.5" />
          <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => openNew()}>New activity</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        {/* Calendar grid */}
        <Card className="min-w-0">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-semibold">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</p>
            <p className="hidden sm:block text-2xs text-ink-400">{visible.length} {visible.length === 1 ? 'activity' : 'activities'} · click a day · right-click for actions</p>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 border-b border-line pb-1.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-1 text-center text-2xs font-medium uppercase tracking-wide text-ink-400">{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-1.5">
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === cursor.getMonth()
                const isToday = sameDay(d, today)
                const key = toLocalDate(d)
                const dayActivities = activitiesByDay[key] || []
                const cellKey = `${key}-${i}`
                const isHighlighted = rightClickedKey === cellKey
                return (
                  <div
                    key={i}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setRightClickedKey(cellKey)
                      openContextMenu(e, cellContextItems(d))
                      // Clear highlight after a moment if no other right-click happens
                      setTimeout(() => setRightClickedKey((cur) => (cur === cellKey ? null : cur)), 1600)
                    }}
                    onClick={() => { if (inMonth) setDayModalDate(d) }}
                    className={`group min-h-[72px] sm:min-h-[96px] cursor-pointer rounded-lg border p-1.5 transition-all ${
                      isHighlighted
                        ? 'border-ink ring-2 ring-ink/15 bg-ink-50/60'
                        : inMonth
                          ? 'border-line bg-surface hover:border-ink-200 hover:bg-ink-50/30'
                          : 'border-transparent bg-ink-50/30'
                    } ${isToday && !isHighlighted ? 'ring-1 ring-info/40' : ''}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-2xs font-medium ${
                          isToday ? 'bg-info text-white' : inMonth ? 'text-ink-600' : 'text-ink-300'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {inMonth && dayActivities.length > 0 && (
                        <span className="hidden sm:inline-block rounded-full bg-ink-100 px-1.5 text-2xs font-medium text-ink-500">{dayActivities.length}</span>
                      )}
                    </div>

                    {/* Mobile: just colored dots */}
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {dayActivities.slice(0, 6).map((a) => {
                        const c = a.color || ACTIVITY_TYPE_META[a.type].color
                        return <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                      })}
                      {dayActivities.length > 6 && <span className="text-2xs text-ink-400">+{dayActivities.length - 6}</span>}
                    </div>

                    {/* Desktop: chips */}
                    <div className="hidden sm:block space-y-1">
                      {dayActivities.slice(0, 2).map((a) => (
                        <CalendarChip
                          key={a.id}
                          activity={a}
                          onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                          onContext={(e) => { e.stopPropagation(); openContextMenu(e, activityContextItems(a)) }}
                        />
                      ))}
                      {dayActivities.length > 2 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDayModalDate(d) }}
                          className="text-2xs text-ink-400 hover:text-ink hover:underline"
                        >
                          +{dayActivities.length - 2} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-2xs text-ink-500">
            {(Object.keys(ACTIVITY_TYPE_META) as ScheduledActivityType[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: ACTIVITY_TYPE_META[t].color }} />
                {ACTIVITY_TYPE_META[t].label}
              </span>
            ))}
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-ink-400">
              <EyeOff size={11} strokeWidth={1.75} /> Hidden meetings only show for their owner.
            </span>
          </div>
        </Card>

        {/* Stats sidebar */}
        <div>
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

      {/* Day modal */}
      <DayModal
        date={dayModalDate}
        activities={dayModalDate ? (activitiesByDay[toLocalDate(dayModalDate)] || []) : []}
        profileMap={profileMap}
        companyMap={companyMap}
        currentUserId={user?.id || ''}
        isAdmin={isAdmin}
        onClose={() => setDayModalDate(null)}
        onNew={(d) => { setDayModalDate(null); openNew(d) }}
        onEdit={(a) => { setDayModalDate(null); openEdit(a) }}
        onContext={(e, a) => openContextMenu(e, activityContextItems(a))}
        onSetStatus={setStatus}
        onDelete={destroy}
      />

      {/* Edit modal */}
      <ActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        activity={editing}
        profiles={profiles}
        companies={companies}
        defaultOwnerId={user?.id || ''}
        defaultDate={defaultDate}
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Calendar chip on the day cell (desktop)                             */
/* ------------------------------------------------------------------ */
function CalendarChip({
  activity, onClick, onContext,
}: {
  activity: ScheduledActivity
  onClick: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const color = activity.color || tMeta.color
  const time = new Date(activity.scheduled_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  const hidden = activity.visible_on_calendar === false
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      onContextMenu={onContext}
      className="flex w-full items-center gap-1.5 rounded-md bg-surface px-1.5 py-1 text-left text-2xs transition-colors hover:brightness-95"
      style={{ borderLeft: `3px solid ${color}`, background: `${color}15`, opacity: hidden ? 0.55 : 1 }}
      title={`${tMeta.label}: ${activity.title || ''}${hidden ? ' · hidden from others' : ''}`}
    >
      <span className="shrink-0 text-ink-500 num">{time}</span>
      <span className="shrink-0" style={{ color }}>{TYPE_ICON[activity.type]}</span>
      <span className="truncate font-medium text-ink">{activity.title || tMeta.label}</span>
      {hidden && <EyeOff size={9} strokeWidth={2} className="shrink-0 text-ink-400" />}
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/* Day modal — shows every meeting on the chosen day                   */
/* ------------------------------------------------------------------ */
function DayModal({
  date, activities, profileMap, companyMap, currentUserId, isAdmin,
  onClose, onNew, onEdit, onContext, onSetStatus, onDelete,
}: {
  date: Date | null
  activities: ScheduledActivity[]
  profileMap: Record<string, Profile>
  companyMap: Record<string, Company>
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onNew: (d: Date) => void
  onEdit: (a: ScheduledActivity) => void
  onContext: (e: React.MouseEvent, a: ScheduledActivity) => void
  onSetStatus: (a: ScheduledActivity, s: ScheduledActivityStatus) => void
  onDelete: (a: ScheduledActivity) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!date) return null

  const isToday = sameDay(date, new Date())
  const dateLabel = date.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2 pr-6">
          <CalIcon size={18} strokeWidth={1.75} className="text-info" />
          <span className="truncate">{dateLabel}</span>
          {isToday && <Badge tone="info" className="ml-1">Today</Badge>}
        </div>
      }
      desc={
        <span className="text-2xs text-ink-400">
          {activities.length} {activities.length === 1 ? 'activity' : 'activities'} scheduled.
          {' '}Click an activity to expand its details.
        </span>
      }
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => onNew(date)} className="ml-auto">
            New activity on this day
          </Button>
        </div>
      }
    >
      {activities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Inbox size={24} strokeWidth={1.75} className="text-ink-300" />
          <p className="text-sm text-ink-400">Nothing scheduled on this day.</p>
          <Button variant="subtle" size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => onNew(date)}>
            Schedule something
          </Button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {activities.map((a) => (
            <DayActivityRow
              key={a.id}
              activity={a}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId((cur) => (cur === a.id ? null : a.id))}
              profileMap={profileMap}
              companyMap={companyMap}
              currentUserId={currentUserId}
              canManage={a.owner_id === currentUserId || isAdmin}
              onEdit={() => onEdit(a)}
              onContext={(e) => onContext(e, a)}
              onSetStatus={(s) => onSetStatus(a, s)}
              onDelete={() => onDelete(a)}
            />
          ))}
        </ul>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Activity row in the Day modal (expandable dropdown)                 */
/* ------------------------------------------------------------------ */
function DayActivityRow({
  activity, expanded, onToggle, profileMap, companyMap, canManage,
  onEdit, onContext, onSetStatus, onDelete,
}: {
  activity: ScheduledActivity
  expanded: boolean
  onToggle: () => void
  profileMap: Record<string, Profile>
  companyMap: Record<string, Company>
  currentUserId: string
  canManage: boolean
  onEdit: () => void
  onContext: (e: React.MouseEvent) => void
  onSetStatus: (s: ScheduledActivityStatus) => void
  onDelete: () => void
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const sMeta = ACTIVITY_STATUS_META[activity.status]
  const color = activity.color || tMeta.color
  const owner = profileMap[activity.owner_id]
  const company = activity.company_id ? companyMap[activity.company_id] : null
  const startDate = new Date(activity.scheduled_at)
  const endDate = new Date(startDate.getTime() + (activity.duration_min || 30) * 60_000)
  const startTime = startDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  const endTime = endDate.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  const hidden = activity.visible_on_calendar === false

  return (
    <li
      className={`overflow-hidden rounded-xl border transition-colors ${
        expanded ? 'border-ink-200 bg-ink-50/30' : 'border-line bg-surface hover:border-ink-200'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div
        onClick={onToggle}
        onContextMenu={onContext}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        <span className="w-12 shrink-0 text-right num text-2xs font-medium text-ink-600">{startTime}</span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: color }}>
          {TYPE_ICON[activity.type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{activity.title || tMeta.label}</p>
          <p className="truncate text-2xs text-ink-400">
            {owner?.full_name || 'Unknown'} · {tMeta.label}
            {company && <> · {company.name}</>}
            {hidden && <> · <span className="inline-flex items-center gap-0.5"><EyeOff size={9} strokeWidth={2} /> hidden</span></>}
          </p>
        </div>
        {hidden && <EyeOff size={12} strokeWidth={1.75} className="shrink-0 text-ink-400" />}
        <Badge tone={sMeta.tone} className="hidden sm:inline-flex shrink-0">{sMeta.label}</Badge>
        <motion.span animate={{ rotate: expanded ? 0 : -90 }} className="shrink-0 text-ink-400">
          <ChevronDown size={14} strokeWidth={1.75} />
        </motion.span>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-3 py-3 space-y-3">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-2 text-2xs">
                <Detail icon={<UserIcon size={11} strokeWidth={1.75} />} label="Led by">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={owner?.full_name || '?'} color={owner?.avatar_color} url={owner?.avatar_url} size={16} />
                    <span className="truncate">{owner?.full_name || 'Unknown'}</span>
                  </span>
                </Detail>
                <Detail icon={<Building2 size={11} strokeWidth={1.75} />} label="Linked lead">
                  {company ? company.name : <span className="text-ink-400">—</span>}
                </Detail>
                <Detail icon={<Clock size={11} strokeWidth={1.75} />} label="When">
                  <span className="num">{startTime} – {endTime}</span>
                </Detail>
                <Detail icon={<Clock size={11} strokeWidth={1.75} />} label="Duration">
                  {activity.duration_min} min
                </Detail>
                <Detail icon={<ListTodo size={11} strokeWidth={1.75} />} label="Type">
                  {tMeta.label}
                </Detail>
                <Detail icon={<Check size={11} strokeWidth={1.75} />} label="Status">
                  <Badge tone={sMeta.tone}>{sMeta.label}</Badge>
                </Detail>
              </div>

              {/* Purpose / notes */}
              {activity.notes && (
                <div className="rounded-lg bg-ink-50/60 p-2.5">
                  <p className="mb-0.5 text-2xs font-medium uppercase text-ink-400">Purpose / notes</p>
                  <p className="whitespace-pre-wrap text-sm text-ink-700">{activity.notes}</p>
                </div>
              )}

              {/* Action buttons (only for owner/admin) */}
              {canManage && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                  <Button variant="secondary" size="sm" icon={<Pencil size={12} strokeWidth={1.75} />} onClick={onEdit}>Edit</Button>
                  {activity.status !== 'in_progress' && (
                    <Button variant="ghost" size="sm" icon={<Play size={12} strokeWidth={1.75} />} onClick={() => onSetStatus('in_progress')}>Start</Button>
                  )}
                  {activity.status !== 'completed' && (
                    <Button variant="ghost" size="sm" icon={<Check size={12} strokeWidth={1.75} />} onClick={() => onSetStatus('completed')}>Done</Button>
                  )}
                  {activity.status !== 'no_show' && (
                    <Button variant="ghost" size="sm" icon={<X size={12} strokeWidth={1.75} />} onClick={() => onSetStatus('no_show')}>No-show</Button>
                  )}
                  {activity.status !== 'cancelled' && (
                    <Button variant="ghost" size="sm" icon={<X size={12} strokeWidth={1.75} />} onClick={() => onSetStatus('cancelled')}>Cancel</Button>
                  )}
                  <Button variant="danger" size="sm" icon={<Trash2 size={12} strokeWidth={1.75} />} onClick={onDelete} className="ml-auto">Delete</Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-ink-50/60 px-2.5 py-2">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <div className="mt-0.5 truncate text-sm text-ink-700">{children}</div>
      </div>
    </div>
  )
}
