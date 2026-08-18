import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Wallet, Download, Info, Network } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Table, useSort, type Column } from '../components/ui/Table'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import { Modal } from '../components/ui/Modal'
import type { Payout, Profile, Deal, Referral } from '../lib/types'
import { eur, eurFull, dateShort } from '../lib/format'

export default function Payouts() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { push } = useToast()
  const navigate = useNavigate()
  const [refInfo, setRefInfo] = useState<{ deal: Deal; referrer: Profile | null; referee: Profile | null } | null>(null)
  const { data, loading, reload } = useAsync(async () => {
    const [payouts, profiles, deals, referrals] = await Promise.all([
      db.listPayouts(), db.listProfiles(), db.listDeals(), db.listReferrals(),
    ])
    return {
      payouts, profiles: profiles as Profile[],
      deals: deals as Deal[], referrals: referrals as Referral[],
    }
  }, [user?.id])

  const map = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])
  const dealMap = useMemo(() => {
    const m: Record<string, Deal> = {}
    data?.deals.forEach((d) => (m[d.id] = d))
    return m
  }, [data])
  const referralMap = useMemo(() => {
    const m: Record<string, Referral> = {}
    data?.referrals.forEach((r) => (m[r.referee_id] = r))
    return m
  }, [data])

  const rows = useMemo(() => {
    if (!data) return [] as Payout[]
    return isAdmin ? data.payouts : data.payouts.filter((p) => p.seller_id === user?.id)
  }, [data, isAdmin, user?.id])

  const totalPaid = rows.reduce((s, p) => s + (p.paid_amount || 0), 0)
  const totalCollectable = rows.reduce((s, p) => {
    const d = p.deal_id ? dealMap[p.deal_id] : null
    if (!d || d.gross_value <= 0) return s
    const ratio = (d.collected_amount || 0) / d.gross_value
    return s + Math.min(Math.round(p.amount * ratio), p.amount)
  }, 0)
  const totalExpected = rows.reduce((s, p) => s + p.amount, 0)

  const { sort, toggle } = useSort('created_at', 'desc')
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = (r: Payout): string | number => {
      if (sort.key === 'amount') return r.amount
      if (sort.key === 'status') return r.status
      if (sort.key === 'type') return r.payout_type || 'sale'
      if (sort.key === 'seller') return (map[r.seller_id]?.full_name || '').toLowerCase()
      return new Date(r.created_at).getTime()
    }
    return [...rows].sort((a, b) => { const av = get(a), bv = get(b); return av < bv ? -dir : av > bv ? dir : 0 })
  }, [rows, sort, map])

  async function recordPayment(id: string, amount: number) {
    try {
      await db.recordPayoutPayment(id, amount)
      push({ tone: 'success', title: 'Payment recorded', desc: `${eurFull(amount)} paid` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not record payment', desc: e?.message })
    }
  }

  function showRefInfo(p: Payout) {
    const deal = p.deal_id ? dealMap[p.deal_id] : null
    if (!deal) return
    const referral = referralMap[deal.seller_id]
    const referrer = referral ? map[referral.referrer_id] : null
    const referee = map[deal.seller_id] || null
    setRefInfo({ deal, referrer, referee })
  }

  function getCollectable(p: Payout): number {
    const d = p.deal_id ? dealMap[p.deal_id] : null
    if (!d || d.gross_value <= 0) return 0
    // collectable = payout total * (collected / gross)
    // This uses the payout's actual amount (which is always correct per current level)
    const ratio = (d.collected_amount || 0) / d.gross_value
    return Math.min(Math.round(p.amount * ratio), p.amount)
  }

  const columns: Column<Payout>[] = [
    { key: 'deal', header: 'Deal', cell: (p) => {
      const d = p.deal_id ? dealMap[p.deal_id] : null
      const isReferral = p.payout_type === 'referral'
      return (
        <div className="flex items-center gap-2">
          {isReferral && <Network size={14} strokeWidth={1.75} className="shrink-0 text-ink-400" />}
          <span className="font-medium text-ink">{d?.company || '—'}</span>
          {isReferral && (
            <button
              onClick={(e) => { e.stopPropagation(); showRefInfo(p) }}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-ink-400 hover:bg-ink-50 hover:text-ink transition-colors"
              title="Referral info"
            >
              <Info size={11} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )
    } },
    { key: 'type', header: 'Type', sortable: true, cell: (p) => (
      <Badge tone={p.payout_type === 'referral' ? 'info' : 'neutral'}>
        {p.payout_type === 'referral' ? 'Referral' : 'Sale'}
      </Badge>
    ) },
    ...((isAdmin ? [{
      key: 'seller', header: 'Recipient', sortable: true, cell: (p: Payout) => {
        const s = map[p.seller_id]
        return s ? (
          <div className="flex items-center gap-2">
            <Avatar name={s.full_name} color={s.avatar_color} url={s.avatar_url} size={26} />
            <span className="text-sm">{s.full_name}</span>
          </div>
        ) : '—'
      },
    }] : []) as Column<Payout>[]),
    { key: 'amount', header: 'Payout', align: 'right', sortable: true, cell: (p) => {
      const collectable = getCollectable(p)
      const paid = p.paid_amount || 0
      return (
        <div className="text-right">
          <p className="num font-medium">{eurFull(paid)} / {eurFull(p.amount)}</p>
          <p className="text-2xs text-ink-400">{eurFull(collectable)} collectable</p>
        </div>
      )
    } },
    { key: 'status', header: 'Status', sortable: true, cell: (p) => {
      const collectable = getCollectable(p)
      const paid = p.paid_amount || 0
      const tone = paid >= p.amount ? 'pos' : paid > 0 ? 'warn' : collectable > 0 ? 'info' : 'neutral'
      const label = paid >= p.amount ? 'paid' : paid > 0 ? 'partial' : collectable > 0 ? 'collectable' : p.status
      return <Badge tone={tone as 'pos' | 'warn' | 'info' | 'neutral'} dot>{label}</Badge>
    } },
    { key: 'created_at', header: 'Date', align: 'right', sortable: true, cell: (p) => <span className="text-ink-400 text-2xs">{dateShort(p.created_at)}</span> },
    ...((isAdmin ? [{
      key: 'actions', header: '', align: 'right' as const, cell: (p: Payout) => {
        const collectable = getCollectable(p)
        const paid = p.paid_amount || 0
        const canPay = collectable > paid
        return canPay ? (
          <Button size="sm" variant="secondary" icon={<Check size={14} strokeWidth={1.75} />} onClick={(e) => { e.stopPropagation(); recordPayment(p.id, collectable - paid) }}>
            Pay {eurFull(collectable - paid)}
          </Button>
        ) : <span className="text-2xs text-ink-300">{p.paid_at ? dateShort(p.paid_at) : ''}</span>
      },
    }] : []) as Column<Payout>[]),
  ]

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
          <p className="mt-1 text-sm text-ink-400">{isAdmin ? 'All payouts across the platform — sales and referral commissions.' : 'Your earned commissions, including referral bonuses.'}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-ink-400">Paid</p>
          <p className="mt-2 num text-2xl font-semibold tracking-tight">{eur(totalPaid)}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-400">Collectable now</p>
          <p className="mt-2 num text-2xl font-semibold tracking-tight text-warn">{eur(Math.max(totalCollectable - totalPaid, 0))}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-400">Total expected</p>
          <p className="mt-2 num text-2xl font-semibold tracking-tight text-ink-400">{eur(totalExpected)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Payout history" action={<Button variant="secondary" size="sm" icon={<Download size={14} strokeWidth={1.75} />}>Export</Button>} />
        {/* Desktop: table */}
        <div className="hidden lg:block">
          <Table
            columns={columns}
            rows={sorted}
            rowKey={(p) => p.id}
            sort={sort}
            onSortChange={toggle}
            loading={loading}
            onRowClick={(p) => p.deal_id && navigate(`/deals/${p.deal_id}`)}
            empty={<div className="flex flex-col items-center gap-3 py-12"><Wallet size={20} strokeWidth={1.75} className="text-ink-300" /><p className="text-sm text-ink-400">No payouts yet</p></div>}
          />
        </div>

        {/* Mobile: card list — no horizontal scroll */}
        <div className="lg:hidden">
          <MobilePayoutList
            rows={sorted}
            loading={loading}
            map={map}
            dealMap={dealMap}
            isAdmin={isAdmin}
            getCollectable={getCollectable}
            onOpen={(p) => p.deal_id && navigate(`/deals/${p.deal_id}`)}
            onPay={recordPayment}
          />
        </div>
      </Card>

      {/* Referral info modal */}
      <Modal
        open={!!refInfo}
        onClose={() => setRefInfo(null)}
        title="Referral payout"
        desc="This payout is a referral commission."
        size="sm"
      >
        {refInfo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-line p-3">
              <Network size={18} strokeWidth={1.75} className="text-ink-400" />
              <div>
                <p className="text-sm font-medium">{refInfo.deal.company}</p>
                <p className="text-2xs text-ink-400">{eurFull(refInfo.deal.gross_value)} gross · Deal by {refInfo.referee?.full_name || '—'}</p>
              </div>
            </div>
            {refInfo.referrer && refInfo.referee && (
              <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
                <Avatar name={refInfo.referrer.full_name} color={refInfo.referrer.avatar_color} url={refInfo.referrer.avatar_url} size={32} />
                <span className="text-sm font-medium">{refInfo.referrer.full_name}</span>
                <span className="text-2xs text-ink-400">earned referral commission from</span>
                <Avatar name={refInfo.referee.full_name} color={refInfo.referee.avatar_color} url={refInfo.referee.avatar_url} size={32} />
                <span className="text-sm font-medium">{refInfo.referee.full_name}</span>
              </div>
            )}
            <Button variant="secondary" block onClick={() => refInfo && navigate(`/deals/${refInfo.deal.id}`)}>View deal</Button>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Mobile card list — phone-only.                                    */
/* ------------------------------------------------------------------ */
function MobilePayoutList({
  rows, loading, map, dealMap, isAdmin, getCollectable, onOpen, onPay,
}: {
  rows: Payout[]
  loading: boolean
  map: Record<string, Profile>
  dealMap: Record<string, Deal>
  isAdmin: boolean
  getCollectable: (p: Payout) => number
  onOpen: (p: Payout) => void
  onPay: (id: string, amount: number) => void
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Wallet size={20} strokeWidth={1.75} className="text-ink-300" />
        <p className="text-sm text-ink-400">No payouts yet</p>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {rows.map((p) => {
        const d = p.deal_id ? dealMap[p.deal_id] : null
        const isReferral = p.payout_type === 'referral'
        const collectable = getCollectable(p)
        const paid = p.paid_amount || 0
        const fullyPaid = paid >= p.amount
        const partial = paid > 0 && !fullyPaid
        const seller = map[p.seller_id]
        const tone = fullyPaid ? 'pos' : partial ? 'warn' : collectable > 0 ? 'info' : 'neutral'
        const label = fullyPaid ? 'Paid' : partial ? 'Partial' : collectable > 0 ? 'Collectable' : p.status
        return (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="card w-full text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {isReferral && <Network size={14} strokeWidth={1.75} className="shrink-0 text-ink-400" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{d?.company || '—'}</p>
                  <p className="text-2xs text-ink-400">
                    {isReferral ? 'Referral' : 'Sale'} · {dateShort(p.created_at)}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${TONE_BADGE[tone]}`}>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: TONE_DOT[tone] }} />
                {label}
              </span>
            </div>

            {isAdmin && seller && (
              <div className="mt-2 flex items-center gap-1.5">
                <Avatar name={seller.full_name} color={seller.avatar_color} url={seller.avatar_url} size={18} />
                <span className="truncate text-2xs text-ink-500">{seller.full_name}</span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <div>
                <p className="num text-sm font-semibold text-ink">{eurFull(paid)} / {eurFull(p.amount)}</p>
                <p className="text-2xs text-ink-400">{eurFull(collectable)} collectable</p>
              </div>
              {isAdmin && collectable > paid && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check size={13} strokeWidth={1.75} />}
                  onClick={(e) => { e.stopPropagation(); onPay(p.id, collectable - paid) }}
                >
                  Pay {eurFull(collectable - paid)}
                </Button>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

const TONE_DOT: Record<string, string> = {
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
