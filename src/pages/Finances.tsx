import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Wallet, Scale, Plus, Printer, Trash2, X, Pencil,
  ShoppingBag, Receipt, FileText, ArrowLeft, Briefcase, Calculator, FileText as InvoiceIcon,
} from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Textarea, Select, Field } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { useAuth } from '../context/AuthContext'
import { FormalBalanceSheetDocument } from '../components/FormalBalanceSheetDocument'
import { InvoicesTab } from '../components/InvoicesTab'
import { ContractsTab } from '../components/ContractsTab'
import {
  FINANCE_CATEGORY_META,
  FINANCE_REVENUE_CATEGORIES,
  FINANCE_COST_CATEGORIES,
} from '../lib/types'
import type { FinanceEntry, FinanceCategory, FinanceKind, Deal } from '../lib/types'
import { eur, eurFull, dateShort, dateLong } from '../lib/format'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
type PeriodPreset = 'month' | 'quarter' | 'year' | 'all' | 'custom'
type SubTab = 'finance' | 'invoices' | 'contracts'

const NOW = new Date()

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function presetRange(p: PeriodPreset): { from: string; to: string } {
  const to = toISODate(NOW)
  if (p === 'all') {
    return { from: '2000-01-01', to: '2999-12-31' }
  }
  const d = new Date(NOW)
  if (p === 'year') {
    const from = new Date(d.getFullYear(), 0, 1)
    return { from: toISODate(from), to }
  }
  if (p === 'quarter') {
    const q = Math.floor(d.getMonth() / 3)
    const from = new Date(d.getFullYear(), q * 3, 1)
    return { from: toISODate(from), to }
  }
  // month
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  return { from: toISODate(from), to }
}

function rangeLabel(preset: PeriodPreset, from: string, to: string): string {
  if (preset === 'all') return 'All time'
  if (preset === 'custom') return `${dateShort(from)} – ${dateShort(to)}`
  if (preset === 'month') return new Date(from).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  if (preset === 'quarter') {
    const y = new Date(from).getFullYear()
    const q = Math.floor(new Date(from).getMonth() / 3) + 1
    return `Q${q} ${y}`
  }
  return new Date(from).getFullYear().toString()
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
export default function Finances() {
  const { push } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, reload } = useAsync(async () => {
    const [entries, deals] = await Promise.all([db.listFinanceEntries(), db.listDeals()])
    return { entries, deals: deals as Deal[] }
  }, [user?.id])

  const [subtab, setSubtab] = useState<SubTab>('finance')
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [revOpen, setRevOpen] = useState(false)
  const [costOpen, setCostOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [revSeed, setRevSeed] = useState<EntrySeed | null>(null)
  const [costSeed, setCostSeed] = useState<EntrySeed | null>(null)
  // Edit-existing-entry modal (revenue or cost).
  const [editTarget, setEditTarget] = useState<FinanceEntry | null>(null)
  // Bumped when invoices change so the finance list re-syncs (a
  // newly-paid invoice creates a revenue row).
  const [invoiceRefreshKey, setInvoiceRefreshKey] = useState(0)

  /* When preset changes, update the date range */
  useEffect(() => {
    if (preset === 'custom') return
    const r = presetRange(preset)
    setFromDate(r.from)
    setToDate(r.to)
  }, [preset])

  const entries: FinanceEntry[] = data?.entries || []
  const dealMap = useMemo(() => {
    const m: Record<string, Deal> = {}
    ;(data?.deals || []).forEach((d) => (m[d.id] = d))
    return m
  }, [data])

  /* Filter by current range */
  const filtered = useMemo(() => {
    if (!entries.length) return []
    return entries.filter((e) => {
      const d = e.entry_date
      if (fromDate && d < fromDate) return false
      if (toDate && d > toDate) return false
      return true
    })
  }, [entries, fromDate, toDate])

  const revenueEntries = useMemo(() => filtered.filter((e) => e.kind === 'revenue'), [filtered])
  const costEntries = useMemo(() => filtered.filter((e) => e.kind === 'cost'), [filtered])
  const totalRevenue = useMemo(() => revenueEntries.reduce((s, e) => s + Number(e.amount), 0), [revenueEntries])
  const totalCosts = useMemo(() => costEntries.reduce((s, e) => s + Number(e.amount), 0), [costEntries])
  const profit = totalRevenue - totalCosts

  /* Closed-deal commission auto-suggestions: any approved/closed deal without a finance entry */
  const closedDealsWithCommission = useMemo(() => {
    const usedDealIds = new Set(entries.filter((e) => e.deal_id).map((e) => e.deal_id!))
    return (data?.deals || []).filter(
      (d) => (d.status === 'closed' || d.status === 'approved') && !usedDealIds.has(d.id) && (d.collected_amount || 0) > 0,
    )
  }, [data, entries])

  async function deleteEntry(id: string) {
    if (!confirm('Delete this finance entry? This cannot be undone.')) return
    try {
      await db.deleteFinanceEntry(id)
      push({ tone: 'success', title: 'Entry deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  function ctxItems(e: FinanceEntry): CtxItem[] {
    const items: CtxItem[] = []
    if (e.deal_id) {
      items.push({ label: 'Go to deal', icon: <ArrowLeft size={15} strokeWidth={1.75} />, onClick: () => navigate(`/deals/${e.deal_id}`) })
      items.push({ divider: true })
    }
    items.push({ label: 'Edit entry', icon: <Pencil size={15} strokeWidth={1.75} />, onClick: () => setEditTarget(e) })
    items.push({ divider: true })
    items.push({ label: 'Delete entry', icon: <Trash2 size={15} strokeWidth={1.75} />, danger: true, onClick: () => deleteEntry(e.id) })
    return items
  }

  const periodLabel = rangeLabel(preset, fromDate, toDate)

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finances</h1>
          <p className="mt-1 text-sm text-ink-400">Track revenue, costs, and invoices across the platform.</p>
        </div>
      </div>

      {/* Subtabs — Finance | Invoices */}
      <div className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 w-fit no-print">
        <button
          onClick={() => setSubtab('finance')}
          className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${subtab === 'finance' ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
        >
          {subtab === 'finance' && <motion.span layoutId="fin-subtab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
          <span className="relative flex items-center gap-1.5"><Calculator size={15} strokeWidth={1.75} />Finance</span>
        </button>
        <button
          onClick={() => setSubtab('invoices')}
          className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${subtab === 'invoices' ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
        >
          {subtab === 'invoices' && <motion.span layoutId="fin-subtab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
          <span className="relative flex items-center gap-1.5"><InvoiceIcon size={15} strokeWidth={1.75} />Invoices</span>
        </button>
        <button
          onClick={() => setSubtab('contracts')}
          className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${subtab === 'contracts' ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
        >
          {subtab === 'contracts' && <motion.span layoutId="fin-subtab" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
          <span className="relative flex items-center gap-1.5"><FileText size={15} strokeWidth={1.75} />Contracts</span>
        </button>
      </div>

      {subtab === 'finance' && (
        <>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Printer size={15} strokeWidth={1.75} />} onClick={() => setPrintOpen(true)}>
              Print balance sheet
            </Button>
            <Button variant="secondary" icon={<TrendingDown size={15} strokeWidth={1.75} />} onClick={() => setCostOpen(true)}>
              Add cost
            </Button>
            <Button icon={<TrendingUp size={15} strokeWidth={1.75} />} onClick={() => setRevOpen(true)}>
              Add revenue
            </Button>
          </div>
        </div>

      {/* Period filter */}
      <Card className="mb-5 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink-700">Period</span>
          <div className="flex flex-wrap gap-1.5">
            {(['month', 'quarter', 'year', 'all'] as PeriodPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
                  preset === p ? 'bg-ink text-white' : 'border border-line text-ink-600 hover:bg-ink-50'
                }`}
              >
                {p === 'month' ? 'This month' : p === 'quarter' ? 'This quarter' : p === 'year' ? 'This year' : 'All time'}
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              className={`rounded-lg px-3 py-1.5 text-2xs font-medium transition-colors ${
                preset === 'custom' ? 'bg-ink text-white' : 'border border-line text-ink-600 hover:bg-ink-50'
              }`}
            >
              Custom
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPreset('custom') }} className="h-9 w-36" />
            <span className="text-ink-300">–</span>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPreset('custom') }} className="h-9 w-36" />
          </div>

          <div className="ml-auto text-right text-2xs text-ink-400">
            {periodLabel}
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={eur(totalRevenue)}
          tone="pos"
          icon={<TrendingUp size={16} strokeWidth={1.75} />}
          loading={loading}
        />
        <StatTile
          label="Costs"
          value={eur(totalCosts)}
          tone="neg"
          icon={<TrendingDown size={16} strokeWidth={1.75} />}
          loading={loading}
        />
        <StatTile
          label="Profit"
          value={eur(profit)}
          tone={profit >= 0 ? 'pos' : 'neg'}
          icon={<Scale size={16} strokeWidth={1.75} />}
          loading={loading}
        />
        <StatTile
          label="Closed-deal revenue not yet booked"
          value={eur(closedDealsWithCommission.reduce((s, d) => s + (d.collected_amount || 0), 0))}
          tone="warn"
          icon={<Briefcase size={16} strokeWidth={1.75} />}
          loading={loading}
          hint={`${closedDealsWithCommission.length} deal${closedDealsWithCommission.length === 1 ? '' : 's'} ready to add`}
        />
      </div>

      {/* Closed deals ready to book (suggestion strip) */}
      {closedDealsWithCommission.length > 0 && (
        <Card className="mb-5 no-print">
          <CardHeader
            title="Closed deals ready to book as revenue"
            desc="Closed/approved deals with collected amount, not yet entered into the ledger."
          />
          <div className="space-y-2">
            {closedDealsWithCommission.slice(0, 6).map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50 text-ink">
                  <Briefcase size={16} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.company || 'Untitled deal'}</p>
                  <p className="text-2xs text-ink-400">
                    Collector: {d.collected_amount ? eur(d.collected_amount) : '—'} · gross {eur(d.gross_value)} · {dateShort(d.created_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={13} strokeWidth={1.75} />}
                  onClick={() => {
                    setRevOpen(true)
                    setRevSeed({
                      kind: 'revenue',
                      category: 'closed_deal_commission',
                      title: `Commission — ${d.company} (deal)`,
                      amount: d.collected_amount || 0,
                      entry_date: toISODate(new Date(d.created_at)),
                      deal_id: d.id,
                      description: `Auto-filled from deal: ${d.contact_name || ''} · ${d.email || ''} · gross ${eur(d.gross_value)}`.trim(),
                    })
                  }}
                >
                  Book
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Revenue table */}
      <Card className="mb-5 no-print">
        <CardHeader
          title="Revenue"
          desc={`${revenueEntries.length} ${revenueEntries.length === 1 ? 'entry' : 'entries'} · ${eur(totalRevenue)}`}
          action={<Button size="sm" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => setRevOpen(true)}>Add</Button>}
        />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : revenueEntries.length === 0 ? (
          <Empty kind="revenue" />
        ) : (
          <div className="space-y-1.5">
            {revenueEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-ink-50 transition-colors"
                onContextMenu={(ev) => openContextMenu(ev, ctxItems(e))}
              >
                <RevIcon category={e.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title || FINANCE_CATEGORY_META[e.category].label}</p>
                  {e.description && <p className="truncate text-2xs text-ink-400">{e.description}</p>}
                </div>
                    <Badge tone="neutral" className="capitalize">{FINANCE_CATEGORY_META[e.category].label}</Badge>
                    <span className="text-2xs text-ink-400 w-20 text-right">{dateShort(e.entry_date)}</span>
                    <span className="num w-24 text-right text-sm font-semibold text-pos">+{eurFull(e.amount)}</span>
                    <button
                      onClick={() => setEditTarget(e)}
                      title="Edit"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-ink-100 hover:text-ink-600"
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
          </div>
        )}
      </Card>

      {/* Costs table */}
      <Card className="no-print">
        <CardHeader
          title="Costs"
          desc={`${costEntries.length} ${costEntries.length === 1 ? 'entry' : 'entries'} · ${eur(totalCosts)}`}
          action={<Button size="sm" variant="secondary" icon={<Plus size={13} strokeWidth={1.75} />} onClick={() => setCostOpen(true)}>Add</Button>}
        />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : costEntries.length === 0 ? (
          <Empty kind="cost" />
        ) : (
          <div className="space-y-1.5">
            {costEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-ink-50 transition-colors"
                onContextMenu={(ev) => openContextMenu(ev, ctxItems(e))}
              >
                <CostIcon category={e.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title || FINANCE_CATEGORY_META[e.category].label}</p>
                  {e.description && <p className="truncate text-2xs text-ink-400">{e.description}</p>}
                </div>
                    <Badge tone="neutral" className="capitalize">{FINANCE_CATEGORY_META[e.category].label}</Badge>
                    <span className="text-2xs text-ink-400 w-20 text-right">{dateShort(e.entry_date)}</span>
                    <span className="num w-24 text-right text-sm font-semibold text-neg">−{eurFull(e.amount)}</span>
                    <button
                      onClick={() => setEditTarget(e)}
                      title="Edit"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-ink-100 hover:text-ink-600"
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
          </div>
        )}
      </Card>

      {/* Modals */}
      <AddFinanceModal
        open={revOpen}
        onClose={() => { setRevOpen(false); setRevSeed(null) }}
        kind="revenue"
        seed={revSeed}
        onSaved={reload}
      />
      <AddFinanceModal
        open={costOpen}
        onClose={() => { setCostOpen(false); setCostSeed(null) }}
        kind="cost"
        seed={costSeed}
        onSaved={reload}
      />
      <EditFinanceModal
        open={!!editTarget}
        entry={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); reload() }}
      />

      {/* Print preview / balance sheet (on-screen friendly view; the
          actual printed PDF is the formal SEC-style document rendered
          below with .print-only) */}
      <PrintBalanceSheetModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        entries={filtered}
        periodLabel={periodLabel}
        fromDate={fromDate}
        toDate={toDate}
        dealMap={dealMap}
      />

      {/* Formal SEC 10-K-style document — hidden on screen, visible
          only when the browser enters print mode (see index.css
          @media print rule that hides #root and shows .print-document).
          This is what actually gets printed when the user clicks Print. */}
      <FormalBalanceSheetDocument
        entries={filtered}
        periodLabel={periodLabel}
        fromDate={fromDate}
        toDate={toDate}
        dealMap={dealMap}
      />
      </>
      )}

      {subtab === 'invoices' && (
        <InvoicesTab
          refreshKey={invoiceRefreshKey}
          onInvoicesChanged={() => {
            setInvoiceRefreshKey((k) => k + 1)
            reload()
          }}
        />
      )}

      {subtab === 'contracts' && (
        <ContractsTab
          refreshKey={invoiceRefreshKey}
          onContractsChanged={() => {
            setInvoiceRefreshKey((k) => k + 1)
            reload()
          }}
        />
      )}
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                          */
/* ------------------------------------------------------------------ */
function StatTile({
  label, value, tone, icon, loading, hint,
}: {
  label: string
  value: string
  tone: 'pos' | 'neg' | 'warn'
  icon: React.ReactNode
  loading?: boolean
  hint?: string
}) {
  const toneClass = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-warn'
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">{label}</p>
        <span className={toneClass}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-7 w-28" /> : <p className={`mt-3 num text-[26px] font-semibold leading-none tracking-tight ${toneClass}`}>{value}</p>}
      {hint && !loading && <p className="mt-2 text-2xs text-ink-400">{hint}</p>}
    </div>
  )
}

function Empty({ kind }: { kind: FinanceKind }) {
  const isRev = kind === 'revenue'
  return (
    <div className="flex flex-col items-center gap-2 py-10">
      <span className="text-ink-300">{isRev ? <TrendingUp size={20} strokeWidth={1.75} /> : <TrendingDown size={20} strokeWidth={1.75} />}</span>
      <p className="text-sm text-ink-400">No {kind} entries in this period.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Icons per category                                                 */
/* ------------------------------------------------------------------ */
function RevIcon({ category }: { category: FinanceCategory }) {
  const map: Partial<Record<FinanceCategory, React.ReactNode>> = {
    product_sale: <ShoppingBag size={14} strokeWidth={1.75} />,
    service_sale: <Receipt size={14} strokeWidth={1.75} />,
    closed_deal_commission: <Briefcase size={14} strokeWidth={1.75} />,
    other_revenue: <TrendingUp size={14} strokeWidth={1.75} />,
  }
  return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-posBg text-pos">{map[category] || <TrendingUp size={14} strokeWidth={1.75} />}</span>
}

function CostIcon({ category }: { category: FinanceCategory }) {
  return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-negBg text-neg"><TrendingDown size={14} strokeWidth={1.75} /></span>
}

/* ------------------------------------------------------------------ */
/* Add finance entry modal                                            */
/* ------------------------------------------------------------------ */
type EntrySeed = Omit<FinanceEntry, 'id' | 'created_at' | 'updated_at' | 'created_by'>

function AddFinanceModal({
  open,
  onClose,
  kind,
  seed,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  kind: FinanceKind
  seed: EntrySeed | null
  onSaved: () => void
}) {
  const { push } = useToast()
  const [category, setCategory] = useState<FinanceCategory | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [entryDate, setEntryDate] = useState(toISODate(new Date()))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (seed && seed.kind === kind) {
      setCategory(seed.category)
      setTitle(seed.title)
      setDescription(seed.description)
      setAmount(String(seed.amount || ''))
      setEntryDate(seed.entry_date || toISODate(new Date()))
    } else {
      setCategory('')
      setTitle('')
      setDescription('')
      setAmount('')
      setEntryDate(toISODate(new Date()))
    }
  }, [open, seed, kind])

  const cats = kind === 'revenue' ? FINANCE_REVENUE_CATEGORIES : FINANCE_COST_CATEGORIES
  const canSave = category !== '' && Number(amount) > 0 && !saving

  async function submit() {
    if (!category || !amount) return
    setSaving(true)
    try {
      await db.createFinanceEntry({
        kind,
        category: category as FinanceCategory,
        title: title.trim(),
        description: description.trim(),
        amount: Number(amount),
        entry_date: entryDate,
        deal_id: seed?.deal_id || null,
      })
      push({ tone: 'success', title: `${kind === 'revenue' ? 'Revenue' : 'Cost'} added` })
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  const isRev = kind === 'revenue'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRev ? 'Add revenue' : 'Add cost'}
      desc={isRev ? 'Log income — e.g. a product sale, a service, or commission from a closed deal.' : 'Log an expense — e.g. materials, utility bills, office supplies, salaries.'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={isRev ? <TrendingUp size={14} strokeWidth={1.75} /> : <TrendingDown size={14} strokeWidth={1.75} />} disabled={!canSave} onClick={submit}>
            {saving ? 'Saving…' : isRev ? 'Add revenue' : 'Add cost'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {seed?.deal_id && (
          <div className="rounded-xl bg-ink-50 px-3 py-2 text-2xs text-ink-500 flex items-center gap-2">
            <Briefcase size={13} strokeWidth={1.75} />
            Linked to a closed deal.
          </div>
        )}
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as FinanceCategory)}>
            <option value="">Select category…</option>
            {cats.map((c) => <option key={c} value={c}>{FINANCE_CATEGORY_META[c].label}</option>)}
          </Select>
        </Field>
        <Field label="Title" hint="What is this entry for?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Marketing website sale · Electricity bill" />
        </Field>
        <Field label="Description" hint="Optional notes">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Invoice number, recipient, etc." />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (€)" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Edit finance entry modal — pre-fills all fields from the entry.
   Lets the admin fix a mistake (wrong amount, wrong category, wrong
   title, wrong date) without deleting and re-creating.                */
/* ------------------------------------------------------------------ */
function EditFinanceModal({
  open, entry, onClose, onSaved,
}: {
  open: boolean
  entry: FinanceEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const { push } = useToast()
  const [kind, setKind] = useState<FinanceKind>('revenue')
  const [category, setCategory] = useState<FinanceCategory | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [entryDate, setEntryDate] = useState(toISODate(new Date()))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (entry) {
      setKind(entry.kind)
      setCategory(entry.category)
      setTitle(entry.title)
      setDescription(entry.description)
      setAmount(String(entry.amount))
      setEntryDate(entry.entry_date)
    }
  }, [open, entry])

  const cats = kind === 'revenue' ? FINANCE_REVENUE_CATEGORIES : FINANCE_COST_CATEGORIES
  const canSave = !!entry && category !== '' && Number(amount) > 0 && !saving

  async function submit() {
    if (!entry || !category || !amount) return
    setSaving(true)
    try {
      await db.updateFinanceEntry(entry.id, {
        kind,
        category: category as FinanceCategory,
        title: title.trim(),
        description: description.trim(),
        amount: Number(amount),
        entry_date: entryDate,
      })
      push({ tone: 'success', title: 'Entry updated' })
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  if (!entry) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${kind === 'revenue' ? 'revenue' : 'cost'} entry`}
      desc="Update the category, title, description, amount or date. Useful for fixing mistakes."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Pencil size={14} strokeWidth={1.75} />} disabled={!canSave} onClick={submit}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as FinanceKind)}>
            <option value="revenue">Revenue</option>
            <option value="cost">Cost</option>
          </Select>
        </Field>
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as FinanceCategory)}>
            <option value="">Select category…</option>
            {cats.map((c) => <option key={c} value={c}>{FINANCE_CATEGORY_META[c].label}</option>)}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" hint="Optional notes">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (€)" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Print balance sheet modal                                          */
/* ------------------------------------------------------------------ */
function PrintBalanceSheetModal({
  open, onClose, entries, periodLabel, fromDate, toDate, dealMap,
}: {
  open: boolean
  onClose: () => void
  entries: FinanceEntry[]
  periodLabel: string
  fromDate: string
  toDate: string
  dealMap: Record<string, Deal>
}) {
  const rev = entries.filter((e) => e.kind === 'revenue')
  const cost = entries.filter((e) => e.kind === 'cost')
  const revByCat = groupByCategory(rev)
  const costByCat = groupByCategory(cost)
  const totalRev = rev.reduce((s, e) => s + Number(e.amount), 0)
  const totalCost = cost.reduce((s, e) => s + Number(e.amount), 0)
  const net = totalRev - totalCost

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Balance sheet preview"
      desc="This is your friendly in-platform preview. When you click Print, a formal SEC 10-K-style document with cover page, Parts I & II, Schedules A/B, and a certification page will be produced instead."
      size="lg"
      className="no-print"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={<Printer size={14} strokeWidth={1.75} />} onClick={() => window.print()}>Print formal document</Button>
        </>
      }
    >
      {/* This preview is hidden from print — only the formal document prints */}
      <div className="no-print print-area">
        <div className="print-card rounded-xl border border-line p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-base font-semibold">Calista Concept</p>
              <p className="text-sm text-ink-500">Referrals & Revenue — Balance Sheet</p>
            </div>
            <div className="text-right text-2xs text-ink-500">
              <p>{periodLabel}</p>
              <p>{dateLong(fromDate)} – {dateLong(toDate)}</p>
              <p className="mt-1">Generated: {dateLong(new Date().toISOString())}</p>
            </div>
          </div>

          {/* Revenue section */}
          <div className="mt-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">Revenue</p>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-2xs font-medium uppercase tracking-wide text-ink-400">
                  <th className="py-1.5 text-left">Date</th>
                  <th className="py-1.5 text-left">Title</th>
                  <th className="py-1.5 text-left">Category</th>
                  <th className="py-1.5 text-left">Description</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rev.length === 0 ? (
                  <tr><td colSpan={5} className="py-3 text-center text-2xs text-ink-400">No revenue entries</td></tr>
                ) : (
                  rev.map((e) => (
                    <tr key={e.id} className="border-b border-line text-2xs">
                      <td className="py-2">{dateShort(e.entry_date)}</td>
                      <td className="py-2 font-medium">{e.title || FINANCE_CATEGORY_META[e.category].label}</td>
                      <td className="py-2">{FINANCE_CATEGORY_META[e.category].label}</td>
                      <td className="py-2 text-ink-400">{e.description || '—'}</td>
                      <td className="py-2 text-right num">{eurFull(e.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-300 font-semibold">
                  <td colSpan={4} className="py-2 text-right text-2xs">Revenue total</td>
                  <td className="py-2 text-right num text-pos">{eurFull(totalRev)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Revenue by category */}
            {revByCat.length > 0 && (
              <div className="mt-3 text-2xs text-ink-500">
                <p className="font-medium">By category:</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {revByCat.map(([cat, sum]) => (
                    <span key={cat}>{FINANCE_CATEGORY_META[cat as FinanceCategory].label}: <span className="num">{eurFull(sum)}</span></span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cost section */}
          <div className="mt-6 print-page">
            <p className="text-sm font-semibold uppercase tracking-wide text-neg">Costs</p>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-2xs font-medium uppercase tracking-wide text-ink-400">
                  <th className="py-1.5 text-left">Date</th>
                  <th className="py-1.5 text-left">Title</th>
                  <th className="py-1.5 text-left">Category</th>
                  <th className="py-1.5 text-left">Description</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cost.length === 0 ? (
                  <tr><td colSpan={5} className="py-3 text-center text-2xs text-ink-400">No cost entries</td></tr>
                ) : (
                  cost.map((e) => (
                    <tr key={e.id} className="border-b border-line text-2xs">
                      <td className="py-2">{dateShort(e.entry_date)}</td>
                      <td className="py-2 font-medium">{e.title || FINANCE_CATEGORY_META[e.category].label}</td>
                      <td className="py-2">{FINANCE_CATEGORY_META[e.category].label}</td>
                      <td className="py-2 text-ink-400">{e.description || '—'}</td>
                      <td className="py-2 text-right num">{eurFull(e.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-300 font-semibold">
                  <td colSpan={4} className="py-2 text-right text-2xs">Costs total</td>
                  <td className="py-2 text-right num text-neg">{eurFull(totalCost)}</td>
                </tr>
              </tfoot>
            </table>

            {costByCat.length > 0 && (
              <div className="mt-3 text-2xs text-ink-500">
                <p className="font-medium">By category:</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {costByCat.map(([cat, sum]) => (
                    <span key={cat}>{FINANCE_CATEGORY_META[cat as FinanceCategory].label}: <span className="num">{eurFull(sum)}</span></span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Net summary */}
          <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Net result ({periodLabel})</span>
              <span className={`num text-base font-bold ${net >= 0 ? 'text-pos' : 'text-neg'}`}>
                {net >= 0 ? '+' : '−'}{eurFull(Math.abs(net))}
              </span>
            </div>
          </div>

          {/* Footer note */}
          <p className="mt-4 text-2xs text-ink-400">
            This balance sheet summarises all revenue and cost entries recorded in the CCCRM Finances ledger for the period {dateShort(fromDate)} – {dateShort(toDate)}.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function groupByCategory(entries: FinanceEntry[]): [string, number][] {
  const m: Record<string, number> = {}
  entries.forEach((e) => { m[e.category] = (m[e.category] || 0) + Number(e.amount) })
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}