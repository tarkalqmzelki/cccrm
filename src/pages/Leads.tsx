import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, Globe, Users, Pencil, Trash2, Eye, Lock, Filter, X } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { FilterDropdown } from '../components/ui/FilterDropdown'
import { Table, useSort, type Column } from '../components/ui/Table'
import { PageContainer } from '../components/layout/AppShell'
import { CreateOppModal } from '../components/CreateOppModal'
import { LeadStatusPicker } from '../components/LeadStatusPicker'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../context/ToastContext'
import type { Company, Opportunity, Profile } from '../lib/types'
import type { LeadStatus } from '../lib/types'
import { LEAD_STATUS_META, LEAD_STATUSES } from '../lib/types'
import { dateShort } from '../lib/format'

interface CompanyRow {
  company: Company
  opps: Opportunity[]
  owners: Profile[]
}

/** Time-filter presets.  'all' = no time filter; otherwise days back. */
type TimeFilter = 'all' | '7d' | '30d' | '90d'
const TIME_FILTERS: { value: TimeFilter; label: string; days?: number }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d',  label: 'Last 7 days',  days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
]

export default function Leads() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)

  // New filters
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | string>('all')

  const { data, loading, reload } = useAsync(async () => {
    const [companies, opps, profiles] = await Promise.all([
      db.listCompanies(), db.listOpportunities(), db.listProfiles(),
    ])
    return { companies, opps, profiles: profiles as Profile[] }
  }, [])

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  const rows: CompanyRow[] = useMemo(() => {
    if (!data) return []
    // Deduplicate companies by ID (prevents React key crash)
    const seen = new Set<string>()
    const unique = data.companies.filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })

    // Pre-compute cutoff timestamp for the time filter
    const cutoffMs = timeFilter === 'all' ? 0 : Date.now() - ((TIME_FILTERS.find((t) => t.value === timeFilter)?.days ?? 0) * 24 * 60 * 60 * 1000)

    return unique.map((company) => {
      const opps = data.opps.filter((o) => o.company_id === company.id)
      const owners = opps.map((o) => profileMap[o.owner_id]).filter(Boolean) as Profile[]
      return { company, opps, owners }
    }).filter((r) => {
      // Text search
      if (query.trim()) {
        const q = query.toLowerCase()
        if (!r.company.name.toLowerCase().includes(q)
          && !r.company.domain.toLowerCase().includes(q)
          && !r.company.website.toLowerCase().includes(q)) return false
      }
      // Scope: My leads vs All
      if (scope === 'mine' && r.company.created_by !== user?.id) return false
      // Time filter — created within last N days
      if (cutoffMs > 0) {
        const createdAt = new Date(r.company.created_at).getTime()
        if (createdAt < cutoffMs) return false
      }
      // Status filter — lead_status column
      if (statusFilter !== 'all' && r.company.lead_status !== statusFilter) return false
      // Owner filter
      if (ownerFilter !== 'all' && r.company.created_by !== ownerFilter) return false
      return true
    })
  }, [data, query, scope, timeFilter, statusFilter, ownerFilter, user?.id, profileMap])

  const { sort, toggle } = useSort('name', 'asc')
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = (r: CompanyRow): string | number => {
      if (sort.key === 'opps') return r.opps.length
      if (sort.key === 'revenue') return r.opps.reduce((s, o) => s + (o.offer_value || o.est_revenue || 0), 0)
      if (sort.key === 'created') return new Date(r.company.created_at).getTime()
      return r.company.name.toLowerCase()
    }
    return [...rows].sort((a, b) => { const av = get(a), bv = get(b); return av < bv ? -dir : av > bv ? dir : 0 })
  }, [rows, sort])

  async function deleteCompany(id: string) {
    try {
      await db.deleteCompany(id)
      push({ tone: 'success', title: 'Lead deleted' })
      setDeleteTarget(null)
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  async function changeLeadStatus(companyId: string, status: LeadStatus) {
    try {
      await db.updateLeadStatus(companyId, status)
      push({ tone: 'success', title: 'Lead status updated', desc: LEAD_STATUS_META[status].label })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  function ctxItems(r: CompanyRow): CtxItem[] {
    const isCreator = user?.id === r.company.created_by
    const isAdmin = user?.role === 'admin'
    const canManage = isCreator || isAdmin
    const items: CtxItem[] = [
      { label: 'Open lead', icon: <Eye size={15} strokeWidth={1.75} />, onClick: () => navigate(`/leads/${r.company.id}`) },
    ]
    if (canManage) {
      items.push(
        { label: 'Edit lead', icon: <Pencil size={15} strokeWidth={1.75} />, onClick: () => navigate(`/leads/${r.company.id}`) },
        { divider: true },
        { label: 'Delete lead', danger: true, icon: <Trash2 size={15} strokeWidth={1.75} />, onClick: () => setDeleteTarget(r.company) },
      )
    } else {
      items.push(
        { divider: true },
        { label: 'Request access', icon: <Lock size={15} strokeWidth={1.75} />, onClick: () => navigate(`/leads/${r.company.id}`) },
      )
    }
    return items
  }

  // Owner dropdown options — anyone who created a lead (or admins)
  const ownerOptions = useMemo(() => {
    if (!data) return []
    const creatorIds = Array.from(new Set(data.companies.map((c) => c.created_by).filter(Boolean) as string[]))
    return creatorIds.map((id) => ({ value: id, label: profileMap[id]?.full_name ?? 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label))
  }, [data, profileMap])

  const columns: Column<CompanyRow>[] = [
    { key: 'name', header: 'Company', sortable: true, cell: (r) => (
      <div className="flex items-center gap-2.5">
        {r.company.logo_url ? (
          <img src={r.company.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50 text-ink">
            <Building2 size={18} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.company.name}</p>
          {r.company.website && <p className="flex items-center gap-1 truncate text-2xs text-ink-400"><Globe size={11} strokeWidth={1.75} />{r.company.website}</p>}
        </div>
      </div>
    ) },
    { key: 'opps', header: 'Offers', align: 'center', sortable: true, cell: (r) => <span className="num text-sm">{r.opps.length}</span> },
    { key: 'owner', header: 'Lead Owner', cell: (r) => {
      const creator = r.company.created_by ? profileMap[r.company.created_by] : null
      if (!creator) return <span className="text-2xs text-ink-400">—</span>
      return (
        <div className="flex items-center gap-2">
          <Avatar name={creator.full_name} color={creator.avatar_color} url={creator.avatar_url} size={26} />
          <div className="leading-tight">
            <p className="text-sm truncate max-w-[120px]">{creator.full_name}</p>
            <p className="text-2xs text-ink-400 capitalize">{creator.role}</p>
          </div>
        </div>
      )
    } },
    { key: 'revenue', header: 'Offer Value', align: 'right', sortable: true, cell: (r) => (
      <span className="num text-sm text-ink-600">
        €{r.opps.reduce((s, o) => s + (o.offer_value || o.est_revenue || 0), 0).toLocaleString('en')}
      </span>
    ) },
    { key: 'status', header: 'Lead Status', cell: (r) => {
      // Placeholder only on the table — open the lead to change its
      // status.  (See CompanyDetail.tsx for the inline changer.)
      const current = (r.company.lead_status ?? 'new') as LeadStatus
      return <LeadStatusPicker status={current} canEdit={false} onChange={() => {}} />
    } },
    { key: 'created', header: 'Created', align: 'right', sortable: true, cell: (r) => (
      <span className="text-2xs text-ink-400 num">{dateShort(r.company.created_at)}</span>
    ) },
  ]

  const hasActiveFilters = scope !== 'all' || timeFilter !== 'all' || statusFilter !== 'all' || ownerFilter !== 'all'

  function clearFilters() {
    setScope('all')
    setTimeFilter('all')
    setStatusFilter('all')
    setOwnerFilter('all')
  }

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-ink-400">Companies and their offers.</p>
        </div>
        <Button icon={<Plus size={16} strokeWidth={1.75} />} onClick={() => setCreateOpen(true)}>New Lead</Button>
      </div>

      <Card>
        {/* Filter row: search + scope toggle + dropdowns */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-full sm:w-64 sm:max-w-xs">
            <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies…" className="pl-9 h-10" />
          </div>

          {/* My vs All toggle */}
          <div className="flex rounded-xl border border-line bg-surface p-0.5">
            <button
              onClick={() => setScope('all')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === 'all' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setScope('mine')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                scope === 'mine' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'
              }`}
            >
              My leads
            </button>
          </div>

          {/* Time filter */}
          <FilterDropdown
            value={timeFilter}
            onChange={(v) => setTimeFilter(v as TimeFilter)}
            options={TIME_FILTERS.map((t) => ({ value: t.value, label: t.label }))}
            className="w-36"
          />

          {/* Status filter */}
          <FilterDropdown
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as 'all' | LeadStatus)}
            options={[
              { value: 'all', label: 'All statuses' },
              ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label })),
            ]}
            className="w-36"
          />

          {/* Owner filter */}
          <FilterDropdown
            value={ownerFilter}
            onChange={(v) => setOwnerFilter(v)}
            options={[
              { value: 'all', label: 'All owners' },
              ...ownerOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
            className="w-40"
          />

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-2xs font-medium text-ink-500 hover:bg-ink-50">
              <X size={13} strokeWidth={1.75} /> Clear
            </button>
          )}
        </div>

        <Table
          columns={columns}
          rows={sorted}
          rowKey={(r) => r.company.id}
          sort={sort}
          onSortChange={toggle}
          loading={loading}
          onRowClick={(r) => navigate(`/leads/${r.company.id}`)}
          onRowContext={(e, r) => openContextMenu(e, ctxItems(r))}
          empty={<div className="flex flex-col items-center gap-3 py-12"><Building2 size={20} strokeWidth={1.75} className="text-ink-300" /><p className="text-sm text-ink-400">No leads match your filters — try clearing them or create a new lead</p></div>}
        />
      </Card>

      <CreateOppModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload() }} />

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete lead?"
        desc="This will permanently delete the company, its offers, contacts, and all related data."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && deleteCompany(deleteTarget.id)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</p>
      </Modal>
    </PageContainer>
  )
}
