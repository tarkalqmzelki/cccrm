import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, Phone, Users, Link2, Mail, ListTodo, Bell,
  Pencil, Trash2, Check, X, Play, Eye, EyeOff,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useActivitiesData } from '../lib/hooks/useActivitiesData'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { ActivityModal } from '../components/ActivityModal'
import { ActivitiesStatsPanel } from '../components/ActivitiesStatsPanel'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { db } from '../lib/db'
import {
  ACTIVITY_TYPE_META,
  ACTIVITY_STATUS_META,
} from '../lib/types'
import type { ScheduledActivityType, ScheduledActivityStatus, ScheduledActivity } from '../lib/types'

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
  // Monday = 0
  const dayOfWeek = (first.getDay() + 6) % 7
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
  const [scopeMine, setScopeMine] = useState(!isAdmin)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledActivity | null>(null)
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined)

  const visible = useMemo(() => {
    if (!user) return []
    if (scopeMine && user.role !== 'admin') return activities.filter((a) => a.owner_id === user.id)
    // Calendar shows everyone's activities, but a meeting flagged as hidden
    // (visible_on_calendar === false) is only shown to its owner.
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
            {scopeMine ? 'Your scheduled meetings and calls.' : 'Everyone\'s scheduled activities across the platform.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
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
          )}
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
            <p className="text-2xs text-ink-400">{visible.length} {visible.length === 1 ? 'activity' : 'activities'} · right-click for actions</p>
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
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === cursor.getMonth()
                const isToday = sameDay(d, today)
                const key = toLocalDate(d)
                const dayActivities = activitiesByDay[key] || []
                return (
                  <div
                    key={i}
                    onContextMenu={(e) => openContextMenu(e, cellContextItems(d))}
                    onClick={(e) => { if (e.detail === 2 && inMonth) openNew(d) }}
                    className={`min-h-[96px] rounded-lg border p-1.5 transition-colors ${
                      inMonth ? 'border-line bg-surface' : 'border-transparent bg-ink-50/40'
                    } ${isToday ? 'ring-1 ring-info/40' : ''}`}
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
                        <button onClick={(e) => { e.stopPropagation(); openNew(d) }} className="text-ink-300 hover:text-ink transition-colors">
                          <Plus size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayActivities.slice(0, 3).map((a) => (
                        <CalendarEvent
                          key={a.id}
                          activity={a}
                          onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                          onContext={(e) => { e.stopPropagation(); openContextMenu(e, activityContextItems(a)) }}
                          companyMap={companyMap}
                        />
                      ))}
                      {dayActivities.length > 3 && (
                        <p className="px-1 text-2xs text-ink-400">+{dayActivities.length - 3} more</p>
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
            <span className="ml-auto text-ink-400">Tip: double-click a day to create an activity on it.</span>
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
/* Event chip                                                         */
/* ------------------------------------------------------------------ */
function CalendarEvent({
  activity, onClick, onContext, companyMap,
}: {
  activity: ScheduledActivity
  onClick: (e: React.MouseEvent) => void
  onContext: (e: React.MouseEvent) => void
  companyMap: Record<string, any>
}) {
  const tMeta = ACTIVITY_TYPE_META[activity.type]
  const color = activity.color || tMeta.color
  const time = new Date(activity.scheduled_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
  const company = activity.company_id ? companyMap[activity.company_id] : null
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      onContextMenu={onContext}
      className="flex w-full items-center gap-1.5 rounded-md bg-surface px-1.5 py-1 text-left text-2xs transition-colors hover:brightness-95"
      style={{ borderLeft: `3px solid ${color}`, background: `${color}15`, opacity: activity.visible_on_calendar === false ? 0.55 : 1 }}
      title={`${tMeta.label}: ${activity.title || ''}${activity.visible_on_calendar === false ? ' · hidden from others' : ''}`}
    >
      <span className="shrink-0 text-ink-500 num">{time}</span>
      <span className="shrink-0 text-ink" style={{ color }}>{TYPE_ICON[activity.type]}</span>
      <span className="truncate font-medium text-ink">{activity.title || tMeta.label}</span>
      {activity.visible_on_calendar === false && (
        <span className="shrink-0 text-ink-400" title="Hidden from other members">
          <EyeOff size={9} strokeWidth={2} />
        </span>
      )}
      {company && <span className="ml-auto shrink-0 truncate text-ink-400 max-w-[40px]">{company.name}</span>}
    </motion.button>
  )
}