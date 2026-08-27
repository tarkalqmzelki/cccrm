import { useState } from 'react'
import { Coins, Save, PackageCheck, Truck, User as UserIcon } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { CreditSettings, Redemption, Profile } from '../../lib/types'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../../context/ToastContext'
import { eur, dateShort } from '../../lib/format'

/**
 * Admin Tokenization panel - earning-rate configuration + the
 * redemption requests queue (who redeemed what -> mark delivered).
 */
export function TokenizationAdmin() {
  return (
    <div className="space-y-6">
      <RatesCard />
      <RedemptionsCard />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Earning rules                                                       */
/* ------------------------------------------------------------------ */
function RatesCard() {
  const { push } = useToast()
  const settingsQ = useAsync(async () => db.getCreditSettings(), [])
  const s = settingsQ.data
  const [form, setForm] = useState<Partial<CreditSettings>>({})
  const [saving, setSaving] = useState(false)

  const val = (k: keyof CreditSettings): number =>
    form[k] !== undefined ? Number(form[k]) : Number((s as any)?.[k] ?? 0)
  const set = (k: keyof CreditSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }))

  async function save() {
    setSaving(true)
    try {
      await db.updateCreditSettings({
        credits_per_deal_submitted: val('credits_per_deal_submitted'),
        credits_per_deal_approved: val('credits_per_deal_approved'),
        credits_per_offer_created: val('credits_per_offer_created'),
        credits_per_lead_created: val('credits_per_lead_created'),
        credits_per_mp_converted: val('credits_per_mp_converted'),
        challenge_points_rate: val('challenge_points_rate'),
      })
      push({ tone: 'success', title: 'Earning rates saved' })
      settingsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally { setSaving(false) }
  }

  if (settingsQ.loading || !s) return <Skeleton className="h-64 rounded-2xl" />

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/30">
              <Coins size={15} strokeWidth={2} />
            </span>
            CC Credits - earning rules
          </span>
        }
        desc="Members automatically earn CC Credits when these events happen."
        action={<Button size="sm" icon={<Save size={14} strokeWidth={1.75} />} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <Field label="New deal" hint="Submitted"><Input type="number" min={0} step="0.01" className="num" value={val('credits_per_deal_submitted')} onChange={set('credits_per_deal_submitted')} /></Field>
        <Field label="Deal approved" hint="Admin approval"><Input type="number" min={0} step="0.01" className="num" value={val('credits_per_deal_approved')} onChange={set('credits_per_deal_approved')} /></Field>
        <Field label="New offer" hint="On any lead"><Input type="number" min={0} step="0.01" className="num" value={val('credits_per_offer_created')} onChange={set('credits_per_offer_created')} /></Field>
        <Field label="New lead" hint="Created by member"><Input type="number" min={0} step="0.01" className="num" value={val('credits_per_lead_created')} onChange={set('credits_per_lead_created')} /></Field>
        <Field label="MP deal approved" hint="Claimed lead + approved deal"><Input type="number" min={0} step="0.01" className="num" value={val('credits_per_mp_converted')} onChange={set('credits_per_mp_converted')} /></Field>
        <Field label="Challenge pts x" hint="Multiplier on challenge reward points"><Input type="number" min={0} step="0.01" className="num" value={val('challenge_points_rate')} onChange={set('challenge_points_rate')} /></Field>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Redemptions queue                                                   */
/* ------------------------------------------------------------------ */
function RedemptionsCard({ profiles }: { profiles?: Profile[] }) {
  const { push } = useToast()
  const rdQ = useAsync(async () => db.listRedemptions(), [])
  const profilesQ = useAsync(async () => db.listProfiles(), [])
  const pMap: Record<string, Profile> = {}
  ;((profiles ?? profilesQ.data) || []).forEach((p) => (pMap[p.id] = p))

  async function deliver(r: Redemption) {
    try {
      await db.markRedemptionDelivered(r.id)
      // Status notification through the inbox pipeline
      await db.sendInboxMessage(
        r.user_id,
        null,
        'system',
        `Redemption delivered: ${r.item_title}`,
        'Your redemption has been delivered by HQ. Enjoy!',
        '/bank',
        {},
      ).catch(() => {})
      push({ tone: 'success', title: 'Marked delivered' })
      rdQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  const rds = rdQ.data || []

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><PackageCheck size={16} strokeWidth={1.75} /> Redemption requests</span>}
        desc="Fulfill these manually (gift card code / item handover), then mark delivered."
      />
      {rdQ.loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : rds.length === 0 ? (
        <EmptyState icon={<Truck size={20} strokeWidth={1.5} />} title="No redemptions yet" desc="When members spend their CC Credits in the shop, their orders land here." />
      ) : (
        <div className="space-y-1.5">
          {rds.map((r) => {
            const u = pMap[r.user_id]
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                {u ? <Avatar name={u.full_name} color={u.avatar_color} url={u.avatar_url} size={30} /> : (
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-ink-100 text-ink-400"><UserIcon size={14} strokeWidth={1.75} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u?.full_name ?? 'Member'} · <span className="text-ink">{r.item_title}</span></p>
                  <p className="text-2xs text-ink-400 num">{dateShort(r.created_at)} · code {r.code ? 'issued' : '-'}</p>
                </div>
                <Badge tone={r.status === 'delivered' ? 'pos' : 'warn'} dot>{r.status}</Badge>
                {r.status === 'pending' && (
                  <Button size="sm" variant="secondary" onClick={() => deliver(r)}>Mark delivered</Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
