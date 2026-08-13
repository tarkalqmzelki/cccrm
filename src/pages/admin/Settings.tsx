import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Activity, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { PageContainer } from '../../components/layout/AppShell'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_SETTINGS, SYSTEM_STATUS_META } from '../../lib/types'
import type { Settings, SystemStatus, SystemStatusValue } from '../../lib/types'
import { dateShort } from '../../lib/format'

export default function SettingsPage() {
  const { push } = useToast()
  const { data, loading } = useAsync(async () => db.getSettings(), [])
  const [form, setForm] = useState<Settings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const set = (k: keyof Settings, v: number) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      await db.updateSettings(form)
      push({ tone: 'success', title: 'Settings saved', desc: 'Levels and commissions updated.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setForm({ ...DEFAULT_SETTINGS })
    push({ tone: 'info', title: 'Reset to defaults', desc: 'Save to apply.' })
  }

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-ink-400">Configure level thresholds, commission rates, and referral bonuses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RotateCcw size={15} strokeWidth={1.75} />} onClick={reset}>Reset</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Level thresholds" desc="Revenue needed to reach each level (€)" />
          {loading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
          ) : (
            <div className="space-y-4">
              <Field label="L1 threshold" hint="From 0 to this amount">
                <Input type="number" min={0} value={form.l1_threshold} onChange={(e) => set('l1_threshold', Number(e.target.value))} />
              </Field>
              <Field label="L2 threshold" hint="From L1 threshold to this amount">
                <Input type="number" min={0} value={form.l2_threshold} onChange={(e) => set('l2_threshold', Number(e.target.value))} />
              </Field>
              <Field label="L3 threshold" hint="Above this amount">
                <Input type="number" min={0} value={form.l3_threshold} onChange={(e) => set('l3_threshold', Number(e.target.value))} />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Sales commission" desc="Percentage of gross value per level (seller's own deals)" />
          {loading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
          ) : (
            <div className="space-y-4">
              <Field label="L1 commission %" hint="10% by default">
                <Input type="number" min={0} max={100} value={form.l1_commission_pct} onChange={(e) => set('l1_commission_pct', Number(e.target.value))} />
              </Field>
              <Field label="L2 commission %" hint="15% by default">
                <Input type="number" min={0} max={100} value={form.l2_commission_pct} onChange={(e) => set('l2_commission_pct', Number(e.target.value))} />
              </Field>
              <Field label="L3 commission %" hint="20% by default">
                <Input type="number" min={0} max={100} value={form.l3_commission_pct} onChange={(e) => set('l3_commission_pct', Number(e.target.value))} />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Referral commission" desc="Separate rate — earned from your direct referrals' deals" />
          {loading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
          ) : (
            <div className="space-y-4">
              <Field label="L1 referral %" hint="5% by default — earned on referral's gross value">
                <Input type="number" min={0} max={100} value={form.l1_referral_pct} onChange={(e) => set('l1_referral_pct', Number(e.target.value))} />
              </Field>
              <Field label="L2 referral %" hint="5% by default">
                <Input type="number" min={0} max={100} value={form.l2_referral_pct} onChange={(e) => set('l2_referral_pct', Number(e.target.value))} />
              </Field>
              <Field label="L3 referral %" hint="5% by default">
                <Input type="number" min={0} max={100} value={form.l3_referral_pct} onChange={(e) => set('l3_referral_pct', Number(e.target.value))} />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="How it works" desc="Summary of the rules" />
          <div className="space-y-2 text-sm text-ink-600">
            <p>• <strong>Sales commission</strong> = the seller's level rate applied to their own deal gross value.</p>
            <p>• <strong>Referral commission</strong> = the referrer's referral rate (separate from sales) applied to their direct referral's deal gross value.</p>
            <p>• Levels auto-determined by total revenue (approved + closed deals).</p>
            <p>• One-leg rule: only direct (first-level) referrals count — no cascading.</p>
            <p>• Admin can override commission per seller or per deal.</p>
          </div>
        </Card>
      </div>

      <SystemStatusAdmin />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* System status admin panel                                          */
/* ------------------------------------------------------------------ */
const STATUS_OPTIONS: { value: SystemStatusValue; label: string; color: string; icon: typeof CheckCircle2 }[] = [
  { value: 'operating',   label: 'Operating',   color: '#22c55e', icon: CheckCircle2 },
  { value: 'maintenance', label: 'Maintenance', color: '#f59e0b', icon: Wrench },
  { value: 'down',        label: 'Down',        color: '#ef4444', icon: AlertTriangle },
]

function SystemStatusAdmin() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listSystemStatuses(), [])
  const [local, setLocal] = useState<Record<string, SystemStatus>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const m: Record<string, SystemStatus> = {}
    data.forEach((s) => (m[s.id] = { ...s }))
    setLocal(m)
  }, [data])

  function setStatus(id: string, status: SystemStatusValue) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, status } }
    })
  }
  function setUptime(id: string, value: number) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, uptime_pct: Math.min(100, Math.max(0, value)) } }
    })
  }
  function setNote(id: string, note: string) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, note } }
    })
  }

  async function persist(id: string) {
    const row = local[id]
    if (!row) return
    setSavingId(id)
    try {
      await db.updateSystemStatus(id, { status: row.status, uptime_pct: row.uptime_pct, note: row.note })
      push({ tone: 'success', title: 'System status updated', desc: `${row.system} → ${SYSTEM_STATUS_META[row.status].label}` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    } finally {
      setSavingId(null)
    }
  }

  const rows = useMemo(() => Object.values(local).sort((a, b) => a.system.localeCompare(b.system)), [local])

  return (
    <Card className="mt-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Activity size={16} strokeWidth={1.75} className="text-info" />
            System status
          </span>
        }
        desc="Toggle each tracked service's status. Members see updates in real time (within ~30s)."
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Activity size={20} strokeWidth={1.75} className="text-ink-300" />
          <p className="text-sm text-ink-400">No systems registered. Run schema24.sql to seed them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => {
            const dirty =
              data?.find((x) => x.id === s.id)?.status !== s.status ||
              data?.find((x) => x.id === s.id)?.uptime_pct !== s.uptime_pct ||
              (data?.find((x) => x.id === s.id)?.note || '') !== s.note
            return (
              <div key={s.id} className="rounded-xl border border-line p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.system}</p>
                    <p className="text-2xs text-ink-400">Updated {dateShortSafe(s.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {STATUS_OPTIONS.map((o) => {
                      const selected = s.status === o.value
                      return (
                        <button
                          key={o.value}
                          onClick={() => setStatus(s.id, o.value)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition-colors ${
                            selected ? 'border-transparent text-white' : 'border-line text-ink-500 hover:bg-ink-50'
                          }`}
                          style={selected ? { background: o.color } : undefined}
                        >
                          <o.icon size={12} strokeWidth={1.75} />
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <Input
                    value={s.note}
                    onChange={(e) => setNote(s.id, e.target.value)}
                    placeholder="Optional note (shown in the status modal)"
                    className="h-10"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-ink-400 shrink-0">Uptime %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={s.uptime_pct}
                      onChange={(e) => setUptime(s.id, Number(e.target.value))}
                      className="h-10 w-24"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!dirty || savingId === s.id}
                      onClick={() => persist(s.id)}
                    >
                      {savingId === s.id ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function dateShortSafe(iso: string): string {
  try { return dateShort(iso) } catch { return '—' }
}
