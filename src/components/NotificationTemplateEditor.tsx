import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useToast } from '../context/ToastContext'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Skeleton } from './ui/Skeleton'
import { Switch } from './ui/Switch'
import { NOTIFICATION_KEYS } from '../lib/types'
import type { NotificationKey, NotificationTemplate, NotificationTone } from '../lib/types'

const TONES: { value: NotificationTone; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

/**
 * Admin-only editor for global notification templates.  Controls the
 * format (title + body) and per-type enable flag applied by the
 * send-push Edge Function.  Placeholders: {subject} {actor} {amount}
 * {period} {when}.
 */
export function NotificationTemplateEditor() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listNotificationTemplates(), [])
  const [local, setLocal] = useState<Record<NotificationKey, NotificationTemplate>>({} as Record<NotificationKey, NotificationTemplate>)
  const [savingKey, setSavingKey] = useState<NotificationKey | null>(null)

  useEffect(() => {
    if (!data) return
    const m: Record<NotificationKey, NotificationTemplate> = {} as Record<NotificationKey, NotificationTemplate>
    data.forEach((t) => (m[t.key as NotificationKey] = { ...t }))
    setLocal(m)
  }, [data])

  function patch(key: NotificationKey, p: Partial<NotificationTemplate>) {
    setLocal((m) => {
      const row = m[key]
      if (!row) return m
      return { ...m, [key]: { ...row, ...p } }
    })
  }

  async function save(key: NotificationKey) {
    const row = local[key]
    if (!row) return
    setSavingKey(key)
    try {
      await db.updateNotificationTemplate(key, {
        enabled: row.enabled,
        title_template: row.title_template,
        body_template: row.body_template,
        tone: row.tone,
      })
      push({ tone: 'success', title: 'Template saved', desc: key })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs text-ink-400">
        Placeholders: <code className="rounded bg-ink-100 px-1 py-0.5">{`{subject}`}</code>{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5">{`{actor}`}</code>{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5">{`{amount}`}</code>{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5">{`{period}`}</code>{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5">{`{when}`}</code>
      </p>

      {NOTIFICATION_KEYS.map((meta) => {
        const row = local[meta.key]
        if (!row) return null
        const original = data?.find((t) => t.key === meta.key)
        const dirty =
          !original ||
          original.enabled !== row.enabled ||
          original.title_template !== row.title_template ||
          original.body_template !== row.body_template ||
          original.tone !== row.tone

        return (
          <div key={meta.key} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-ink">{meta.label}</p>
                  <code className="rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-500">{meta.key}</code>
                </div>
                <p className="mt-0.5 text-2xs text-ink-400">{meta.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-ink-400">{row.enabled ? 'On' : 'Off'}</span>
                <Switch checked={row.enabled} onChange={(v) => patch(meta.key, { enabled: v })} aria-label={`Enable ${meta.label}`} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Title template">
                <Input
                  value={row.title_template}
                  onChange={(e) => patch(meta.key, { title_template: e.target.value })}
                  className="h-9"
                />
              </Field>
              <Field label="Tone">
                <select
                  value={row.tone}
                  onChange={(e) => patch(meta.key, { tone: e.target.value as NotificationTone })}
                  className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink"
                >
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Body template">
                <Textarea
                  value={row.body_template}
                  onChange={(e) => patch(meta.key, { body_template: e.target.value })}
                  rows={2}
                />
              </Field>
            </div>

            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty || savingKey === meta.key}
                onClick={() => save(meta.key)}
                icon={<Save size={13} strokeWidth={1.75} />}
              >
                {savingKey === meta.key ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
