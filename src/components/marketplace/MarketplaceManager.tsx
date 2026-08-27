import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Upload, Plus, Pencil, Trash2, Eye, EyeOff, Search, UsersRound,
  Clock, Store, CheckSquare, XSquare, FileJson, X,
} from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { MarketLead, Profile } from '../../lib/types'
import { marketLeadState } from '../../lib/types'
import { Button } from '../ui/Button'
import { Input, Field, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { MotionBorder } from '../ui/MotionBorder'
import { DateTimePicker } from '../ui/DateTimePicker'
import { ProfileCombobox } from './ProfileCombobox'
import { useToast } from '../../context/ToastContext'

/**
 * Admin control room for the Leads Marketplace pool — import JSON,
 * publish/hide in bulk, set claim timers, allocate to a person, edit,
 * remove. Imported leads stay hidden until you publish them.
 */
export function MarketplaceManager({ adminId }: { adminId: string }) {
  const { push } = useToast()
  const leadsQ = useAsync(async () => db.listMarketLeads(), [])
  const profilesQ = useAsync(async () => db.listProfiles(), [])
  const leads = useMemo(() => leadsQ.data || [], [leadsQ.data])
  const profiles = useMemo(() => (profilesQ.data || []).filter((p) => p.role !== 'admin'), [profilesQ.data])

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return leads
    return leads.filter((l) =>
      `${l.name} ${l.website} ${l.domain} ${l.industry} ${l.address}`.toLowerCase().includes(q),
    )
  }, [leads, search])

  /* tick for countdowns — only while some published card is locked */
  const hasCountdown = useMemo(
    () => leads.some((l) => l.unlock_at && !l.claimed_by && new Date(l.unlock_at).getTime() > Date.now()),
    [leads],
  )
  useEffect(() => {
    if (!hasCountdown) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [hasCountdown])

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const allShownSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id))

  async function bulk(patch: Partial<MarketLead>, okMsg: string) {
    try {
      await db.bulkUpdateMarketLeads([...selected], patch)
      push({ tone: 'success', title: okMsg, desc: `${selected.size} lead${selected.size === 1 ? '' : 's'} updated.` })
      setSelected(new Set())
      leadsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Bulk update failed', desc: e?.message })
    }
  }

  async function bulkDelete() {
    if (!confirm(`Remove ${selected.size} lead${selected.size === 1 ? '' : 's'} from the marketplace?`)) return
    try {
      await db.bulkDeleteMarketLeads([...selected])
      push({ tone: 'success', title: 'Leads removed' })
      setSelected(new Set())
      leadsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function removeOne(l: MarketLead) {
    if (!confirm(`Remove "${l.name}"?`)) return
    try {
      await db.deleteMarketLead(l.id)
      push({ tone: 'success', title: 'Lead removed' })
      leadsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  /* ---- modals ---- */
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MarketLead | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)

  const counts = useMemo(() => ({
    total: leads.length,
    live: leads.filter((l) => marketLeadState(l) === 'live').length,
    hidden: leads.filter((l) => !l.published && !l.claimed_by).length,
    claimed: leads.filter((l) => l.claimed_by).length,
  }), [leads])

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${counts.total} marketplace leads…`}
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-ink"
          />
        </div>
        <Button variant="secondary" icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAddOpen(true)}>Add lead</Button>
        <Button icon={<Upload size={15} strokeWidth={1.75} />} onClick={() => setImportOpen(true)}>Import JSON</Button>
      </div>

      {/* Summary chips */}
      <div className="mb-4 flex flex-wrap gap-1.5 text-2xs font-semibold">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 num">{counts.total} in pool</span>
        <span className="rounded-full border border-pos/25 bg-posBg px-2.5 py-1 text-pos num">{counts.live} live</span>
        <span className="rounded-full border border-line bg-ink-50 px-2.5 py-1 text-ink-400 dark:bg-transparent num">{counts.hidden} hidden</span>
        <span className="rounded-full border border-info/25 bg-infoBg px-2.5 py-1 text-info num">{counts.claimed} claimed</span>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 sticky top-2 z-20"
          >
            <MotionBorder colors={['#f59e0b', '#8b5cf6', '#f59e0b']} speed={6}>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
                <span className="num mr-1 text-xs font-bold">{selected.size} selected</span>
                <Button variant="ghost" size="sm" icon={<Eye size={13} strokeWidth={1.75} />} onClick={() => bulk({ published: true }, 'Published to marketplace')}>Publish</Button>
                <Button variant="ghost" size="sm" icon={<EyeOff size={13} strokeWidth={1.75} />} onClick={() => bulk({ published: false }, 'Hidden from marketplace')}>Hide</Button>
                <Button variant="ghost" size="sm" icon={<Clock size={13} strokeWidth={1.75} />} onClick={() => setTimerOpen(true)}>Claim timer</Button>
                <Button variant="ghost" size="sm" icon={<UsersRound size={13} strokeWidth={1.75} />} onClick={() => setAllocateOpen(true)}>Allocate</Button>
                <Button variant="ghost" size="sm" className="text-neg hover:bg-negBg" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={bulkDelete}>Delete</Button>
                <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]">
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>
            </MotionBorder>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {leadsQ.loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Store size={22} strokeWidth={1.5} />}
          title={leads.length === 0 ? 'The marketplace shelf is empty' : 'No matches'}
          desc={leads.length === 0 ? 'Import companies via JSON or add them manually — then publish to make them claimable.' : `Nothing matches "${search}".`}
        />
      ) : (
        <div className="space-y-1.5">
          {/* header row */}
          <label className="flex items-center gap-3 px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={() => setSelected(allShownSelected ? new Set() : new Set(filtered.map((l) => l.id)))}
              className="h-4 w-4 accent-[rgb(10,10,10)]"
            />
            <span className="flex-1">Lead</span>
            <span className="hidden w-32 sm:block">Status</span>
          </label>

          {filtered.map((l, i) => (
            <MarketRow
              key={l.id}
              lead={l}
              index={i}
              checked={selected.has(l.id)}
              onToggle={() => toggle(l.id)}
              onEdit={() => { setEditTarget(l); setEditOpen(true) }}
              onDelete={() => removeOne(l)}
              profileName={(id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? (id ? 'Member' : null)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} adminId={adminId} existingNames={new Set(leads.map((l) => l.name.toLowerCase().trim()))} onDone={() => leadsQ.reload()} />
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} lead={editTarget} profiles={profiles} onDone={() => { setEditOpen(false); leadsQ.reload() }} />
      <AddModal open={addOpen} onClose={() => setAddOpen(false)} adminId={adminId} onDone={() => { setAddOpen(false); leadsQ.reload() }} />
      <TimerModal
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        onApply={(isoDate) => bulk({ unlock_at: isoDate || null }, isoDate ? 'Claim timer set' : 'Timers cleared')}
        count={selected.size}
      />
      <AllocateModal
        open={allocateOpen}
        onClose={() => setAllocateOpen(false)}
        profiles={profiles}
        count={selected.size}
        onApply={(pid) => bulk(pid ? { allocated_to: pid, published: true } : { allocated_to: null }, pid ? 'Allocated' : 'Allocation cleared')}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function fmtCountdown(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

function MarketRow({
  lead, index, checked, onToggle, onEdit, onDelete, profileName,
}: {
  lead: MarketLead
  index: number
  checked: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  profileName: (id: string | null) => string | null
}) {
  const state = marketLeadState(lead)
  const countdown = state === 'locked' ? fmtCountdown(lead.unlock_at) : null
  const claimer = lead.claimed_by ? profileName(lead.claimed_by) : null
  const allocatee = lead.allocated_to ? profileName(lead.allocated_to) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.25) }}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        checked ? 'border-info/40 bg-infoBg/40 dark:bg-infoBg/20' : 'border-line bg-surface hover:border-ink-200'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-[rgb(10,10,10)]" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{lead.name}</p>
        <p className="truncate text-2xs text-ink-400">
          {[lead.phone, lead.industry, lead.address, lead.domain].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div className="hidden shrink-0 sm:block">
        {state === 'claimed' ? (
          <Badge tone="neutral" dot>Claimed{claimer ? ` · ${claimer}` : ''}</Badge>
        ) : state === 'draft' ? (
          <Badge tone="neutral">Hidden</Badge>
        ) : state === 'locked' ? (
          <Badge tone="warn" dot>🔒 {countdown}</Badge>
        ) : state === 'allocated' ? (
          <Badge tone="info" dot>Reserved · {allocatee}</Badge>
        ) : (
          <Badge tone="pos" dot>Live</Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onEdit} title="Edit" className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]">
          <Pencil size={14} strokeWidth={1.75} />
        </button>
        <button onClick={onDelete} title="Remove" className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-negBg hover:text-neg">
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Import JSON modal                                                   */
/* ------------------------------------------------------------------ */

const SAMPLE = `[
  {
    "name": "Acme Manufacturing GmbH",
    "website": "https://acme.de",
    "phone": "+49 30 12345678",
    "industry": "Manufacturing",
    "address": "Industriestrasse 12, Berlin, Germany",
    "vat_number": "",
    "description": "Mid-size industrial supplier.",
    "summary": "Potential fit for our retainer package."
  }
]`

function ImportModal({
  open, onClose, adminId, existingNames, onDone,
}: {
  open: boolean
  onClose: () => void
  adminId: string
  existingNames: Set<string>
  onDone: () => void
}) {
  const { push } = useToast()
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<{ ok: number; bad: number; dupes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) { setRaw(''); setParsed(null) }
  }, [open])

  function validate() {
    try {
      const data = JSON.parse(raw)
      const arr = Array.isArray(data) ? data : [data]
      let ok = 0, bad = 0, dupes = 0
      for (const item of arr) {
        if (typeof item?.name === 'string' && item.name.trim()) {
          const key = item.name.toLowerCase().trim()
          if (existingNames.has(key)) dupes++
          else ok++
        } else bad++
      }
      setParsed({ ok, bad, dupes })
    } catch {
      push({ tone: 'error', title: 'Invalid JSON', desc: 'Paste an array of lead objects.' })
      setParsed(null)
    }
  }

  async function doImport() {
    if (!parsed || parsed.ok === 0) return
    setBusy(true)
    try {
      const data = JSON.parse(raw)
      const arr = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[]
      let imported = 0
      for (const item of arr) {
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name || existingNames.has(name.toLowerCase())) continue
        await db.createMarketLead(
          {
            name,
            website: String(item.website ?? ''),
            domain: String(item.domain ?? ''),
            vat_number: String(item.vat_number ?? ''),
            industry: String(item.industry ?? ''),
            description: String(item.description ?? ''),
            address: String(item.address ?? ''),
            logo_url: String(item.logo_url ?? ''),
            summary: String(item.summary ?? ''),
            phone: String(item.phone ?? ''),
            published: false,
            unlock_at: null,
            allocated_to: null,
          },
          adminId,
        )
        imported++
      }
      push({ tone: 'success', title: `${imported} leads imported`, desc: 'They are hidden — publish them when ready.' })
      onDone()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Import failed', desc: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={<span className="flex items-center gap-2"><FileJson size={17} strokeWidth={1.75} /> Import leads via JSON</span>}
      desc="Follows the same structure as creating a lead on the platform. Imported leads land hidden — publish when ready."
      footer={
        <>
          <Button variant="secondary" onClick={() => setRaw(SAMPLE)}>Load sample</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={doImport} disabled={!parsed || parsed.ok === 0 || busy}>
              {busy ? 'Importing…' : parsed ? `Import ${parsed.ok} lead${parsed.ok === 1 ? '' : 's'}` : 'Validate first'}
            </Button>
          </div>
        </>
      }
    >
      <Field label="JSON payload" hint="Array of objects — name required; phone, website, industry, address, description, summary, vat_number, logo_url optional. Phone is what members use to contact the company after claiming.">
        <Textarea value={raw} onChange={(e) => { setRaw(e.target.value); setParsed(null) }} rows={9} placeholder={SAMPLE} className="font-mono text-xs" />
      </Field>
      {raw.trim() && (
        <div className="mt-3 flex items-center gap-2">
          {!parsed ? (
            <Button variant="secondary" size="sm" icon={<CheckSquare size={13} strokeWidth={1.75} />} onClick={validate}>Validate</Button>
          ) : (
            <p className="text-xs text-ink-400">
              <span className="num font-bold text-pos">{parsed.ok} valid</span>
              {parsed.dupes > 0 && <> · <span className="num font-bold text-warn">{parsed.dupes} duplicates skipped</span></>}
              {parsed.bad > 0 && <> · <span className="num font-bold text-neg">{parsed.bad} invalid</span></>}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Edit / Add modal                                                    */
/* ------------------------------------------------------------------ */

function LeadForm({
  lead, profiles, onSave, saving, saveLabel,
}: {
  lead: MarketLead | null
  profiles: Profile[]
  onSave: (patch: Partial<MarketLead>) => void
  saving: boolean
  saveLabel: string
}) {
  const [form, setForm] = useState(() => ({
    name: lead?.name ?? '',
    website: lead?.website ?? '',
    industry: lead?.industry ?? '',
    address: lead?.address ?? '',
    vat_number: lead?.vat_number ?? '',
    description: lead?.description ?? '',
    summary: lead?.summary ?? '',
    phone: (lead as MarketLead | null)?.phone ?? '',
    published: lead?.published ?? false,
    unlock_at: lead?.unlock_at ?? '',
    allocated_to: lead?.allocated_to ?? null as string | null,
  }))
  const [q, setQ] = useState('')

  const visibleProfiles = useMemo(() => {
    const s = q.toLowerCase().trim()
    return s ? profiles.filter((p) => p.full_name.toLowerCase().includes(s)) : profiles
  }, [profiles, q])

  return (
    <div className="space-y-4">
      <Field label="Company name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Website"><Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" /></Field>
        <Field label="Industry"><Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone" hint="How members contact the company after claiming."><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+49 …" /></Field>
        <Field label="Address"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="VAT number"><Input value={form.vat_number} onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))} /></Field>
        <Field label="Summary"><Input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} /></Field>
      </div>
      <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} /></Field>

      <div className="rounded-xl border border-line p-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          Visible in marketplace
          <button
            type="button"
            role="switch"
            aria-checked={form.published}
            onClick={() => setForm((f) => ({ ...f, published: !f.published }))}
            className={`relative h-6 w-11 rounded-full transition-colors ${form.published ? 'bg-pos' : 'bg-ink-200'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form.published ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
        <div className="mt-3">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">Claim timer</p>
          <div className="flex items-center gap-2">
            <DateTimePicker value={form.unlock_at} onChange={(v) => setForm((f) => ({ ...f, unlock_at: v }))} />
            {form.unlock_at && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, unlock_at: '' }))} className="rounded-lg p-2 text-ink-400 hover:bg-ink-50 hover:text-neg dark:hover:bg-[rgb(28,28,28)]">
                <XSquare size={15} strokeWidth={1.75} />
              </button>
            )}
          </div>
          <p className="mt-1 text-2xs text-ink-400">Locked until this moment — members see a live countdown.</p>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">Allocate to</p>
          <ProfileCombobox profiles={visibleProfiles} value={form.allocated_to} onChange={(id) => setForm((f) => ({ ...f, allocated_to: id }))} />
        </div>
      </div>

      <Button block onClick={() =>
        onSave({
          name: form.name.trim(),
          website: form.website.trim(),
          industry: form.industry.trim(),
          address: form.address.trim(),
          vat_number: form.vat_number.trim(),
          description: form.description.trim(),
          summary: form.summary.trim(),
          phone: form.phone.trim(),
          published: form.published,
          unlock_at: form.unlock_at || null,
          allocated_to: form.allocated_to,
        })
      } disabled={saving || !form.name.trim()}>
        {saveLabel}
      </Button>
    </div>
  )
}

function EditModal({ open, onClose, lead, profiles, onDone }: {
  open: boolean; onClose: () => void; lead: MarketLead | null; profiles: Profile[]; onDone: () => void
}) {
  const { push } = useToast()
  const [saving, setSaving] = useState(false)
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Edit marketplace lead" desc="Changes apply instantly for every member.">
      {lead && (
        <LeadForm
          key={lead.id}
          lead={lead}
          profiles={profiles}
          saving={saving}
          saveLabel="Save changes"
          onSave={async (patch) => {
            setSaving(true)
            try {
              await db.updateMarketLead(lead.id, patch)
              push({ tone: 'success', title: 'Lead updated' })
              onDone()
            } catch (e: any) {
              push({ tone: 'error', title: 'Could not save', desc: e?.message })
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </Modal>
  )
}

function AddModal({ open, onClose, adminId, onDone }: {
  open: boolean; onClose: () => void; adminId: string; onDone: () => void
}) {
  const { push } = useToast()
  const [saving, setSaving] = useState(false)
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add marketplace lead" desc="Starts hidden — flip visibility when it should go live.">
      <LeadForm
        lead={null}
        profiles={[]}
        saving={saving}
        saveLabel="Add to pool"
        onSave={async (patch) => {
          setSaving(true)
          try {
            await db.createMarketLead({ ...(patch as Partial<MarketLead>), name: patch.name! }, adminId)
            push({ tone: 'success', title: 'Lead added to pool' })
            onDone()
          } catch (e: any) {
            push({ tone: 'error', title: 'Could not add', desc: e?.message })
          } finally {
            setSaving(false)
          }
        }}
      />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Bulk timer + allocate modals                                        */
/* ------------------------------------------------------------------ */

function TimerModal({ open, onClose, onApply, count }: {
  open: boolean; onClose: () => void; onApply: (iso: string | null) => void; count: number
}) {
  const [val, setVal] = useState('')
  const { push } = useToast()
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Set claim timer"
      desc={`${count} lead${count === 1 ? '' : 's'} stay locked until this moment.`}
      footer={
        <>
          {val && <Button variant="ghost" onClick={() => { setVal(''); onApply(null); onClose() }}>Clear timers</Button>}
          <Button onClick={() => { if (!val) { push({ tone: 'info', title: 'Pick a date/time or clear' }); return } onApply(val); onClose() }}>Apply</Button>
        </>
      }
    >
      <div className="space-y-3">
        <DateTimePicker value={val} onChange={setVal} />
        <div className="flex flex-wrap gap-1.5">
          {[['+1 hour', 1], ['+24 hours', 24], ['+3 days', 72]].map(([label, h]) => (
            <button
              key={label as string}
              onClick={() => setVal(new Date(Date.now() + (h as number) * 3600000).toISOString())}
              className="rounded-full border border-line px-3 py-1.5 text-2xs font-medium transition-colors hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function AllocateModal({ open, onClose, profiles, count, onApply }: {
  open: boolean; onClose: () => void; profiles: Profile[]; count: number; onApply: (profileId: string | null) => void
}) {
  const [pid, setPid] = useState<string | null>(null)
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Allocate leads"
      desc={`${count} lead${count === 1 ? '' : 's'} will be reserved for one person only.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onApply(pid); onClose() }}>Allocate</Button>
        </>
      }
    >
      <div className="min-h-[140px]">
        <p className="mb-3 text-2xs text-ink-400">Search members below — clearing the selection opens the leads back up to everyone.</p>
        <ProfileCombobox profiles={profiles} value={pid} onChange={setPid} />
      </div>
    </Modal>
  )
}
