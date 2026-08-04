import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Briefcase, Wallet, Network, Crown, Medal } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Skeleton } from '../components/ui/Skeleton'
import { PageContainer } from '../components/layout/AppShell'
import { leaderboard } from '../lib/metrics'
import { DEFAULT_SETTINGS } from '../lib/types'
import { eur } from '../lib/format'

type Category = 'revenue' | 'deals' | 'earnings'

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode; valueLabel: string }[] = [
  { key: 'revenue', label: 'Sales Revenue', icon: <TrendingUp size={16} strokeWidth={1.75} />, valueLabel: 'Revenue' },
  { key: 'deals', label: 'Deals Count', icon: <Briefcase size={16} strokeWidth={1.75} />, valueLabel: 'Deals' },
  { key: 'earnings', label: 'Earnings', icon: <Wallet size={16} strokeWidth={1.75} />, valueLabel: 'Earned' },
]

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>('revenue')
  const { data, loading } = useAsync(async () => {
    const [profiles, deals, payouts, referrals] = await Promise.all([
      db.listProfiles(), db.listDeals(), db.listPayouts(), db.listReferrals(),
    ])
    const settings = await db.getSettings()
    return { profiles, deals, payouts, referrals, settings }
  }, [])

  const board = useMemo(() => {
    if (!data) return []
    return leaderboard(data.deals, data.profiles, data.payouts, data.referrals, data.settings || DEFAULT_SETTINGS)
  }, [data])

  const sorted = useMemo(() => {
    const arr = [...board]
    if (category === 'revenue') arr.sort((a, b) => b.revenue - a.revenue)
    if (category === 'deals') arr.sort((a, b) => b.deals - a.deals)
    if (category === 'earnings') arr.sort((a, b) => b.totalEarnings - a.totalEarnings)
    return arr
  }, [board, category])

  const activeCat = CATEGORIES.find((c) => c.key === category)!

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-ink-400">See how everyone is performing across the company.</p>
      </div>

      {/* Category tabs */}
      <div className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              category === cat.key ? 'text-white' : 'text-ink-500 hover:text-ink'
            }`}
          >
            {category === cat.key && (
              <motion.span layoutId="lb-cat" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />
            )}
            <span className="relative flex items-center gap-1.5">{cat.icon}{cat.label}</span>
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">No data yet.</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((row, i) => (
              <motion.div
                key={row.profile.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-ink-50 transition-colors"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-ink text-white' : i < 3 ? 'bg-ink-100 text-ink-700' : 'bg-ink-50 text-ink-400'}`}>
                  {i === 0 ? <Crown size={14} strokeWidth={1.75} /> : i + 1}
                </span>
                <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.profile.full_name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge tone="neutral">{row.level}</Badge>
                    <span className="text-2xs text-ink-400 capitalize">{row.profile.role}</span>
                    {row.referralEarnings > 0 && category === 'earnings' && (
                      <span className="flex items-center gap-0.5 text-2xs text-ink-400">
                        <Network size={11} strokeWidth={1.75} /> {eur(row.referralEarnings)} ref
                      </span>
                    )}
                  </div>
                </div>
                {/* value */}
                <div className="text-right">
                  {category === 'revenue' && <p className="num text-sm font-semibold">{eur(row.revenue)}</p>}
                  {category === 'deals' && <p className="num text-sm font-semibold">{row.deals} <span className="text-2xs font-normal text-ink-400">deals</span></p>}
                  {category === 'earnings' && (
                    <div className="text-right">
                      <p className="num text-sm font-semibold">{eur(row.totalEarnings)}</p>
                      <p className="text-2xs text-ink-400">{eur(row.payout)} + {eur(row.referralEarnings)} ref</p>
                    </div>
                  )}
                  {category === 'revenue' && <p className="text-2xs text-ink-400">{row.deals} deals · {row.closed} closed</p>}
                  {category === 'deals' && <p className="text-2xs text-ink-400">{row.closed} closed · {eur(row.revenue)}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* summary cards */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => {
          const top = [...board].sort((a, b) => {
            if (cat.key === 'revenue') return b.revenue - a.revenue
            if (cat.key === 'deals') return b.deals - a.deals
            return b.totalEarnings - a.totalEarnings
          })[0]
          return (
            <Card key={cat.key}>
              <div className="flex items-center gap-2 text-ink-400">
                {cat.icon}
                <p className="text-2xs">{cat.label}</p>
              </div>
              {top ? (
                <>
                  <p className="mt-2 truncate text-sm font-medium">{top.profile.full_name}</p>
                  <p className="num mt-1 text-lg font-semibold">
                    {cat.key === 'revenue' ? eur(top.revenue) : cat.key === 'deals' ? top.deals : eur(top.totalEarnings)}
                  </p>
                </>
              ) : <Skeleton className="mt-2 h-10" />}
            </Card>
          )
        })}
      </div>
    </PageContainer>
  )
}
