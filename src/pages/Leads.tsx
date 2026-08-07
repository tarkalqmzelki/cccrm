import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, Globe, Briefcase, Users, Pencil, Trash2, Eye, Lock } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Table, useSort, type Column } from '../components/ui/Table'
import { PageContainer } from '../components/layout/AppShell'
import { CreateOppModal } from '../components/CreateOppModal'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../context/ToastContext'
import type { Company, Opportunity, Profile } from '../lib/types'

interface CompanyRow {
  company: Company
  opps: Opportunity[]
  owners: Profile[]
}

export default function Leads() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)
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
    return unique.map((company) => {
      const opps = data.opps.filter((o) => o.company_id === company.id)
      const owners = opps.map((o) => profileMap[o.owner_id]).filter(Boolean) as Profile[]
      return { company, opps, owners }
    }).filter((r) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return r.company.name.toLowerCase().includes(q)
        || r.company.domain.toLowerCase().includes(q)
        || r.company.website.toLowerCase().includes(q)
    })
  }, [data, query, profileMap])

  const { sort, toggle } = useSort('name', 'asc')
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = (r: CompanyRow): string | number => {
      if (sort.key === 'opps') return r.opps.length
      if (sort.key === 'revenue') return r.opps.reduce((s, o) => s + (o.offer_value || o.est_revenue || 0), 0)
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
    { key: 'status', header: 'Status', cell: (r) => {
      const active = r.opps.filter((o) => !['won','lost','archived'].includes(o.status)).length
      return <Badge tone={active > 0 ? 'pos' : 'neutral'} dot>{active} active</Badge>
    } },
  ]

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
        <div className="mb-3 relative w-full sm:max-w-xs">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies…" className="pl-9 h-10" />
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
          empty={<div className="flex flex-col items-center gap-3 py-12"><Building2 size={20} strokeWidth={1.75} className="text-ink-300" /><p className="text-sm text-ink-400">No leads yet — create your first one</p></div>}
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
