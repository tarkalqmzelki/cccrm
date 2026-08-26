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
import { ActivityRings } from '../components/ui/ActivityRings'
import { MotionBorder } from '../components/ui/MotionBorder'
import { colorForIntensity, GAUGE_CORAL, GAUGE_GREEN, GAUGE_SLATE, GAUGE_TEAL } from '../components/ui/gaugeColors'
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
import { eur } from '../lib/format'

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
  /* Desktop hover-expand: the focused day stretches, siblings slide aside */
  const [grownKey, setGrownKey] = useState<string | null>(null)

  const visible = useMemo(() => {
    if (!user) return []
    if (scopeMine) return activities.filter((a) => a.owner_id === user.id)
    /* Calendar shows everyone's activities, but a meeting flagged as
       hidden (visible_on_calendar === false) is only shown to its
       owner — invisible to all other members. */
    return activities.filter((a) => a.visible_on_calendar !== false || a.owner_id === user.id)
  }, [activities, scopeMine, user])

  const grid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])

  /* Booked-revenue heat per day (Apple-gauge palette) */
  const revenueByDay = useMemo(() => {
    const m = new Map<string, number>()
    const counted = deals.filter(
      (d) => (d.status === 'approved' || d.status === 'closed') && (!scopeMine || d.seller_id === user?.id),
    )
    for (const d of counted) {
      const k = toLocalDate(new Date(d.created_at))
      m.set(k, (m.get(k) || 0) + d.gross_value)
    }
    return m
  }, [deals, scopeMine, user?.id])
  const maxDayRevenue = useMemo(() => Math.max(...[...revenueByDay.values()], 1), [revenueByDay])
  function dayHeat(d: Date): { value: number; t: number } {
    const v = revenueByDay.get(toLocalDate(d)) || 0
    return { value: v, t: v > 0 ? Math.max(0.18, Math.min(1, v / maxDayRevenue)) : 0 }
  }
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
            <>
              {/* Desktop — week rows; hovering a day stretches it and
                  the neighbours glide aside to reveal its activities. */}
              <div className="mt-2 hidden space-y-1 sm:block" onMouseLeave={() => setGrownKey(null)}>
                {Array.from({ length: 6 }, (_, wi) => grid.slice(wi * 7, wi * 7 + 7)).map((week, wi) => (
                  <div key={wi} className="flex gap-1">
                    {week.map((d) => {
                      const inMonth = d.getMonth() === cursor.getMonth()
                      const isToday = sameDay(d, today)
                      const key = toLocalDate(d)
                      const dayActivities = (activitiesByDay[key] || []).filter((a) => a.visible_on_calendar !== false)
                      const cellKey = `${key}-${wi}`
                      const isHighlighted = rightClickedKey === cellKey
                      const grown = grownKey === key && inMonth
                      return (
                        <motion.div
                          key={cellKey}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0, flexGrow: grown ? 2.8 : 1 }}
                          transition={{
                            layout: { type: 'spring', stiffness: 420, damping: 34 },
                            duration: 0.25,
                            delay: Math.min(wi * 0.03, 0.15),
                          }}
                          onMouseEnter={() => setGrownKey(key)}
                          onClick={() => { if (inMonth) setDayModalDate(d) }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setRightClickedKey(cellKey)
                            openContextMenu(e, cellContextItems(d))
                            setTimeout(() => setRightClickedKey((cur) => (cur === cellKey ? null : cur)), 1600)
                          }}
                          style={{ flexBasis: 0, minWidth: 0 }}
                          title={(() => { const h = dayHeat(d); return h.value > 0 ? `€${Math.round(h.value).toLocaleString('en')} booked` : undefined })()}
                          className={`group relative min-h-[96px] cursor-pointer overflow-hidden rounded-lg border p-1.5 transition-colors ${
                            isHighlighted
                              ? 'border-ink ring-2 ring-ink/15 bg-ink-50/60'
                              : inMonth
                                ? 'border-line bg-surface hover:border-ink-200 hover:bg-ink-50/30 dark:hover:bg-[rgb(28,28,28)]'
                                : 'border-transparent bg-ink-50/30'
                          } ${isToday && !isHighlighted ? 'ring-1 ring-info/40' : ''}`}
                        >
                          {/* Revenue heat wash (gauge palette) */}
                          {inMonth && dayHeat(d).t > 0 && (
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-0"
                              style={{ background: `linear-gradient(160deg, ${colorForIntensity(dayHeat(d).t)}2E, transparent 65%)` }}
                            />
                          )}
                          {/* Today / hover gradient wash */}
                          {(isToday || grown) && (
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-0"
                              style={{
                                background:
                                  isToday
                                    ? 'linear-gradient(135deg, rgba(59,130,246,0.10), transparent 55%)'
                                    : 'linear-gradient(135deg, rgba(59,130,246,0.06), transparent 50%)',
                              }}
                            />
                          )}
                          <div className="relative mb-1 flex items-center justify-between gap-1">
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-medium num ${
                                isToday ? 'bg-info text-white' : inMonth ? 'text-ink-600' : 'text-ink-300'
                              }`}
                            >
                              {d.getDate()}
                            </span>
                            {inMonth && dayActivities.length > 0 && (
                              <span className={`rounded-full bg-ink-100 px-1.5 text-2xs font-medium text-ink-500 transition-opacity ${grown ? 'opacity-0' : ''}`}>
                                {dayActivities.length}
                              </span>
                            )}
                          </div>

                          {/* Collapsed dots → expanded chips crossfade */}
                          {!grown ? (
                            <div className="flex flex-wrap gap-0.5">
                              {dayActivities.slice(0, 8).map((a) => {
                                const c = a.color || ACTIVITY_TYPE_META[a.type].color
                                return <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                              })}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {dayActivities.slice(0, 4).map((a, i) => (
                                <CalendarChip
                                  key={a.id}
                                  activity={a}
                                  index={i}
                                  onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                                  onContext={(e) => { e.stopPropagation(); openContextMenu(e, activityContextItems(a)) }}
                                />
                              ))}
                              {dayActivities.length > 4 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDayModalDate(d) }}
                                  className="text-2xs text-ink-400 hover:text-ink hover:underline"
                                >
                                  +{dayActivities.length - 4} more
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* Mobile — compact grid with dots */}
              <div className="mt-2 grid grid-cols-7 gap-1 sm:hidden">
                {grid.slice(0, 35).map((d, i) => {
                  const inMonth = d.getMonth() === cursor.getMonth()
                  const isToday = sameDay(d, today)
                  const key = toLocalDate(d)
                  const dayActivities = activitiesByDay[key] || []
                  return (
                    <button
                      key={i}
                      onClick={() => { if (inMonth) setDayModalDate(d) }}
                      style={inMonth && dayHeat(d).t > 0 ? { background: `linear-gradient(160deg, ${colorForIntensity(dayHeat(d).t)}26, transparent 70%)` } : undefined}
                      className={`min-h-[56px] rounded-lg border p-1 text-left transition-colors ${
                        inMonth ? 'border-line bg-surface' : 'border-transparent bg-ink-50/30'
                      } ${isToday ? 'ring-1 ring-info/40' : ''}`}
                    >
                      <span
                        className={`mb-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium num ${
                          isToday ? 'bg-info text-white' : inMonth ? 'text-ink-600' : 'text-ink-300'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <span className="flex flex-wrap gap-0.5">
                        {dayActivities.slice(0, 4).map((a) => (
                          <span key={a.id} className="h-1 w-1 rounded-full" style={{ background: a.color || ACTIVITY_TYPE_META[a.type].color }} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-2xs text-ink-500">
            <div className="flex flex-wrap items-center gap-3">
              {(Object.keys(ACTIVITY_TYPE_META) as ScheduledActivityType[]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: ACTIVITY_TYPE_META[t].color }} />
                  {ACTIVITY_TYPE_META[t].label}
                </span>
              ))}
            </div>
            {/* Booked heat legend — gauge spectrum */}
            <span className="inline-flex items-center gap-1.5">
              Booked
              <span
                className="inline-block h-2 w-20 rounded-full"
                style={{ background: `linear-gradient(90deg, ${GAUGE_SLATE}, ${GAUGE_TEAL}, ${GAUGE_GREEN})` }}
              />
              <span className="num text-ink-400">max {eur(maxDayRevenue)}</span>
            </span>
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
  activity, index = 0, onClick, onContext,
}: {
  activity: ScheduledActivity
  index?: number
  onClick: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const color = activity.color || tMeta.color
  const time = new Date(activity.scheduled_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  const hidden = activity.visible_on_calendar === false
  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: hidden ? 0.55 : 1, x: 0 }}
      transition={{ duration: 0.22, delay: index * 0.05 }}
      onClick={onClick}
      onContextMenu={onContext}
      className="flex w-full items-center gap-1 rounded-md border border-line/60 bg-surface px-1.5 py-1 text-left text-2xs shadow-sm transition-colors hover:border-ink-200 hover:brightness-[0.98] dark:hover:brightness-125"
      style={{ borderLeft: `3px solid ${color}` }}
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
  const completedCount = activities.filter((a) => a.status === 'completed').length
  const completionPct = activities.length > 0 ? (completedCount / activities.length) * 100 : 0

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => onNew(date)} className="ml-auto">
            New activity on this day
          </Button>
        </div>
      }
    >
      {/* Gradient day header */}
      <div className="relative -mx-5 -mt-5 mb-4 overflow-hidden rounded-t-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 px-5 py-4 text-white dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]">
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-info/25 blur-2xl" />
        <div
          aria-hidden
          className="sheen-x pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ '--sheen-cycle': '8s' } as React.CSSProperties}
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-white/60">
              {isToday && (
                <span className="rounded-full border border-info/40 bg-info/20 px-1.5 py-px text-2xs font-bold text-sky-200">Today</span>
              )}
              <CalIcon size={12} strokeWidth={2} />
            </p>
            <p className="truncate text-base font-bold leading-tight">{dateLabel}</p>
            <p className="num mt-0.5 text-2xs text-white/55">
              {activities.length} {activities.length === 1 ? 'activity' : 'activities'} · {completedCount} done · click one to expand
            </p>
          </div>
          <ActivityRings
            rings={[{ value: completionPct, label: 'day', colors: ['#34d399', '#22d3ee'] }]}
            size={64}
            thickness={7}
            delay={0.2}
          >
            <span className="num text-2xs font-extrabold">{Math.round(completionPct)}%</span>
          </ActivityRings>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Inbox size={24} strokeWidth={1.75} className="text-ink-300" />
          <p className="text-sm text-ink-400">Nothing scheduled on this day.</p>
          <Button variant="subtle" size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => onNew(date)}>
            Schedule something
          </Button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {activities.map((a, i) => (
            <DayActivityRow
              key={a.id}
              activity={a}
              index={i}
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
  activity, index = 0, expanded, onToggle, profileMap, companyMap, canManage,
  onEdit, onContext, onSetStatus, onDelete,
}: {
  activity: ScheduledActivity
  index?: number
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
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min((index ?? 0) * 0.05, 0.25) }}
      className="relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-sm"
      style={{
        backgroundColor: 'rgb(var(--surface))',
        borderColor: expanded ? `${color}66` : `${color}38`,
        backgroundImage: `linear-gradient(135deg, ${color}${expanded ? '3d' : '2b'} 0%, ${color}${expanded ? '22' : '16'} 46%, transparent 78%)`,
      }}
    >
      {/* gloss line — the glass touch */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <div
        onClick={onToggle}
        onContextMenu={onContext}
        className="relative flex cursor-pointer items-center gap-3 px-3 py-2.5"
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
              {/* Details grid — gradient-stroke tiles */}
              <div className="grid grid-cols-2 gap-2 text-2xs">
                <Detail icon={<UserIcon size={11} strokeWidth={1.75} />} label="Led by" tone="#3b82f6">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={owner?.full_name || '?'} color={owner?.avatar_color} url={owner?.avatar_url} size={16} />
                    <span className="truncate">{owner?.full_name || 'Unknown'}</span>
                  </span>
                </Detail>
                <Detail icon={<Building2 size={11} strokeWidth={1.75} />} label="Linked lead" tone="#8b5cf6">
                  {company ? company.name : <span className="text-ink-400">—</span>}
                </Detail>
                <Detail icon={<Clock size={11} strokeWidth={1.75} />} label="When" tone="#f59e0b">
                  <span className="num">{startTime} – {endTime}</span>
                </Detail>
                <Detail icon={<Clock size={11} strokeWidth={1.75} />} label="Duration" tone="#14b8a6">
                  {activity.duration_min} min
                </Detail>
                <Detail icon={<ListTodo size={11} strokeWidth={1.75} />} label="Type" tone={color}>
                  {tMeta.label}
                </Detail>
                <Detail icon={<Check size={11} strokeWidth={1.75} />} label="Status" tone={activity.status === 'completed' ? '#22c55e' : '#9ca3af'}>
                  <Badge tone={sMeta.tone}>{sMeta.label}</Badge>
                </Detail>
              </div>

              {/* Purpose / notes */}
              {activity.notes && (
                <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-info/[0.07] to-transparent p-[1px]">
                  <div className="rounded-[7px] bg-surface p-2.5 dark:bg-[rgb(23,23,23)]">
                    <p className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-ink-400">Purpose / notes</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-700 dark:text-white">{activity.notes}</p>
                  </div>
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
    </motion.li>
  )
}

function Detail({ icon, label, tone = '#9ca3af', children }: { icon: React.ReactNode; label: string; tone?: string; children: React.ReactNode }) {
  return (
    <MotionBorder colors={[tone, `${tone}44`, tone]} radius="rounded-lg" speed={8}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span className="mt-0.5" style={{ color: tone }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
          <div className="mt-0.5 truncate text-sm font-medium text-[rgb(23,23,23)] dark:text-white">{children}</div>
        </div>
      </div>
    </MotionBorder>
  )
}
