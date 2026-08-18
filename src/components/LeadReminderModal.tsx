import { useState } from 'react'
import { Bell, Clock } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, Textarea } from './ui/Input'
import { DateTimePicker } from './ui/DateTimePicker'
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
 * pick a reminder time (1/2/3/4 days from now, or a custom datetime
 * using the same DateTimePicker component as the meeting calendar),
 * then writes a row to `lead_reminders` — a cron job fires the actual
 * push notification at the scheduled time.
 *
 * The "Reason" field flows into the push notification body so the
 * user sees WHY they set the reminder when it fires.
 */
export function LeadReminderModal({ open, onClose, company }: Props) {
  const { user } = useAuth()
  const { push } = useToast()
  const [preset, setPreset] = useState<number | null>(1)
  // Custom datetime — stored as a local "YYYY-MM-DDTHH:mm" string
  // (DateTimePicker with outputIso=false).  Initial value: tomorrow 10:00.
  const [customDateTime, setCustomDateTime] = useState<string>(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
    d.setHours(10, 0, 0, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T10:00`
  })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function computeRemindAt(): string | null {
    if (preset !== null) {
      const d = new Date(Date.now() + preset * 24 * 60 * 60 * 1000)
      // Default to 10:00 local time for preset days
      d.setHours(10, 0, 0, 0)
      return d.toISOString()
    }
    // Custom mode — customDateTime is a local "YYYY-MM-DDTHH:mm" string
    if (customDateTime) {
      const d = new Date(customDateTime)
      if (isNaN(d.getTime())) return null
      return d.toISOString()
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
      // Build the notification body — include the reason if provided.
      const baseBody = `Reminder — Meeting reminder for ${company.name}`
      const body = reason.trim() ? `${baseBody}\nReason: ${reason.trim()}` : baseBody

      await db.createLeadReminder({
        user_id: user.id,
        company_id: company.id,
        remind_at: remindAt,
        title: 'Lead reminder',
        body,
      })
      // Also create a calendar entry so the reminder shows up on the
      // activities calendar alongside meetings/calls.  Type 'reminder'
      // is the gray-dot kind — visible to the owner.
      let calendarOk = true
      try {
        await db.createScheduledActivity({
          owner_id: user.id,
          type: 'reminder',
          status: 'planned',
          title: `Reminder: ${company.name}${reason.trim() ? ` — ${reason.trim()}` : ''}`,
          notes: reason.trim(),
          scheduled_at: remindAt,
          duration_min: 15,
          company_id: company.id,
          visible_on_calendar: true,
        })
      } catch (calErr: any) {
        // Don't fail the whole modal if the calendar write fails — the
        // reminder itself is already saved and will fire a push.
        calendarOk = false
        console.warn('[lead-reminder] calendar entry failed:', calErr?.message)
      }
      push({
        tone: 'success',
        title: 'Reminder scheduled',
        desc: `You'll be notified on ${new Date(remindAt).toLocaleString()}${calendarOk ? ' — added to your calendar too' : ''}.`,
      })
      onClose()
      setPreset(1)
      setReason('')
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
                preset === null
                  ? 'border-transparent bg-ink text-white'
                  : 'border-line text-ink-600 hover:bg-ink-50'
              }`}
            >
              Custom
            </button>
          </div>
        </Field>

        {/* Custom date/time — uses the same DateTimePicker as meetings */}
        {preset === null && (
          <Field label="Date & time">
            <DateTimePicker
              value={customDateTime}
              onChange={setCustomDateTime}
              outputIso={false}
            />
          </Field>
        )}

        {/* Reason — flows into the push notification body */}
        <Field label="Reason" hint="Why are you setting this reminder? Shown in the notification.">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Follow up after the discovery call"
          />
        </Field>

        {/* Preview of when the reminder fires */}
        {computeRemindAt() && (
          <div className="flex items-start gap-2 rounded-xl border border-line bg-ink-50 px-3 py-2.5 text-2xs text-ink-600">
            <Clock size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-500" />
            <span>
              Reminder will fire on{' '}
              <strong>{new Date(computeRemindAt()!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>.
              {reason.trim() && <> · Reason: <em>{reason.trim()}</em></>}
              <br />
              A matching calendar entry will be created so the reminder shows on your activities calendar.
              <br />
              Make sure push notifications are enabled on your phone to receive it.
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
