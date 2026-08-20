import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Briefcase, Wallet, Crown, Medal, Flame, Trophy, ArrowUp, ArrowDown } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { PageContainer } from '../components/layout/AppShell'
import { leaderboard } from '../lib/metrics'
import { DEFAULT_SETTINGS } from '../lib/types'
import { eur } from '../lib/format'

type Category = 'revenue' | 'deals' | 'earnings'
type Period = 'all' | 'monthly' | 'weekly'

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: 'revenue', label: 'Sales Revenue', icon: <TrendingUp size={16} strokeWidth={1.75} /> },
  { key: 'deals', label: 'Deals Count', icon: <Briefcase size={16} strokeWidth={1.75} /> },
  { key: 'earnings', label: 'Earnings', icon: <Wallet size={16} strokeWidth={1.75} /> },
]

const DAY = 86400000

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>('revenue')
  const [period, setPeriod] = useState<Period>('all')
  const { data, loading } = useAsync(async () => {
    const [profiles, deals, payouts, referrals] = await Promise.all([
      db.listProfiles(), db.listDeals(), db.listPayouts(), db.listReferrals(),
    ])
    const settings = await db.getSettings()
    return { profiles, deals, payouts, referrals, settings: settings || DEFAULT_SETTINGS }
  }, [])

  const board = useMemo(() => {
    if (!data) return []
    return leaderboard(data.deals, data.profiles, data.payouts, data.referrals, data.settings)
  }, [data])

  // Filter by period
  const filteredBoard = useMemo(() => {
    if (period === 'all') return board
    const cutoff = period === 'weekly' ? Date.now() - 7 * DAY : Date.now() - 30 * DAY
    return board.map((row) => {
      const periodDeals = data!.deals.filter((d) => d.seller_id === row.profile.id && new Date(d.created_at).getTime() >= cutoff && (d.status === 'closed' || d.status === 'approved'))
      const revenue = periodDeals.reduce((s, d) => s + d.gross_value, 0)
      const dealsCount = periodDeals.length
      const periodPayouts = data!.payouts.filter((p) => p.seller_id === row.profile.id && new Date(p.created_at).getTime() >= cutoff)
      const payout = periodPayouts.reduce((s, p) => s + (p.paid_amount || 0), 0)
      return { ...row, revenue, deals: dealsCount, payout, totalEarnings: payout + row.referralEarnings }
    })
  }, [board, period, data])

  const sorted = useMemo(() => {
    const arr = [...filteredBoard]
    if (category === 'revenue') arr.sort((a, b) => b.revenue - a.revenue)
    if (category === 'deals') arr.sort((a, b) => b.deals - a.deals)
    if (category === 'earnings') arr.sort((a, b) => b.totalEarnings - a.totalEarnings)
    // Show ALL sellers including those with 0 revenue/deals
    return arr
  }, [filteredBoard, category])

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-ink-400">Public rankings — compete, collaborate, and climb.</p>
      </div>

      {/* Period tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1 w-fit">
        {([
          ['all', 'All Time'],
          ['monthly', 'This Month'],
          ['weekly', 'This Week'],
        ] as [Period, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)}
            className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${period === key ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            {period === key && <motion.span layoutId="lb-period" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {/* Category tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-line bg-surface p-1 w-fit">
        {CATEGORIES.map((cat) => (
          <button key={cat.key} onClick={() => setCategory(cat.key)}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${category === cat.key ? 'text-white' : 'text-ink-500 hover:text-ink'}`}
          >
            {category === cat.key && <motion.span layoutId="lb-cat" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative flex items-center gap-1.5">{cat.icon}{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Podium — Top 3 */}
      {sorted.length >= 1 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {/* 2nd place */}
          {sorted[1] && (
            <PodiumCard row={sorted[1]} rank={2} category={category} />
          )}
          {/* 1st place — center, taller */}
          {sorted[0] && (
            <PodiumCard row={sorted[0]} rank={1} category={category} />
          )}
          {/* 3rd place */}
          {sorted[2] && (
            <PodiumCard row={sorted[2]} rank={3} category={category} />
          )}
        </div>
      )}

      {/* Full list */}
      <Card>
        <CardHeader title="Full ranking" desc={`${sorted.length} participants`} />
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">No data yet for this period.</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((row, i) => {
              const isTop3 = i < 3
              const value = category === 'revenue' ? row.revenue : category === 'deals' ? row.deals : row.totalEarnings
              return (
                <motion.div
                  key={row.profile.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.5) }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${isTop3 ? 'bg-ink-50' : 'hover:bg-ink-50'}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-ink text-white' : i < 3 ? 'bg-ink-100 text-ink-700' : 'bg-ink-50 text-ink-400'}`}>
                    {i + 1}
                  </span>
                  <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.profile.full_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{row.level}</Badge>
                      <span className="text-2xs text-ink-400 capitalize">{row.profile.role}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {value === 0 ? (
                      <>
                        <p className="num text-sm text-ink-300">—</p>
                        <p className="text-2xs text-ink-300">No activity yet</p>
                      </>
                    ) : (
                      <>
                        <p className="num text-sm font-bold">
                          {category === 'deals' ? `${value}` : eur(value)}
                        </p>
                        <p className="text-2xs text-ink-400">
                          {category === 'revenue' && `${row.deals} deals`}
                          {category === 'deals' && `${row.closed} closed`}
                          {category === 'earnings' && `${eur(row.payout)} + ${eur(row.referralEarnings)} ref`}
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </Card>
    </PageContainer>
  )
}

function PodiumCard({ row, rank, category }: { row: any; rank: number; category: Category }) {
  const value = category === 'revenue' ? row.revenue : category === 'deals' ? row.deals : row.totalEarnings
  const isFirst = rank === 1
  const icon = isFirst ? <Crown size={20} strokeWidth={1.75} /> : rank === 2 ? <Medal size={18} strokeWidth={1.75} /> : <Medal size={18} strokeWidth={1.75} />
  const bgClass = isFirst ? 'bg-ink text-white' : rank === 2 ? 'bg-ink-100' : 'bg-ink-50'
  const heightClass = isFirst ? 'pt-8 pb-8' : 'pt-6 pb-6'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={`relative rounded-2xl ${bgClass} ${heightClass} flex flex-col items-center justify-center text-center overflow-hidden`}
    >
      {/* Glow for #1 */}
      {isFirst && (
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 h-24 w-24 rounded-full bg-white blur-2xl" />
        </div>
      )}
      {/* Rank badge */}
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${isFirst ? 'bg-white text-[#0A0A0A]' : 'bg-surface text-ink-400'}`}>
        {icon}
      </div>
      <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={isFirst ? 48 : 36} />
      <p className={`mt-2 text-sm font-semibold truncate max-w-full px-2 ${isFirst ? 'text-white' : 'text-ink'}`}>{row.profile.full_name}</p>
      <p className={`text-2xs ${isFirst ? 'text-white/70' : 'text-ink-400'}`}>{row.profile.role} · {row.level}</p>
      <p className={`mt-2 num text-lg font-bold ${isFirst ? 'text-white' : 'text-ink'}`}>
        {category === 'deals' ? `${value} deals` : eur(value)}
      </p>
    </motion.div>
  )
}
