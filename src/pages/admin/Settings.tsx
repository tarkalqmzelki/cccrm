import { useEffect, useState } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field } from '../../components/ui/Input'
import { PageContainer } from '../../components/layout/AppShell'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_SETTINGS } from '../../lib/types'
import type { Settings } from '../../lib/types'

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
    </PageContainer>
  )
}
