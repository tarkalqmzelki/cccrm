import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, Users, UserPlus, Send, Crown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { StatCard } from '../components/ui/Stat'
import { RevenueChart } from '../components/charts/RevenueChart'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { PageContainer } from '../components/layout/AppShell'
import { STATUS_META, DEFAULT_SETTINGS } from '../lib/types'
import type { Deal, Profile, Company, Payout, Referral, Settings } from '../lib/types'
import type { SellerStats } from '../lib/gamification'
import { leaderboard, periodStats, revenueSeries, grossVolume, effectiveLevel } from '../lib/metrics'
import { buildBoard, careerTotals, periodWindow, rankRows, tierProgress, xpOf } from '../lib/gamification'
import { eur, delta } from '../lib/format'
import { ActivityRings } from '../components/ui/ActivityRings'
import { CareerCard } from '../components/dashboard/CareerCard'
import { MomentumChart } from '../components/dashboard/MomentumChart'
import { PayoutTracker } from '../components/dashboard/PayoutTracker'
import { MedalShelf, type ShelfMedal } from '../components/dashboard/MedalShelf'
import { RecentWins } from '../components/dashboard/RecentWins'
import { Store } from 'lucide-react'

const DAY = 86400000

/** ISO-style week key, e.g. 2026-W35 */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data, loading } = useAsync(async () => {
    const [profiles, deals, companies, payouts, referrals] = await Promise.all([
      db.listProfiles(), db.listDeals(), db.listCompanies(), db.listPayouts(), db.listReferrals(),
    ])
    const settings = await db.getSettings()
    return { profiles, deals, companies, payouts, referrals, settings: settings || DEFAULT_SETTINGS } as {
      profiles: Profile[]; deals: Deal[]; companies: Company[]; payouts: Payout[]; referrals: Referral[]; settings: Settings
    }
  }, [user?.id])

  if (!user) return null

  if (!isAdmin) {
    return <SellerHome user={user} data={data} loading={loading} />
  }

  return <AdminHome data={data} loading={loading} user={user} />
}

/* ---------------- Admin homepage ---------------- */
function AdminHome({ data, loading, user }: { data: any; loading: boolean; user: Profile }) {
  const stats = useMemo(() => (data ? periodStats(data.deals, data.companies, data.profiles) : null), [data])
  const board = useMemo(() => (data ? leaderboard(data.deals, data.profiles, data.payouts, data.referrals, data.settings) : []), [data])
  const series = useMemo(() => (data ? revenueSeries(data.deals, 14) : []), [data])
  const gross = useMemo(() => (data ? grossVolume(data.deals) : 0), [data])

  /* Activity rings — platform health at a glance */
  const rings = useMemo(() => {
    if (!data) return null
    const counted = data.deals.filter((d: Deal) => d.status === 'approved' || d.status === 'closed')
    const closeOut = counted.length > 0 ? (counted.filter((d: Deal) => d.status === 'closed').length / counted.length) * 100 : 0
    const conversion = stats && stats.leads > 0 ? Math.min(100, (stats.dealsSubmitted / Math.max(stats.leads, 1)) * 100) : 0
    const activePayouts = (data.payouts as Payout[]).filter((p) => p.status !== 'cancelled')
    const paidSum = activePayouts.reduce((s, p) => s + (p.paid_amount || 0), 0)
    const owed = activePayouts.reduce((s, p) => s + p.amount, 0)
    const collection = owed > 0 ? (paidSum / owed) * 100 : 0
    return [
      { label: 'Lead → Deal', value: conversion, colors: ['#3b82f6', '#60a5fa'] as [string, string], sub: `${stats?.dealsSubmitted ?? 0}/${stats?.leads ?? 0} · 30d` },
      { label: 'Close-out', value: closeOut, colors: ['#22c55e', '#4ade80'] as [string, string], sub: `${counted.filter((d: Deal) => d.status === 'closed').length} closed` },
      { label: 'Collected', value: collection, colors: ['#f59e0b', '#fbbf24'] as [string, string], sub: `${eur(paidSum)} of ${eur(owed)}` },
    ]
  }, [data, stats])

  const membersCount = useMemo(() => (data ? data.profiles.filter((p: Profile) => p.role !== 'admin').length : 0), [data])

  return (
    <PageContainer>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.full_name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-400">Command center — the whole arena in one glance.</p>
      </div>

      {/* Command banner */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 p-5 text-white shadow-glass dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]"
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-info/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-pos/15 blur-3xl" />
        <div
          aria-hidden
          className="sheen-x pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ '--sheen-cycle': '9s' } as React.CSSProperties}
        />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/50">Gross volume · all time</p>
            {loading ? (
              <div className="mt-1 h-8 w-36 rounded skeleton" />
            ) : (
              <p className="num text-3xl font-extrabold leading-tight">{eur(gross)}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {stats && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-semibold ${stats.revenue >= stats.prevRevenue ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200' : 'border-red-300/40 bg-red-400/15 text-red-200'}`}>
                {stats.revenue >= stats.prevRevenue ? '▲' : '▼'} {Math.abs(delta(stats.revenue, stats.prevRevenue)).toFixed(0)}% revenue vs prev 30d
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold">
              {membersCount} active members
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold num">
              {board.length} on the leaderboard
            </span>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={eur(stats?.revenue ?? 0)} delta={stats ? delta(stats.revenue, stats.prevRevenue) : undefined} deltaLabel="vs prev 30d" icon={<TrendingUp size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="New Leads" value={String(stats?.leads ?? 0)} delta={stats ? delta(stats.leads, stats.prevLeads) : undefined} deltaLabel="vs prev 30d" icon={<Users size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="New Members" value={String(stats?.members ?? 0)} delta={stats ? delta(stats.members, stats.prevMembers) : undefined} deltaLabel="vs prev 30d" icon={<UserPlus size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Deals Submitted" value={String(stats?.dealsSubmitted ?? 0)} delta={stats ? delta(stats.dealsSubmitted, stats.prevDeals) : undefined} deltaLabel="vs prev 30d" icon={<Send size={16} strokeWidth={1.75} />} loading={loading} />
      </div>

      {/* Rings + revenue chart */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader title="Revenue generated" desc="Last 14 days · approved & closed deals" />
            {loading ? <Skeleton className="h-[220px] w-full" /> : <RevenueChart data={series} />}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="flex h-full flex-col">
            <CardHeader title="Platform pulse" desc="Breathing health rings" />
            {loading || !rings ? (
              <Skeleton className="mx-auto h-[220px] w-full max-w-[260px] rounded-xl" />
            ) : (
              <div className="flex flex-1 flex-wrap items-center justify-center gap-5 py-2">
                {rings.map((r, i) => (
                  <RingStatMini key={r.label} ring={r} delay={0.3 + i * 0.15} />
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Leaderboard mini */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5"
      >
        <Card>
          <CardHeader title="Leaderboard" desc="Top performers by revenue" action={<Crown size={16} strokeWidth={1.75} className="text-ink-300" />} />
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-1">
              {board.slice(0, 6).map((row, i) => (
                <motion.div
                  key={row.profile.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.3 + i * 0.05 }}
                  className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-transparent px-2 py-2 hover:border-line hover:bg-ink-50 transition-colors dark:hover:bg-[rgb(28,28,28)]"
                >
                  {/* race bar */}
                  <motion.div
                    aria-hidden
                    initial={{ width: 0 }}
                    animate={{ width: `${gross > 0 && board[0]?.revenue > 0 ? Math.max((row.revenue / (board[0].revenue || 1)) * 100, row.revenue > 0 ? 4 : 0) : 0}%` }}
                    transition={{ duration: 1, delay: 0.35 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute inset-y-0 left-0 rounded-lg ${
                      i === 0
                        ? 'bg-gradient-to-r from-amber-400/25 to-transparent'
                        : i === 1
                          ? 'bg-gradient-to-r from-ink-300/20 to-transparent dark:from-ink-600/20'
                          : i === 2
                            ? 'bg-gradient-to-r from-orange-400/15 to-transparent'
                            : 'bg-gradient-to-r from-ink-200/20 to-transparent dark:from-ink-800/60'
                    }`}
                  />
                  <RankBadge rank={i + 1} />
                  <Avatar name={row.profile.full_name} color={row.profile.avatar_color} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.profile.full_name}</p>
                    <p className="text-2xs capitalize text-ink-400">{row.level} · {row.profile.role}</p>
                  </div>
                  <div className="relative z-10 text-right">
                    <p className="num text-sm font-bold">{eur(row.revenue)}</p>
                    <p className="text-2xs text-ink-400">{row.deals} deals</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </PageContainer>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-sm'
      : rank === 2
        ? 'bg-gradient-to-b from-ink-300 to-ink-400 text-white dark:from-ink-600 dark:to-ink-700'
        : rank === 3
          ? 'bg-gradient-to-b from-orange-400 to-orange-600 text-white dark:from-orange-600 dark:to-orange-800'
          : 'bg-ink-100 text-ink-500 dark:bg-ink-200 dark:text-ink-400'
  return <span className={`num relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-2xs font-bold ${cls}`}>{rank}</span>
}

function RingStatMini({ ring, delay }: { ring: { label: string; value: number; colors: [string, string]; sub?: string }; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-1.5"
    >
      <ActivityRings rings={[{ value: ring.value, label: ring.label, colors: ring.colors }]} size={96} thickness={9}>
        <span className="num text-xs font-extrabold">{Math.round(ring.value)}%</span>
      </ActivityRings>
      <p className="text-center text-2xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-300">{ring.label}</p>
      {ring.sub && <p className="-mt-1 text-center text-[10px] text-ink-400 num">{ring.sub}</p>}
    </motion.div>
  )
}

/* ---------------- Seller/Headhunter homepage ---------------- */
function SellerHome({ user, data, loading }: { user: Profile; data: any; loading: boolean }) {
  const navigate = useNavigate()

  const myDeals = useMemo(() => (data ? (data.deals as Deal[]).filter((d) => d.seller_id === user.id) : []), [data, user.id])
  const myPayouts = useMemo(() => (data ? (data.payouts as Payout[]).filter((p) => p.seller_id === user.id) : []), [data, user.id])
  const revenue = useMemo(() => myDeals.filter((d) => d.status === 'closed' || d.status === 'approved').reduce((s, d) => s + d.gross_value, 0), [myDeals])
  const pendingReview = useMemo(() => myDeals.filter((d) => d.status === 'pending_review').length, [myDeals])
  const settings: Settings | undefined = data?.settings

  /* Career aggregates (achievements / streaks / xp) */
  const career = useMemo(
    () => (data ? careerTotals(data.deals, data.profiles, data.referrals, data.settings) : undefined),
    [data],
  )
  const mine = career?.get(user.id)
  const careerStats: SellerStats = {
    revenue: mine?.revenue ?? revenue,
    deals: mine?.deals ?? 0,
    closed: 0,
    payout: 0,
    referralEarnings: mine?.referralEarnings ?? 0,
    totalEarnings: 0,
  }

  /* Live monthly ranking */
  const monthRows = useMemo(() => {
    if (!data || !career) return []
    return rankRows(buildBoard(periodWindow('monthly'), data.deals, data.profiles, data.payouts, data.referrals, data.settings, career), 'revenue')
  }, [data, career])
  const myMonthRow = monthRows.find((r) => r.profile.id === user.id)

  const tier = tierProgress(mine?.revenue ?? revenue, settings ?? DEFAULT_SETTINGS)
  const streakMonths = mine?.streakMonths ?? 0

  /* Medals with live progress hints */
  const medals: ShelfMedal[] = [
    { key: 'first_deal', label: 'First Deal', earned: careerStats.deals >= 1, hint: 'Close your first deal' },
    { key: 'club_10k', label: '€10K Club', earned: careerStats.revenue >= 10000, hint: careerStats.revenue < 10000 ? `${eur(Math.max(10000 - careerStats.revenue, 0))} to go` : '' },
    { key: 'deal_machine', label: 'Deal Machine', earned: careerStats.deals >= 10, hint: careerStats.deals < 10 ? `${Math.max(10 - careerStats.deals, 0)} more deals` : '' },
    { key: 'rainmaker', label: 'Rainmaker', earned: careerStats.referralEarnings > 0, hint: 'Refer someone who closes' },
    { key: 'crown', label: 'Champion', earned: myMonthRow?.rank === 1 && (myMonthRow?.value ?? 0) > 0, hint: 'Reach #1 this month' },
    { key: 'on_fire', label: 'On Fire', earned: streakMonths >= 3, hint: 'Stay active 3 months straight' },
  ]

  /* Momentum series — personal daily booked revenue, last 14 days */
  const series = useMemo(() => {
    const counted = myDeals.filter((d) => d.status === 'closed' || d.status === 'approved')
    const out: { label: string; value: number }[] = []
    const now = Date.now()
    for (let i = 13; i >= 0; i--) {
      const start = now - (i + 1) * DAY
      const end = now - i * DAY
      const value = counted
        .filter((d) => { const t = new Date(d.created_at).getTime(); return t >= start && t < end })
        .reduce((s, d) => s + d.gross_value, 0)
      out.push({ label: new Date(end).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value })
    }
    return out
  }, [myDeals])

  /* Payout tracker */
  const paidTotal = useMemo(() => myPayouts.reduce((s, p) => s + (p.paid_amount || 0), 0), [myPayouts])
  const pendingTotal = useMemo(
    () => myPayouts.reduce((s, p) => s + Math.max(p.amount - (p.paid_amount || 0), 0), 0),
    [myPayouts],
  )

  /* Recent wins */
  const wins = useMemo(
    () =>
      myDeals
        .filter((d) => d.status === 'closed' || d.status === 'approved')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [myDeals],
  )

  const myLevel = effectiveLevel(user, revenue, settings ?? DEFAULT_SETTINGS)

  /* Live challenge count feeds the weekly digest */
  const challengesQ = useAsync(async () => db.listChallenges(), [])
  const activeChallengesCount = (challengesQ.data || []).filter((c) => c.status === 'active').length

  /* Marketplace claims */
  const claimsQ = useAsync(async () => db.listMarketLeads(), [])
  const claimedCount = (claimsQ.data || []).filter((l) => l.claimed_by === user.id).length

  /* Weekly digest → inbox (once per ISO week per user). A friendly
   * Monday-morning recap of rank, gaps, money and quests. */
  const digestTried = useRef(false)
  useEffect(() => {
    if (!data || !user || digestTried.current) return
    const wk = isoWeekKey(new Date())
    const storeKey = `digest:seen:${user.id}:${wk}`
    let seen = false
    try { seen = !!localStorage.getItem(storeKey) } catch { /* private mode */ }
    if (seen) {
      digestTried.current = true
      return
    }
    digestTried.current = true
    try { localStorage.setItem(storeKey, '1') } catch { /* ignore */ }

    const lines: string[] = []
    if (myMonthRow) {
      lines.push(`🏆 Leaderboard: you're #${myMonthRow.rank} of ${monthRows.length} this month${myMonthRow.momentum != null && myMonthRow.momentum !== 0 ? ` (${myMonthRow.momentum > 0 ? `▲ +${myMonthRow.momentum}` : `▼ ${myMonthRow.momentum}`} vs last month)` : ''}.`)
      const target = myMonthRow.rank === 1 ? monthRows[1] : monthRows.find((r) => r.rank === myMonthRow.rank - 1)
      if (target) {
        const gap = Math.abs(target.value - myMonthRow.value)
        lines.push(myMonthRow.rank === 1
          ? `👑 You lead ${target.profile.full_name} by ${eur(gap)} — defend the crown.`
          : `🎯 Gap to #${target.rank} (${target.profile.full_name}): ${eur(gap)}. One deal can flip it.`)
      }
    }
    if (pendingTotal > 0) lines.push(`💰 ${eur(pendingTotal)} in commissions is waiting for payout.`)
    if (activeChallengesCount > 0) lines.push(`⚔️ ${activeChallengesCount} live challenge${activeChallengesCount === 1 ? '' : 's'} on the board — check the Challenges page.`)
    const weekWins = wins.filter((d) => new Date(d.created_at).getTime() >= Date.now() - 7 * DAY)
    if (weekWins.length > 0) lines.push(`🎉 ${weekWins.length} win${weekWins.length === 1 ? '' : 's'} booked in the last 7 days (${eur(weekWins.reduce((s, d) => s + d.gross_value, 0))}).`)

    void db.sendInboxMessage(
      user.id,
      null,
      'system',
      `Your week in review · ${wk}`,
      `Here's your personal recap:\n\n${lines.join('\n')}\n\nSee you at the top.`,
      '/leaderboard',
      { kind: 'weekly_digest' },
    ).catch(() => { /* best-effort */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user?.id])

  return (
    <PageContainer>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.full_name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-ink-400">Your arena at a glance — progress, prizes and what pays next.</p>
        </div>
        <Badge tone="neutral" dot className="capitalize">{myLevel} · {user.role}</Badge>
      </div>

      {/* Hero player card */}
      <CareerCard
        name={user.full_name}
        avatarColor={user.avatar_color}
        avatarUrl={user.avatar_url}
        role={user.role}
        level={myLevel}
        nextLevel={tier.nextLevel}
        tierPct={tier.pct}
        remainingRevenue={tier.remaining}
        xp={xpOf(careerStats)}
        monthRank={myMonthRow?.rank ?? null}
        boardSize={monthRows.length}
        streakMonths={streakMonths}
      />

      {/* Core stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Your Revenue" value={eur(revenue)} icon={<TrendingUp size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Sales Payouts" value={eur(paidTotal)} icon={<Send size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Referral Earnings" value={eur(careerStats.referralEarnings)} icon={<Crown size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="In Review" value={String(pendingReview)} icon={<UserPlus size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Marketplace Claims" value={String(claimedCount)} icon={<Store size={16} strokeWidth={1.75} />} loading={loading} />
      </div>

      {/* Momentum + payout tracker */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-2"
        >
          <Card className="h-full">
            <CardHeader title="Your momentum" desc="Daily booked revenue · last 14 days" />
            {loading ? <Skeleton className="h-40 w-full" /> : <MomentumChart series={series} />}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="h-full">
            <CardHeader title="Money radar" desc="Commission collection status" />
            {loading ? (
              <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <PayoutTracker paid={paidTotal} pending={pendingTotal} />
            )}
          </Card>
        </motion.div>
      </div>

      {/* Medals + recent wins */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="h-full">
            <CardHeader title="Medal shelf" desc="Locked medals show exactly how to earn them" />
            {!loading && <MedalShelf medals={medals} />}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="h-full">
            <CardHeader title="Recent wins" desc="Your latest approved & closed deals" />
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : (
              <RecentWins deals={wins} />
            )}
          </Card>
        </motion.div>
      </div>

      {/* Full pipeline */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5"
      >
        <Card>
          <CardHeader title="Deal pipeline" desc="Tap a row to manage" />
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : myDeals.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No deals yet — submit your first one.</p>
          ) : (
            <div className="divide-y divide-line">
              {myDeals.slice(0, 6).map((d) => {
                const m = STATUS_META[d.status]
                return (
                  <button key={d.id} onClick={() => navigate(`/deals/${d.id}`)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-ink-50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.company || 'Untitled deal'}</p>
                      <p className="text-2xs text-ink-400">{d.contact_name || 'No contact'}</p>
                    </div>
                    <Badge tone={m.tone} dot>{m.label}</Badge>
                    <p className="num w-24 text-right text-sm font-semibold">{eur(d.gross_value)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </motion.div>
    </PageContainer>
  )
}
