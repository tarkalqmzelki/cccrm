import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Textarea, Select, Field } from './ui/Input'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import { blankDeal } from '../lib/mock'
import { STATUS_META, DEFAULT_SETTINGS } from '../lib/types'
import { commissionFor, revenueOf } from '../lib/metrics'
import type { Deal, DealStatus, Profile, Settings } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (d: Deal) => void
  deal?: Deal | null
  sellerId?: string
  isAdmin?: boolean
  title?: string
}

export function DealModal({ open, onClose, onSaved, deal, sellerId, isAdmin = false, title }: Props) {
  const { user } = useAuth()
  const { push } = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [allDeals, setAllDeals] = useState<Deal[]>([])
  const [form, setForm] = useState<Deal>(deal ?? blankDeal(sellerId ?? user?.id ?? ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(deal ?? blankDeal(sellerId ?? user?.id ?? ''))
      db.getSettings().then(setSettings)
      db.listDeals().then(setAllDeals)
      if (isAdmin) db.listProfiles().then((p) => setProfiles(p.filter((x) => x.role !== 'admin')))
    }
  }, [open, deal, sellerId, user?.id, isAdmin])

  const set = (k: keyof Deal, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const editing = !!deal

  // compute commission automatically for sellers
  const sellerProfile = profiles.find((p) => p.id === form.seller_id) || user
  const sellerRevenue = sellerProfile ? revenueOf(allDeals, sellerProfile.id) : 0
  const autoCommission = sellerProfile
    ? commissionFor(sellerProfile, sellerRevenue, settings, deal ?? undefined)
    : 10

  async function save() {
    if (!form.company.trim()) {
      push({ tone: 'error', title: 'Company name is required' })
      return
    }
    // For sellers: auto-set commission, no custom override
    const payload = { ...form }
    if (!isAdmin) {
      payload.commission_pct = autoCommission
      payload.custom_commission_pct = null
      // Sellers always submit as pending_review
      payload.status = 'pending_review' as DealStatus
    } else if (payload.custom_commission_pct != null) {
      payload.commission_pct = payload.custom_commission_pct
    } else {
      payload.commission_pct = autoCommission
    }
    // Ensure status is never empty
    if (!payload.status) payload.status = 'pending_review' as DealStatus
    setSaving(true)
    try {
      let result: Deal
      if (editing) {
        result = await db.updateDeal(form.id, payload)
      } else {
        result = await db.createDeal(payload)
      }
      push({ tone: 'success', title: editing ? 'Deal updated' : 'Deal submitted', desc: isAdmin ? undefined : 'Admin will review shortly.' })
      onSaved(result)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? (editing ? 'Edit deal' : 'Submit a deal')}
      desc="Add client details, meeting context, and value."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Submit deal'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {isAdmin && (
          <Field label="Seller / Headhunter" required>
            <Select value={form.seller_id} onChange={(e) => set('seller_id', e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.role}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company" required>
            <Input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Atelier Noir" />
          </Field>
          <Field label="Contact name">
            <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Camille Faure" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" autoComplete="email" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+33 1 4020 3040" autoComplete="tel" />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="company.com" />
          </Field>
          <Field label="Meeting place">
            <Input value={form.meeting_place} onChange={(e) => set('meeting_place', e.target.value)} placeholder="Milan Showroom / Zoom" />
          </Field>
          <Field label="Gross value (€)" hint="Total deal value before commission">
            <Input type="number" min={0} value={form.gross_value || ''} onChange={(e) => set('gross_value', Number(e.target.value))} placeholder="48000" />
          </Field>
          {isAdmin && (
            <Field label="Collected amount (€)" hint="How much the company has received from the client so far">
              <Input type="number" min={0} value={form.collected_amount || ''} onChange={(e) => set('collected_amount', Number(e.target.value))} placeholder="0" />
            </Field>
          )}
          {/* Commission: auto for sellers, editable for admin */}
          {isAdmin ? (
            <Field label="Commission %" hint="Leave blank to auto-calc by level. Set a value to override.">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.custom_commission_pct ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  set('custom_commission_pct', v === '' ? null : Number(v))
                }}
                placeholder={`Auto: ${autoCommission}%`}
              />
            </Field>
          ) : (
            <Field label="Commission" hint={`Auto-calculated from your level (${autoCommission}%)`}>
              <Input value={`${autoCommission}%`} disabled className="bg-ink-50" />
            </Field>
          )}
          {isAdmin && (
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value as DealStatus)}>
                {(Object.keys(STATUS_META) as DealStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Notes" hint="Internal context — cold/warm call details, next steps">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Interested in Q4 launch. Follow up next week…" rows={4} />
        </Field>
      </div>
    </Modal>
  )
}
