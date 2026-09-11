import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Upload, Plus, Pencil, Trash2, Eye, EyeOff, Search, UsersRound,
  Clock, Store, CheckSquare, XSquare, FileJson, X, Layers,
} from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { MarketLead, MarketplaceIndustry, Profile } from '../../lib/types'
import { marketLeadState } from '../../lib/types'
import { Button } from '../ui/Button'
import { Input, Field, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { MotionBorder } from '../ui/MotionBorder'
import { DateTimePicker } from '../ui/DateTimePicker'
import { ProfileCombobox } from '../marketplace/ProfileCombobox'
import { useToast } from '../../context/ToastContext'
import { eur, dateShort } from '../../lib/format'

const PAGE_SIZE = 50
const FILTERS_KEY = 'mkt-admin-filters-v1'

type StatusFilter = 'all' | 'live' | 'draft' | 'locked' | 'allocated' | 'claimed'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Hidden' },
  { value: 'locked', label: 'Locked' },
  { value: 'allocated', label: 'Reserved' },
  { value: 'claimed', label: 'Claimed' },
]

/** Points helper — pool ledgers are points, bonuses stay euros. */
const pts = (n: number) => `${Math.round(n).toLocaleString('en')} pts`

export function MarketplaceManager({ adminId }: { adminId: string }) {
  const { push } = useToast()

  /* Filters — remembered per session */
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [debounced, setDebounced] = useState('')
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const raw = localStorage.getItem(FILTERS_KEY)
      if (raw) {
        const f = JSON.parse(raw)
        if (typeof f.search === 'string') { setSearch(f.search); setDebounced(f.search) }
        if (typeof f.industry === 'string') setIndustry(f.industry)
        if (typeof f.status === 'string') setStatus(f.status)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!restored.current) return
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ search, industry, status })) } catch { /* ignore */ }
  }, [search, industry, status])

  /* Paged rows */
  const [rows, setRows] = useState<MarketLead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const rowsRef = useRef<MarketLead[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const load = useCallback(async (reset: boolean) => {
    reset ? setLoading(true) : setLoadingMore(true)
    const res = await db.queryMarketLeads({
      limit: PAGE_SIZE,
      offset: reset ? 0 : rowsRef.current.length,
      search: debounced,
      industry: industry === 'all' ? '' : industry,
      status,
    })
    setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]))
    setTotal(res.total)
    setLoading(false)
    setLoadingMore(false)
  }, [debounced, industry, status])

  useEffect(() => { void load(true) }, [load])

  /* Library + counts + stats */
  const libQ = useAsync(async () => db.listMarketIndustries(), [])
  const countsQ = useAsync(async () => db.countMarketLeadsByIndustry({}), [])
  const statsQ = useAsync(async () => ({
    total: await db.countMarketLeads({}),
    live: await db.countMarketLeads({ status: 'live' }),
    hidden: await db.countMarketLeads({ status: 'draft' }),
    claimed: await db.countMarketLeads({ status: 'claimed' }),
  }), [total])

  const profilesQ = useAsync(async () => db.listProfiles(), [])
  const profiles = useMemo(() => (profilesQ.data || []).filter((p) => p.role !== 'admin'), [profilesQ.data])
  const importsQ = useAsync(async () => db.listMarketplaceImports(), [])
  const profileName = useCallback((id: string | null) =>
    (profilesQ.data || []).find((p) => p.id === id)?.full_name ?? (id ? 'Member' : null), [profilesQ.data])

  /* Selection */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allShownSelected = rows.length > 0 && rows.every((l) => selected.has(l.id))

  async function selectAllFiltered() {
    const ids: string[] = []
    let from = 0
    for (;;) {
      const { rows: page, total: t } = await db.queryMarketLeads({
        limit: 1000, offset: from, search: debounced,
        industry: industry === 'all' ? '' : industry, status,
      })
      ids.push(...page.map((l) => l.id))
      if (page.length < 1000 || ids.length >= t) break
      from += 1000
    }
    setSelected(new Set(ids))
    push({ tone: 'info', title: `${ids.length} leads selected` })
  }

  /* Countdown tick only when needed */
  const hasCountdown = useMemo(
    () => rows.some((l) => l.unlock_at && !l.claimed_by && new Date(l.unlock_at).getTime() > Date.now()),
    [rows],
  )
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hasCountdown) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [hasCountdown])

  function refreshAll() {
    void load(true)
    libQ.reload(); countsQ.reload(); statsQ.reload()
  }

  /* Modals */
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MarketLead | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [setIndustryOpen, setSetIndustryOpen] = useState(false)
  const [bulkScope, setBulkScope] = useState<'selected' | { industry: string } | null>(null)

  function bulkConfirm(title: string, desc: string, action: () => Promise<void>) {
    setBulkScope('selected')
    setBulkConfirmState({ title, desc, action })
    setBulkOpen(true)
  }
  const [bulkConfirmState, setBulkConfirmState] = useState<{ title: string; desc: string; action: () => Promise<void> } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  function closeBulk() { setBulkOpen(false); setBulkConfirmState(null) }

  async function applyBulk(patch: Partial<MarketLead>, okMsg: string) {
    try {
      if (bulkScope && bulkScope !== 'selected') {
        const n = await db.bulkUpdateMarketLeadsByFilter({ industry: bulkScope.industry }, patch)
        push({ tone: 'success', title: okMsg, desc: `${n} leads updated.` })
      } else {
        await db.bulkUpdateMarketLeads([...selected], patch)
        push({ tone: 'success', title: okMsg, desc: `${selected.size} lead${selected.size === 1 ? '' : 's'} updated.` })
        setSelected(new Set())
      }
      refreshAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Bulk update failed', desc: e?.message })
    } finally { closeBulk() }
  }

  async function bulkDelete() {
    try {
      await db.bulkDeleteMarketLeads([...selected])
      push({ tone: 'success', title: 'Leads removed' })
      setSelected(new Set())
      refreshAll()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    } finally { closeBulk() }
  }

  async function removeOne(l: MarketLead) {
    if (!confirm(`Remove "${l.name}"?`)) return
    try {
      await db.deleteMarketLead(l.id)
      push({ tone: 'success', title: 'Lead removed' })
      void load(true)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function toggleFreeze(c: MarketLead) {
    try {
      await db.updateMarketLead(c.id, { published: !c.published })
      void load(true)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }
  void toggleFreeze

  const counts = {
    total: statsQ.data?.total ?? 0,
    live: statsQ.data?.live ?? 0,
    hidden: statsQ.data?.hidden ?? 0,
    claimed: statsQ.data?.claimed ?? 0,
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the pool…"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-ink"
          />
        </div>
        <Button variant="secondary" icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAddOpen(true)}>Add lead</Button>
        <Button icon={<Upload size={15} strokeWidth={1.75} />} onClick={() => setImportOpen(true)}>Import JSON</Button>
      </div>

      {/* Summary chips — true totals */}
      <div className="mb-4 flex flex-wrap gap-1.5 text-2xs font-semibold">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 num">{counts.total} in pool</span>
        <span className="rounded-full border border-pos/25 bg-posBg px-2.5 py-1 text-pos num">{counts.live} live</span>
        <span className="rounded-full border border-line bg-ink-50 px-2.5 py-1 text-ink-400 dark:bg-transparent num">{counts.hidden} hidden</span>
        <span className="rounded-full border border-info/25 bg-infoBg px-2.5 py-1 text-info num">{counts.claimed} claimed</span>
      </div>

      {/* Import history */}
      {(importsQ.data || []).length > 0 && (
        <details className="mb-4 rounded-2xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-ink-500 dark:text-ink-300">
            Import history · {(importsQ.data || []).length}
          </summary>
          <div className="space-y-1 px-3 pb-3">
            {(importsQ.data || []).map((imp) => (
              <div key={imp.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-xs">
                <span className="num font-bold text-info">{imp.count}</span>
                <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-300">{imp.industry ? `Categorized as "${imp.industry}"` : 'Mixed / JSON values'}</span>
                <span className="num shrink-0 text-2xs text-ink-400">{dateShort(imp.created_at)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Sticky filter chips — category library + status */}
      <div className="sticky top-2 z-20 mb-4 space-y-2 rounded-2xl border border-line bg-canvas/90 p-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 pr-1 text-2xs font-bold uppercase tracking-wider text-ink-300">Category</span>
          <button
            onClick={() => setIndustry('all')}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${industry === 'all' ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-500 hover:text-ink'}`}
          >
            All <span className="num opacity-60">{statsQ.data?.total ?? 0}</span>
          </button>
          {(libQ.data || []).map((ind) => {
            const cnt = countsQ.data?.get(ind.name) ?? 0
            const active = industry === ind.name
            return (
              <span key={ind.id} className="relative shrink-0">
                <button
                  onClick={() => setIndustry(industry === ind.name ? 'all' : ind.name)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${industry === ind.name ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-500 hover:border-ink-200 hover:text-ink'}`}
                >
                  {ind.name} <span className="num opacity-60">{cnt}</span>
                </button>
                {industry === ind.name && (
                  <span className="ml-1 inline-flex overflow-hidden rounded-full border border-line align-middle">
                    <button
                      onClick={() => openBulkConfirm(`Publish only "${ind.name}"?`, 'Other categories keep their current visibility — every lead in this category becomes claimable.', async () => {
                        const n = await db.bulkUpdateMarketLeadsByFilter({ industry: ind.name }, { published: true })
                        await db.bulkUpdateMarketLeadsByFilter({ excludeIndustry: ind.name }, { published: false })
                        push({ tone: 'success', title: `${n} leads published — focus mode on` })
                        refreshAll()
                      })}
                      title="Publish only this category (hides the rest)"
                      className="bg-surface px-2 py-1.5 text-[9px] font-black uppercase tracking-wide text-pos hover:bg-posBg"
                    >
                      Focus
                    </button>
                    <button
                      onClick={() => openBulkConfirm(`Hide "${ind.name}"?`, 'Every lead in this category becomes unclaimable.', async () => {
                        const n = await db.bulkUpdateMarketLeadsByFilter({ industry: ind.name }, { published: false })
                        push({ tone: 'success', title: `${n} leads hidden` })
                        refreshAll()
                      })}
                      title="Hide this category"
                      className="bg-surface px-2 py-1 text-ink-400 hover:bg-negBg hover:text-neg"
                    >
                      <EyeOff size={11} strokeWidth={2} />
                    </button>
                  </span>
                )}
              </span>
            )
          })}
          {search && (
            <button onClick={() => setSearch('')} className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1.5 text-2xs font-medium text-ink-400 hover:text-ink">
              Clear search <X size={10} strokeWidth={2} className="inline" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 pr-1 text-2xs font-bold uppercase tracking-wider text-ink-300">Status</span>
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setStatus(c.value)}
              className={`shrink-0 rounded-full border px-3 py-1 text-2xs font-semibold transition-colors ${status === c.value ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-500 hover:text-ink'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="sticky top-[118px] z-20 mb-4">
          <MotionBorder colors={['#f59e0b', '#8b5cf6', '#f59e0b']} speed={6}>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
              <span className="num mr-1 text-xs font-bold">{selected.size} selected</span>
              <Button variant="ghost" size="sm" icon={<Eye size={13} strokeWidth={1.75} />} onClick={() => openBulkConfirm('Publish leads?', `${selected.size} leads become claimable.`, () => applyBulk({ published: true }, 'Published to marketplace'))}>Publish</Button>
              <Button variant="ghost" size="sm" icon={<EyeOff size={13} strokeWidth={1.75} />} onClick={() => openBulkConfirm('Hide leads?', `${selected.size} leads become unclaimable.`, () => applyBulk({ published: false }, 'Hidden from marketplace'))}>Hide</Button>
              <Button variant="ghost" size="sm" icon={<Clock size={13} strokeWidth={1.75} />} onClick={() => setTimerOpen(true)}>Claim timer</Button>
              <Button variant="ghost" size="sm" icon={<UsersRound size={13} strokeWidth={1.75} />} onClick={() => setAllocateOpen(true)}>Allocate</Button>
              <Button variant="ghost" size="sm" icon={<Layers size={13} strokeWidth={1.75} />} onClick={() => setSetIndustryOpen(true)}>Set industry</Button>
              <Button variant="ghost" size="sm" className="text-neg hover:bg-negBg" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => openBulkConfirm('Delete leads?', `${selected.size} leads and their progress history will be removed.`, bulkDelete)}>Delete</Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]"><X size={14} strokeWidth={1.75} /></button>
            </div>
          </MotionBorder>
        </motion.div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Store size={22} strokeWidth={1.5} />}
          title={total === 0 ? 'The marketplace shelf is empty' : 'No matches'}
          desc={total === 0 ? 'Import companies via JSON or add them manually — then publish to make them claimable.' : 'Try clearing the filters.'}
        />
      ) : (
        <>
          <label className="flex items-center gap-3 px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-400">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={() => setSelected(allShownSelected ? new Set() : new Set(rows.map((l) => l.id)))}
              className="h-4 w-4 accent-[rgb(10,10,10)]"
            />
            <span className="flex-1">Lead</span>
            <button onClick={() => void selectAllFiltered()} className="shrink-0 font-semibold text-info hover:underline">
              Select all filtered ({total})
            </button>
            <span className="hidden w-32 sm:block">Status</span>
          </label>

          {rows.map((l, i) => (
            <MarketRow
              key={l.id}
              lead={l}
              index={i % PAGE_SIZE}
              checked={selected.has(l.id)}
              onToggle={() => toggle(l.id)}
              onEdit={() => { setEditTarget(l); setEditOpen(true) }}
              onDelete={() => removeOne(l)}
              profileName={profileName}
            />
          ))}

          {rows.length < total && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" disabled={loadingMore} icon={<Layers size={14} strokeWidth={1.75} />} onClick={() => void load(false)}>
                {loadingMore ? 'Loading…' : `Load more (${total - rows.length} left)`}
              </Button>
            </div>
          )}
          <p className="mt-3 text-center text-2xs text-ink-300 num">Showing {rows.length} of {total}</p>
        </>
      )}

      {/* Import */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        adminId={adminId}
        industries={libQ.data || []}
        onDone={refreshAll}
      />

      {/* Edit / Add */}
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} lead={editTarget} onDone={refreshAll} />
      <AddModal open={addOpen} onClose={() => setAddOpen(false)} adminId={adminId} onDone={refreshAll} />

      {/* Bulk modals */}
      <TimerModal open={timerOpen} onClose={() => setTimerOpen(false)} onApply={(iso) => applyBulk({ unlock_at: iso || null }, iso ? 'Claim timer set' : 'Timers cleared')} count={selected.size} />
      <AllocateModal open={allocateOpen} onClose={() => setAllocateOpen(false)} profiles={profiles} count={selected.size} onApply={(pid) => applyBulk(pid ? { allocated_to: pid, published: true } : { allocated_to: null }, pid ? 'Allocated' : 'Allocation cleared')} />
      <SetIndustryModal open={setIndustryOpen} industries={libQ.data || []} onClose={() => setSetIndustryOpen(false)} onApply={(name) => applyBulk({ industry: name }, `Category set to "${name}"`)} />

      {/* Bulk confirm */}
      <Modal open={bulkOpen} onClose={closeBulk} size="sm" title={bulkConfirmState?.title ?? ''} desc={bulkConfirmState?.desc}
        footer={
          <>
            <Button variant="secondary" onClick={closeBulk}>Cancel</Button>
            <Button onClick={async () => { const a = bulkConfirmState?.action; closeBulk(); if (a) await a() }}>Apply</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">The action runs server-side across the whole selection.</p>
      </Modal>
    </div>
  )

  function openBulkConfirm(title: string, desc: string, action: () => Promise<void>) {
    setBulkConfirmState({ title, desc, action })
    setBulkOpen(true)
  }
}

/* ------------------------------------------------------------------ */
/* Import JSON modal — batch industry rename + preview stats           */
/* ------------------------------------------------------------------ */

const SAMPLE = `[
  {
    "name": "Acme Manufacturing GmbH",
    "website": "https://acme.de",
    "phone": "+49 30 12345678",
    "industry": "sample",
    "address": "Industriestrasse 12, Berlin, Germany",
    "description": "Mid-size industrial supplier.",
    "summary": "Potential fit for our retainer package."
  }
]`

function ImportModal({
  open, onClose, adminId, industries, onDone,
}: {
  open: boolean
  onClose: () => void
  adminId: string
  industries: MarketplaceIndustry[]
  onDone: () => void
}) {
  const { push } = useToast()
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<{ ok: number; bad: number; dupes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [useNew, setUseNew] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    if (!open) { setRaw(''); setParsed(null); setCategory(''); setUseNew(false); setNewCategory('') }
  }, [open])

  const effectiveCategory = useNew ? newCategory.trim() : category

  function validate() {
    try {
      const data = JSON.parse(raw)
      const arr = Array.isArray(data) ? data : [data]
      let ok = 0, bad = 0, dupes = 0
      for (const item of arr) {
        if (typeof item?.name === 'string' && item.name.trim()) {
          const key = item.name.toLowerCase().trim()
          if (existingNamesCheck(key)) dupes++
          else ok++
        } else bad++
      }
      setParsed({ ok, bad, dupes })
    } catch {
      push({ tone: 'error', title: 'Invalid JSON', desc: 'Paste an array of lead objects.' })
      setParsed(null)
    }
  }

  function existingNamesCheck(key: string): boolean {
    // Duplicate check happens against the live companies table at claim
    // time (domain uniq) — here we just count JSON-internal duplicates.
    return internalNames.has(key)
  }
  const internalNames = useMemo(() => {
    try {
      const data = JSON.parse(raw)
      const arr = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[]
      const seen = new Set<string>(); let dupe = 0
      for (const item of arr) {
        const k = typeof item?.name === 'string' ? item.name.toLowerCase().trim() : ''
        if (!k) continue
        if (seen.has(k)) dupe++
        seen.add(k)
      }
      void dupe
      return seen
    } catch { return new Set<string>() }
  }, [raw])

  async function doImport() {
    if (!parsed || parsed.ok === 0) return
    setBusy(true)
    try {
      const data = JSON.parse(raw)
      const arr = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[]
      let imported = 0
      for (const item of arr) {
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const industry = effectiveCategory || String(item.industry ?? '')
        await db.createMarketLead(
          {
            name,
            website: String(item.website ?? ''),
            domain: String(item.domain ?? ''),
            vat_number: String(item.vat_number ?? ''),
            industry,
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
      if (effectiveCategory) {
        await db.addMarketIndustry(effectiveCategory)
        await db.logMarketplaceImport(imported, effectiveCategory, adminId)
      }
      push({ tone: 'success', title: `${imported} leads imported`, desc: effectiveCategory ? `Categorized as "${effectiveCategory}" — hidden until you publish.` : 'They are hidden — publish when ready.' })
      onDone()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Import failed', desc: e?.message })
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={<span className="flex items-center gap-2"><FileJson size={17} strokeWidth={1.75} /> Import leads via JSON</span>}
      desc="Same structure as creating a lead. Imported leads land hidden — publish when ready."
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
      <div className="space-y-4">
        <Field label="Category for this batch" hint="Saved category or new — overrides every industry in this JSON. Empty = keep JSON values.">
          {!useNew ? (
            <div className="flex gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface px-3 text-sm"
              >
                <option value="">Keep JSON values</option>
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.name}>{ind.name}</option>
                ))}
              </select>
              <Button variant="ghost" onClick={() => setUseNew(true)} className="shrink-0 whitespace-nowrap">+ New</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Transport and Logistics" autoFocus />
              <Button variant="ghost" onClick={() => { setUseNew(false); setNewCategory('') }} className="shrink-0 whitespace-nowrap">Saved list</Button>
            </div>
          )}
        </Field>

        <Field label="JSON payload" hint="Name required; phone, website, industry, address, description, summary, vat_number, logo_url optional.">
          <Textarea value={raw} onChange={(e) => { setRaw(e.target.value); setParsed(null) }} rows={8} placeholder={SAMPLE} className="font-mono text-xs" />
        </Field>

        {raw.trim() && (
          <div className="flex items-center gap-2">
            {!parsed ? (
              <Button variant="secondary" size="sm" icon={<CheckSquare size={13} strokeWidth={1.75} />} onClick={validate}>Validate</Button>
            ) : (
              <p className="text-xs text-ink-400">
                <span className="num font-bold text-pos">{parsed.ok} valid</span>
                {parsed.bad > 0 && <> · <span className="num font-bold text-neg">{parsed.bad} invalid</span></>}
                {effectiveCategory && <> · will be categorized as <span className="font-bold text-info">"{effectiveCategory}"</span></>}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Edit / Add lead form                                                */
/* ------------------------------------------------------------------ */
function LeadForm({ lead, saving, saveLabel, onSave }: {
  lead: MarketLead | null
  saving: boolean
  saveLabel: string
  onSave: (patch: Partial<MarketLead>) => void
}) {
  const [form, setForm] = useState(() => ({
    name: lead?.name ?? '',
    website: lead?.website ?? '',
    industry: lead?.industry ?? '',
    address: lead?.address ?? '',
    vat_number: lead?.vat_number ?? '',
    description: lead?.description ?? '',
    summary: lead?.summary ?? '',
    phone: lead?.phone ?? '',
    published: lead?.published ?? false,
    unlock_at: lead?.unlock_at ?? '',
  }))

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
          <Input value={form.unlock_at} onChange={(e) => setForm((f) => ({ ...f, unlock_at: e.target.value }))} placeholder="Empty — claimable immediately once published" className="num" />
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
        })
      } disabled={saving || !form.name.trim()}>
        {saveLabel}
      </Button>
    </div>
  )
}

function EditModal({ open, onClose, lead, onDone }: {
  open: boolean; onClose: () => void; lead: MarketLead | null; onDone: () => void
}) {
  const { push } = useToast()
  const [saving, setSaving] = useState(false)
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Edit marketplace lead" desc="Changes apply instantly for every member.">
      {lead && (
        <LeadForm
          key={lead.id}
          lead={lead}
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
            } finally { setSaving(false) }
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
          } finally { setSaving(false) }
        }}
      />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Bulk timer / allocate / set-industry                                */
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
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="YYYY-MM-DD HH:mm" className="num" />
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

function SetIndustryModal({ open, industries, onClose, onApply }: {
  open: boolean; onClose: () => void; industries: MarketplaceIndustry[]; onApply: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [useNew, setUseNew] = useState(false)
  const [newName, setNewName] = useState('')
  const { push } = useToast()
  const effective = useNew ? newName.trim() : name
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Set industry"
      desc="Assign a saved category — or create a new one on the fly."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!effective) { push({ tone: 'info', title: 'Pick a category' }); return } onApply(effective); onClose() }}>Apply</Button>
        </>
      }
    >
      <div className="space-y-3">
        {!useNew ? (
          <select value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface px-3 text-sm">
            <option value="">Choose category…</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.name}>{ind.name}</option>
            ))}
          </select>
        ) : (
          <Input value={newName} onChange={(e) => setName(e.target.value)} placeholder="New category name" autoFocus />
        )}
        <button onClick={() => setUseNew(!useNew)} className="text-2xs font-semibold text-info hover:underline">
          {useNew ? '← pick from saved categories' : '+ New category…'}
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Row + countdown                                                     */
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