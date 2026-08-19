import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Clock, Calendar as CalIcon } from 'lucide-react'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Convert a Date to YYYY-MM-DDTHH:mm in the user's local timezone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseLocalInput(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface Props {
  /** ISO string OR a local "YYYY-MM-DDTHH:mm" string. The picker is
   *  flexible: whatever you pass in, you'll get out via onChange. */
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** Set to true to receive an ISO string from onChange instead of a
   *  local datetime-local string. */
  outputIso?: boolean
  /** Date-only picker — hides the time picker section and the time
   *  portion of the trigger label.  Output is a "YYYY-MM-DD" string
   *  (or an ISO date string when outputIso is true).  Used by the
   *  invoice editor for issue / due dates so we keep the platform UI
   *  consistent with the meeting calendar. */
  dateOnly?: boolean
}

/**
 * A custom date+time picker — no native `<input type="datetime-local">`.
 *
 * Two stacked popovers open from a single button:
 *   - a mini month calendar for the date
 *   - a small list of common time slots + a free text time
 *
 * The button shows the current selection as a friendly label.
 *
 * `dateOnly` collapses the time picker section entirely so it reads
 * as a clean date-only picker (same UI as the calendar), useful for
 * invoices / due dates / expiry dates.
 */
export function DateTimePicker({ value, onChange, disabled, outputIso = true, dateOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const d = parseLocalInput(value) || new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const ref = useRef<HTMLDivElement>(null)

  const current = parseLocalInput(value) || new Date()
  const currentTime = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pickDate(d: Date) {
    const next = new Date(d)
    next.setHours(current.getHours(), current.getMinutes(), 0, 0)
    commit(next)
  }

  function pickTime(h: number, m: number) {
    const next = new Date(current)
    next.setHours(h, m, 0, 0)
    commit(next)
  }

  function commit(d: Date) {
    if (outputIso) {
      onChange(dateOnly ? d.toISOString().slice(0, 10) : d.toISOString())
    } else {
      onChange(dateOnly ? toLocalDateOnly(d) : toLocalInput(d))
    }
  }

  const grid = useMemo(() => buildMonthGrid(view.getFullYear(), view.getMonth()), [view])

  function prevMonth() { setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)) }
  function nextMonth() { setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)) }

  const today = new Date()
  const label = dateOnly
    ? current.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : current.toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setView(new Date(current.getFullYear(), current.getMonth(), 1)) }}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink disabled:bg-ink-50 disabled:text-ink-400"
      >
        <CalIcon size={15} strokeWidth={1.75} className="text-ink-400" />
        <span className="flex-1 text-left">{label}</span>
        {!dateOnly && <Clock size={13} strokeWidth={1.75} className="text-ink-300" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full z-[160] mt-2 w-72 glass-strong rounded-2xl shadow-glass p-3"
          >
            {/* Month header */}
            <div className="mb-2 flex items-center justify-between">
              <button onClick={prevMonth} className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-50">
                <ChevronLeft size={15} strokeWidth={1.75} />
              </button>
              <p className="text-sm font-medium">{MONTH_NAMES[view.getMonth()]} {view.getFullYear()}</p>
              <button onClick={nextMonth} className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 hover:bg-ink-50">
                <ChevronRight size={15} strokeWidth={1.75} />
              </button>
            </div>

            {/* Weekday row */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-2xs font-medium uppercase text-ink-400">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === view.getMonth()
                const isToday = sameDay(d, today)
                const isSel = sameDay(d, current)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDate(d)}
                    className={`grid h-8 w-8 place-items-center rounded-lg text-2xs font-medium transition-colors ${
                      isSel ? 'bg-ink text-white'
                      : inMonth ? 'text-ink hover:bg-ink-50'
                      : 'text-ink-300'
                    } ${isToday && !isSel ? 'ring-1 ring-info/40' : ''}`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>

            {/* Time picker — hidden in dateOnly mode */}
            {!dateOnly && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase text-ink-400">
                  <Clock size={11} strokeWidth={1.75} /> Time
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {TIME_SLOTS.map((t) => {
                    const [h, m] = t.split(':').map(Number)
                    const active = h === current.getHours() && m === current.getMinutes()
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => pickTime(h, m)}
                        className={`rounded-lg py-1.5 text-2xs font-medium transition-colors ${
                          active ? 'bg-ink text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                        }`}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-2xs text-ink-400">Custom:</label>
                  <input
                    type="time"
                    value={currentTime}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number)
                      if (!isNaN(h) && !isNaN(m)) pickTime(h, m)
                    }}
                    className="h-8 flex-1 rounded-lg border border-line bg-surface px-2 text-2xs text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Convert a Date to YYYY-MM-DD in the user's local timezone (no time). */
function toLocalDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* 15-minute slots from 08:00 to 20:00 */
const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30',
  '20:00',
]

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
