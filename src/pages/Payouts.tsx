import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Wallet, Download, Info, Network, Clock, Scale, BadgeEuro } from 'lucide-react'
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
import { useCountUp } from '../components/leaderboard/useCountUp'
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
  const canWithdrawNow = Math.max(totalCollectable - totalPaid, 0)

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

  /* Sparkline series — cumulative money curves, one per stat card */
  const series = useMemo(() => {
    const chrono = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const paid: number[] = []
    const collect: number[] = []
    const expected: number[] = []
    let sp = 0, sc = 0, se = 0
    for (const p of chrono) {
      sp += p.paid_amount || 0
      se += p.amount
      const d = p.deal_id ? dealMap[p.deal_id] : null
      if (d && d.gross_value > 0) {
        sc += Math.min(Math.round(p.amount * ((d.collected_amount || 0) / d.gross_value)), p.amount)
      }
      paid.push(sp); collect.push(sc); expected.push(se)
    }
    return { paid, collect, expected }
  }, [rows, dealMap])

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
      return <StatusPill tone={tone as 'pos' | 'warn' | 'info' | 'neutral'} label={label} />
    } },
    { key: 'created_at', header: 'Date', align: 'right', sortable: true, cell: (p) => <span className="text-ink-400 text-2xs num">{dateShort(p.created_at)}</span> },
    ...((isAdmin ? [{
      key: 'actions', header: '', align: 'right' as const, cell: (p: Payout) => {
        const collectable = getCollectable(p)
        const paid = p.paid_amount || 0
        const canPay = collectable > paid
        return canPay ? (
          <Button size="sm" variant="secondary" icon={<Check size={14} strokeWidth={1.75} />} onClick={(e) => { e.stopPropagation(); recordPayment(p.id, collectable - paid) }}>
            Pay {eurFull(collectable - paid)}
          </Button>
        ) : <span className="text-2xs text-ink-300 num">{p.paid_at ? dateShort(p.paid_at) : ''}</span>
      },
    }] : []) as Column<Payout>[]),
  ]

  return (
    <PageContainer>
      {/* ── Hero banner — dark gradient with floating coin medallions ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 p-5 text-white shadow-glass sm:p-6 dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]"
      >
        {/* ambient glows */}
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-warn/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-1/4 h-40 w-40 rounded-full bg-info/20 blur-3xl" />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ x: '-160%', skewX: '-14deg' }}
          animate={{ x: ['-160%', '420%'] }}
          transition={{ duration: 1.6, delay: 0.9, repeatDelay: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Hanging coin medallions */}
        <div aria-hidden className="pointer-events-none absolute right-4 top-0 hidden h-full sm:block">
          <Medallion x={0} size={44} color="#f59e0b" glyph="€" delay={0} />
          <Medallion x={70} size={34} color="#a78bfa" glyph="%" delay={0.6} />
          <Medallion x={132} size={48} color="#34d399" glyph="€" delay={1.1} />
          <Medallion x={196} size={30} color="#38bdf8" glyph="✦" delay={1.6} />
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {isAdmin ? 'Payout control tower' : 'Request your payouts'}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-white/60 sm:text-sm">
            {isAdmin
              ? 'Every commission across the platform — approve collections and release money in one tap.'
              : 'Commissions you earned from sales and referrals. Collectable money is released once the deal is collected.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold num">
              {rows.length} payout{rows.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-2xs font-semibold text-amber-200 num">
              {eur(canWithdrawNow)} ready
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Stat cards with sparklines — one warm gamma ── */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Paid out"
          value={totalPaid}
          color="#f59e0b"
          icon={<BadgeEuro size={16} strokeWidth={2} />}
          series={series.paid}
          loading={loading}
          delay={0.15}
        />
        <StatCard
          label="Can withdraw now"
          value={canWithdrawNow}
          color="#fbbf24"
          icon={<Clock size={16} strokeWidth={2} />}
          series={series.collect}
          loading={loading}
          delay={0.25}
        />
        <StatCard
          label="Total expected"
          value={totalExpected}
          color="#fb923c"
          icon={<Scale size={16} strokeWidth={2} />}
          series={series.expected}
          loading={loading}
          delay={0.35}
        />
      </div>

      {/* ── History table ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/30">
                  <Wallet size={15} strokeWidth={2} />
                </span>
                Payout history
              </span>
            }
            desc={isAdmin ? 'All members · sales & referral commissions' : 'Your sales & referral commissions'}
            action={<Button variant="secondary" size="sm" icon={<Download size={14} strokeWidth={1.75} />}>Export</Button>}
          />
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
      </motion.div>

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
/* Hero medallion — coin on a string, swaying                          */
/* ------------------------------------------------------------------ */
function Medallion({ x, size, color, glyph, delay }: { x: number; size: number; color: string; glyph: string; delay: number }) {
  return (
    <motion.div
      className="absolute top-0 origin-top"
      style={{ left: x }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, rotate: [-3.5, 3.5, -3.5] }}
      transition={{
        opacity: { duration: 0.5, delay: 0.3 + delay },
        rotate: { duration: 3.4 + delay, repeat: Infinity, ease: 'easeInOut', delay },
      }}
    >
      {/* string */}
      <span className="mx-auto block w-px bg-gradient-to-b from-white/40 to-white/10" style={{ height: 26 + delay * 18 }} />
      {/* coin */}
      <span
        className="mt-1 grid place-items-center rounded-full border-2 font-black shadow-lg"
        style={{
          width: size,
          height: size,
          borderColor: color,
          color,
          background: `radial-gradient(circle at 32% 28%, ${color}30, transparent 65%), rgba(255,255,255,0.06)`,
          fontSize: size * 0.42,
          boxShadow: `0 0 18px ${color}45, inset 0 0 8px ${color}25`,
        }}
      >
        {glyph}
      </span>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Stat card — colored icon chip, count-up value, animated sparkline   */
/* ------------------------------------------------------------------ */
function StatCard({
  label, value, color, icon, series, loading, delay,
}: {
  label: string
  value: number
  color: string
  icon: React.ReactNode
  series: number[]
  loading?: boolean
  delay?: number
}) {
  const animated = useCountUp(value, 1.2, delay)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4"
    >
      {/* tone wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(150deg, ${color}1f 0%, transparent 52%)` }}
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-md"
            style={{ background: `linear-gradient(160deg, ${color}, ${color}bb)`, boxShadow: `0 6px 14px -4px ${color}70` }}
          >
            {icon}
          </span>
          <p className="text-xs font-semibold text-ink-500 dark:text-ink-300">{label}</p>
        </div>

        {loading ? (
          <div className="skeleton mt-3 h-8 w-36 rounded-lg" />
        ) : (
          <p className="num mt-3 text-[28px] font-extrabold leading-none tracking-tight" style={{ color }}>
            {eur(Math.round(animated))}
          </p>
        )}

        {!loading && series.length > 1 && (
          <Spark data={series} color={color} delay={(delay ?? 0) + 0.4} />
        )}
        {!loading && series.length <= 1 && (
          <div className="mt-3 h-9" />
        )}
      </div>
    </motion.div>
  )
}

/* Smooth mini area-chart with draw-in animation */
function Spark({ data, color, delay }: { data: number[]; color: string; delay: number }) {
  const w = 220
  const h = 40
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 6) + 3
    const y = h - 4 - ((v - min) / span) * (h - 10)
    return [x, y] as const
  })
  // smooth path via quadratic midpoints
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const mx = (x0 + x1) / 2
    d += ` Q ${x0},${y0} ${mx},${(y0 + y1) / 2} T ${x1},${y1}`
  }
  const areaD = `${d} L ${pts[pts.length - 1][0]},${h} L ${pts[0][0]},${h} Z`
  const last = pts[pts.length - 1]
  const gid = `spark-${color.replace('#', '')}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-10 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={areaD}
        fill={`url(#${gid})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: delay + 0.5 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r="3"
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.4, 1] }}
        transition={{ duration: 0.5, delay: delay + 1.3 }}
        style={{ transformOrigin: `${last[0]}px ${last[1]}px` }}
      />
    </svg>
  )
}

/* Reference-style filled status pill */
function StatusPill({ tone, label }: { tone: 'pos' | 'warn' | 'info' | 'neutral'; label: string }) {
  const cls = {
    pos: 'bg-posBg text-pos border-pos/25',
    warn: 'bg-warnBg text-warn border-warn/25',
    info: 'bg-infoBg text-info border-info/25',
    neutral: 'bg-ink-100 text-ink-500 border-line dark:bg-ink-200 dark:text-ink-400',
  }[tone]
  const dot = { pos: '#22c55e', warn: '#f59e0b', info: '#3b82f6', neutral: '#a3a3a3' }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
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
