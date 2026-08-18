import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Trash2, Check, X, FileText, Filter } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Table, useSort, type Column } from '../components/ui/Table'
import { PageContainer } from '../components/layout/AppShell'
import { Dropdown } from '../components/ui/Dropdown'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { useToast } from '../context/ToastContext'
import type { Deal, DealStatus, Profile } from '../lib/types'
import { STATUS_META } from '../lib/types'
import { eur, dateShort } from '../lib/format'
import { DealModal } from '../components/DealModal'

const ALL_STATUSES = Object.keys(STATUS_META) as DealStatus[]

export default function Deals() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { push } = useToast()
  const navigate = useNavigate()
  const { data, loading, reload } = useAsync(async () => {
    const [deals, profiles] = await Promise.all([db.listDeals(), db.listProfiles()])
    return { deals, profiles: profiles as Profile[] }
  }, [user?.id])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    let d = data.deals as Deal[]
    if (!isAdmin) d = d.filter((x) => x.seller_id === user?.id)
    if (statusFilter !== 'all') d = d.filter((x) => x.status === statusFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      d = d.filter((x) => x.company.toLowerCase().includes(q) || x.contact_name.toLowerCase().includes(q))
    }
    return d
  }, [data, isAdmin, user?.id, statusFilter, query])

  const { sort, toggle } = useSort('created_at', 'desc')
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = (r: Deal): string | number => {
      switch (sort.key) {
        case 'company': return r.company.toLowerCase()
        case 'value': return r.gross_value
        case 'status': return r.status
        case 'seller': return (profileMap[r.seller_id]?.full_name || '').toLowerCase()
        default: return new Date(r.created_at).getTime()
      }
    }
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b)
      return (av as any) < (bv as any) ? -dir : (av as any) > (bv as any) ? dir : 0
    })
  }, [rows, sort, profileMap])

  async function changeStatus(id: string, status: DealStatus) {
    try {
      await db.updateDeal(id, { status })
      push({ tone: 'success', title: 'Status updated', desc: `Deal marked as ${STATUS_META[status].label}` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update status', desc: e?.message || 'Unknown error' })
    }
  }
  async function removeDeal(id: string) {
    await db.deleteDeal(id)
    push({ tone: 'success', title: 'Deal deleted' })
    reload()
  }

  function ctxItems(d: Deal): CtxItem[] {
    const items: CtxItem[] = [
      { label: 'Open deal', icon: <Eye size={15} strokeWidth={1.75} />, onClick: () => navigate(`/deals/${d.id}`) },
      { divider: true },
    ]
    if (isAdmin) {
      items.push({
        label: 'Approve', icon: <Check size={15} strokeWidth={1.75} />,
        onClick: () => changeStatus(d.id, 'approved'), disabled: d.status === 'approved' || d.status === 'closed',
      }, {
        label: 'Reject', icon: <X size={15} strokeWidth={1.75} />,
        onClick: () => changeStatus(d.id, 'rejected'), disabled: d.status === 'rejected',
      }, {
        label: 'Close sale', icon: <Check size={15} strokeWidth={1.75} />,
        onClick: () => changeStatus(d.id, 'closed'), disabled: d.status === 'closed',
      }, { divider: true })
    }
    items.push({ label: 'Delete', danger: true, icon: <Trash2 size={15} strokeWidth={1.75} />, onClick: () => removeDeal(d.id) })
    return items
  }

  const columns: Column<Deal>[] = [
    { key: 'company', header: 'Deal', sortable: true, cell: (d) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{d.company || 'Untitled'}</p>
        <p className="text-2xs text-ink-400 truncate">{d.contact_name || 'No contact'}</p>
      </div>
    ) },
    ...(isAdmin ? [{
      key: 'seller', header: 'Owner', sortable: true, cell: (d: Deal) => {
        const p = profileMap[d.seller_id]
        return p ? (
          <div className="flex items-center gap-2">
            <Avatar name={p.full_name} color={p.avatar_color} size={26} />
            <div className="min-w-0">
              <p className="truncate text-sm">{p.full_name}</p>
              <p className="text-2xs text-ink-400 capitalize">{p.level}</p>
            </div>
          </div>
        ) : <span className="text-ink-400">—</span>
      },
    }] : []),
    { key: 'value', header: 'Gross', align: 'right', sortable: true, cell: (d) => <span className="num font-medium">{eur(d.gross_value)}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => {
      const m = STATUS_META[d.status]
      return <Badge tone={m.tone} dot>{m.label}</Badge>
    } },
    { key: 'created_at', header: 'Date', align: 'right', sortable: true, cell: (d) => <span className="text-ink-400 text-2xs">{dateShort(d.created_at)}</span> },
  ]

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isAdmin ? 'All Deals' : 'My Deals'}</h1>
          <p className="mt-1 text-sm text-ink-400">{isAdmin ? 'Approve, close, and manage every submitted deal.' : 'Track and manage your submitted deals.'}</p>
        </div>
        {user?.role !== 'admin' && <Button icon={<Plus size={16} strokeWidth={1.75} />} onClick={() => setCreateOpen(true)}>Submit Deal</Button>}
      </div>

      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or contact" className="pl-9 h-10" />
          </div>
          <Dropdown
            align="right"
            width={200}
            trigger={
              <div className="flex items-center gap-1.5 rounded-xl border border-line px-3 h-10 text-sm font-medium hover:bg-ink-50 transition-colors">
                <Filter size={15} strokeWidth={1.75} className="text-ink-400" />
                {statusFilter === 'all' ? 'All statuses' : STATUS_META[statusFilter].label}
              </div>
            }
            items={[
              { label: 'All statuses', onClick: () => setStatusFilter('all') },
              { divider: true },
              ...ALL_STATUSES.map((s) => ({ label: STATUS_META[s].label, onClick: () => setStatusFilter(s) })),
            ]}
          />
        </div>

        {/* Desktop: full table */}
        <div className="hidden lg:block">
          <Table
            columns={columns}
            rows={sorted}
            rowKey={(d) => d.id}
            sort={sort}
            onSortChange={toggle}
            loading={loading}
            onRowClick={(d) => navigate(`/deals/${d.id}`)}
            onRowContext={(e, d) => openContextMenu(e, ctxItems(d))}
            empty={<div className="flex flex-col items-center gap-3 py-12"><FileText size={20} strokeWidth={1.75} className="text-ink-300" /><p className="text-sm text-ink-400">No deals match your filters</p></div>}
          />
        </div>

        {/* Mobile: card list */}
        <div className="lg:hidden">
          <MobileDealList
            rows={sorted}
            loading={loading}
            profileMap={profileMap}
            isAdmin={isAdmin}
            onOpen={(d) => navigate(`/deals/${d.id}`)}
            onContext={(e, d) => openContextMenu(e, ctxItems(d))}
          />
        </div>
      </Card>

      <DealModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload() }} />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Mobile card list — phone-only, replaces the horizontally-scrolling
/* deals table with tappable cards.                                  */
/* ------------------------------------------------------------------ */
function MobileDealList({
  rows, loading, profileMap, isAdmin, onOpen, onContext,
}: {
  rows: Deal[]
  loading: boolean
  profileMap: Record<string, Profile>
  isAdmin: boolean
  onOpen: (d: Deal) => void
  onContext: (e: React.MouseEvent, d: Deal) => void
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <FileText size={20} strokeWidth={1.75} className="text-ink-300" />
        <p className="text-sm text-ink-400">No deals match your filters</p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {rows.map((d) => {
        const m = STATUS_META[d.status]
        const seller = profileMap[d.seller_id]
        return (
          <button
            key={d.id}
            onClick={() => onOpen(d)}
            onContextMenu={(e) => onContext(e, d)}
            className="card w-full text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{d.company || 'Untitled'}</p>
                <p className="truncate text-2xs text-ink-400">{d.contact_name || 'No contact'}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${TONE_BADGE[m.tone]}`}>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: TONE_DOT_COLOR[m.tone] }} />
                {m.label}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {isAdmin && seller ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <Avatar name={seller.full_name} color={seller.avatar_color} url={seller.avatar_url} size={20} />
                  <span className="truncate text-2xs text-ink-500">{seller.full_name}</span>
                </div>
              ) : (
                <span className="text-2xs text-ink-400">{dateShort(d.created_at)}</span>
              )}
              <span className="num shrink-0 text-sm font-semibold text-ink">{eur(d.gross_value)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

const TONE_DOT_COLOR: Record<string, string> = {
  neutral: '#A3A3A3',
  info: '#2563EB',
  warn: '#D97706',
  pos: '#16A34A',
  neg: '#DC2626',
}

const TONE_BADGE: Record<string, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  info: 'bg-infoBg text-info',
  warn: 'bg-warnBg text-warn',
  pos: 'bg-posBg text-pos',
  neg: 'bg-negBg text-neg',
}
