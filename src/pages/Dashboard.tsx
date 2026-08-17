import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, Users, UserPlus, Send, Crown, Medal } from 'lucide-react'
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
import { leaderboard, periodStats, revenueSeries, grossVolume, effectiveLevel, referralEarnings } from '../lib/metrics'
import { eur, delta } from '../lib/format'

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

  return <AdminHome data={data} loading={loading} />
}

/* ---------------- Admin homepage ---------------- */
function AdminHome({ data, loading }: { data: any; loading: boolean }) {
  const stats = useMemo(() => (data ? periodStats(data.deals, data.companies, data.profiles) : null), [data])
  const board = useMemo(() => (data ? leaderboard(data.deals, data.profiles, data.payouts, data.referrals, data.settings) : []), [data])
  const series = useMemo(() => (data ? revenueSeries(data.deals, 14) : []), [data])
  const gross = useMemo(() => (data ? grossVolume(data.deals) : 0), [data])

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ink-400">Company performance across referrals & revenue.</p>
        </div>
        <div className="text-right">
          <p className="text-2xs text-ink-400">Gross volume</p>
          {loading ? <Skeleton className="h-7 w-32" /> : <p className="num text-xl font-semibold">{eur(gross)}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={eur(stats?.revenue ?? 0)} delta={stats ? delta(stats.revenue, stats.prevRevenue) : undefined} deltaLabel="vs prev 30d" icon={<TrendingUp size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="New Leads" value={String(stats?.leads ?? 0)} delta={stats ? delta(stats.leads, stats.prevLeads) : undefined} deltaLabel="vs prev 30d" icon={<Users size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="New Members" value={String(stats?.members ?? 0)} delta={stats ? delta(stats.members, stats.prevMembers) : undefined} deltaLabel="vs prev 30d" icon={<UserPlus size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Deals Submitted" value={String(stats?.dealsSubmitted ?? 0)} delta={stats ? delta(stats.dealsSubmitted, stats.prevDeals) : undefined} deltaLabel="vs prev 30d" icon={<Send size={16} strokeWidth={1.75} />} loading={loading} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue generated" desc="Last 14 days · approved & closed deals" />
          {loading ? <Skeleton className="h-[220px] w-full" /> : <RevenueChart data={series} />}
        </Card>

        <Card>
          <CardHeader title="Leaderboard" desc="Revenue by seller / headhunter" action={<Crown size={16} strokeWidth={1.75} className="text-ink-300" />} />
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-1">
              {board.slice(0, 5).map((row, i) => (
                <motion.div
                  key={row.profile.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50 transition-colors"
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-2xs font-semibold ${i === 0 ? 'bg-ink text-white' : 'bg-ink-50 text-ink-500'}`}>{i + 1}</span>
                  <Avatar name={row.profile.full_name} color={row.profile.avatar_color} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.profile.full_name}</p>
                    <p className="text-2xs text-ink-400 capitalize">{row.profile.role} · {row.level}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-semibold">{eur(row.revenue)}</p>
                    <p className="text-2xs text-ink-400">{row.deals} deals</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  )
}

/* ---------------- Seller/Headhunter homepage ---------------- */
function SellerHome({ user, data, loading }: { user: Profile; data: any; loading: boolean }) {
  const navigate = useNavigate()
  const myDeals = useMemo(() => (data ? (data.deals as Deal[]).filter((d) => d.seller_id === user.id) : []), [data, user.id])
  const myPayouts = useMemo(() => (data ? (data.payouts as Payout[]).filter((p) => p.seller_id === user.id) : []), [data, user.id])
  const revenue = useMemo(() => myDeals.filter((d) => d.status === 'closed' || d.status === 'approved').reduce((s, d) => s + d.gross_value, 0), [myDeals])
  const earned = useMemo(() => myPayouts.reduce((s, p) => s + (p.paid_amount || 0), 0), [myPayouts])
  const pending = useMemo(() => {
    return myPayouts.reduce((s, p) => {
      const collectable = p.amount - (p.paid_amount || 0)
      return s + Math.max(collectable, 0)
    }, 0)
  }, [myPayouts])
  const pendingReview = useMemo(() => myDeals.filter((d) => d.status === 'pending_review').length, [myDeals])
  const myLevel = useMemo(() => (data ? effectiveLevel(user, revenue, data.settings) : user.level), [data, user, revenue])
  const myReferralEarnings = useMemo(() => (data ? referralEarnings(user.id, data.referrals, data.deals, data.profiles, data.settings) : 0), [data, user.id])

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.full_name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-ink-400">Your sales performance at a glance.</p>
        </div>
        <Badge tone="neutral" dot className="capitalize">{myLevel} · {user.role}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Your Revenue" value={eur(revenue)} icon={<TrendingUp size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Sales Payouts" value={eur(earned)} icon={<Send size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="Referral Earnings" value={eur(myReferralEarnings)} icon={<Medal size={16} strokeWidth={1.75} />} loading={loading} />
        <StatCard label="In Review" value={String(pendingReview)} icon={<Crown size={16} strokeWidth={1.75} />} loading={loading} />
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent deals" desc="Tap a row to manage" />
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
    </PageContainer>
  )
}
