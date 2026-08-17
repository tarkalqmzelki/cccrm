import { useState } from 'react'
import { Bell, Clock } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, Input } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import type { Company } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  company: Company
}

/** Pre-defined reminder presets in days. */
const PRESETS = [1, 2, 3, 4] as const

/**
 * Modal shown when the user clicks "Remind Me" on a lead.  Lets them
 * pick a reminder time (1/2/3/4 days from now, or a custom datetime),
 * then writes a row to `lead_reminders` — a cron job fires the actual
 * push notification at the scheduled time.
 */
export function LeadReminderModal({ open, onClose, company }: Props) {
  const { user } = useAuth()
  const { push } = useToast()
  const [preset, setPreset] = useState<number | null>(1)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('10:00')
  const [saving, setSaving] = useState(false)

  function computeRemindAt(): string | null {
    if (preset !== null) {
      const d = new Date(Date.now() + preset * 24 * 60 * 60 * 1000)
      // Default to 10:00 local time for preset days
      d.setHours(10, 0, 0, 0)
      return d.toISOString()
    }
    if (customDate && customTime) {
      // customDate is YYYY-MM-DD, customTime is HH:MM (local)
      const dt = new Date(`${customDate}T${customTime}`)
      if (isNaN(dt.getTime())) return null
      return dt.toISOString()
    }
    return null
  }

  async function save() {
    if (!user) return
    const remindAt = computeRemindAt()
    if (!remindAt) {
      push({ tone: 'error', title: 'Pick a reminder time' })
      return
    }
    if (new Date(remindAt).getTime() <= Date.now()) {
      push({ tone: 'error', title: 'Reminder time must be in the future' })
      return
    }
    setSaving(true)
    try {
      await db.createLeadReminder({
        user_id: user.id,
        company_id: company.id,
        remind_at: remindAt,
        title: 'Lead reminder',
        body: `Reminder — Meeting reminder for ${company.name}`,
      })
      push({
        tone: 'success',
        title: 'Reminder scheduled',
        desc: `You'll be notified on ${new Date(remindAt).toLocaleString()}.`,
      })
      onClose()
      setPreset(1)
      setCustomDate('')
      setCustomTime('10:00')
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not schedule reminder', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remind me"
      desc={`Schedule a reminder for ${company.name}. You'll receive a push notification at the selected time.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Bell size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule reminder'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Preset buttons */}
        <Field label="Quick presets" hint="Days from now at 10:00">
          <div className="flex gap-1.5">
            {PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPreset(preset === d ? null : d)}
                className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  preset === d
                    ? 'border-transparent bg-ink text-white'
                    : 'border-line text-ink-600 hover:bg-ink-50'
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset(null)}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                preset === null && (customDate || customTime)
                  ? 'border-transparent bg-ink text-white'
                  : 'border-line text-ink-600 hover:bg-ink-50'
              }`}
            >
              Custom
            </button>
          </div>
        </Field>

        {/* Custom date/time */}
        {preset === null && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-10"
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="h-10"
              />
            </Field>
          </div>
        )}

        {/* Preview of when the reminder fires */}
        {computeRemindAt() && (
          <div className="flex items-start gap-2 rounded-xl border border-line bg-ink-50 px-3 py-2.5 text-2xs text-ink-600">
            <Clock size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-500" />
            <span>
              Reminder will fire on{' '}
              <strong>{new Date(computeRemindAt()!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>.
              Make sure push notifications are enabled on your phone to receive it.
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
