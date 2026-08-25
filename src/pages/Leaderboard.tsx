import { useMemo, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { Briefcase, Swords, TrendingUp, Wallet } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { PageContainer } from '../components/layout/AppShell'
import { DEFAULT_SETTINGS } from '../lib/types'
import {
  buildBoard,
  careerTotals,
  hallOfRecords,
  periodWindow,
  previousWindow,
  rankRows,
  type Category,
  type Period,
} from '../lib/gamification'
import { Podium } from '../components/leaderboard/Podium'
import { YourCard } from '../components/leaderboard/YourCard'
import { RankRow } from '../components/leaderboard/RankRow'
import { HallOfRecords } from '../components/leaderboard/HallOfRecords'
import { DuelModal } from '../components/leaderboard/DuelModal'
import { useAuth } from '../context/AuthContext'

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: 'revenue', label: 'Sales Revenue', icon: <TrendingUp size={16} strokeWidth={1.75} /> },
  { key: 'deals', label: 'Deals Count', icon: <Briefcase size={16} strokeWidth={1.75} /> },
  { key: 'earnings', label: 'Earnings', icon: <Wallet size={16} strokeWidth={1.75} /> },
]

const PERIOD_LABEL: Record<Period, string> = {
  all: 'All time',
  monthly: 'This month',
  weekly: 'This week',
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [category, setCategory] = useState<Category>('revenue')
  const [period, setPeriod] = useState<Period>('all')
  const [duel, setDuel] = useState<{ leftId: string | null; rightId: string | null } | null>(null)

  const { data, loading } = useAsync(async () => {
    const [profiles, deals, payouts, referrals] = await Promise.all([
      db.listProfiles(), db.listDeals(), db.listPayouts(), db.listReferrals(),
    ])
    const settings = await db.getSettings()
    return { profiles, deals, payouts, referrals, settings: settings || DEFAULT_SETTINGS }
  }, [])

  // Career totals drive achievements / records (all-time, filter-independent)
  const career = useMemo(
    () => (data ? careerTotals(data.deals, data.profiles, data.referrals, data.settings) : undefined),
    [data],
  )

  const board = useMemo(() => {
    if (!data || !career) return []
    return buildBoard(periodWindow(period), data.deals, data.profiles, data.payouts, data.referrals, data.settings, career)
  }, [data, career, period])

  const prevBoard = useMemo(() => {
    if (!data || !career || period === 'all') return undefined
    return buildBoard(previousWindow(period), data.deals, data.profiles, data.payouts, data.referrals, data.settings, career)
  }, [data, career, period])

  const rows = useMemo(() => rankRows(board, category, prevBoard), [board, category, prevBoard])

  const records = useMemo(
    () => (data && career ? hallOfRecords(data.deals, data.profiles, data.referrals, career) : []),
    [data, career],
  )

  const myRow = user ? rows.find((r) => r.profile.id === user.id) ?? null : null

  function openDuel(opponentId: string) {
    if (rows.length < 2) return
    let left = myRow?.profile.id ?? rows[0].profile.id
    let right = opponentId
    if (left === right) left = rows.find((r) => r.profile.id !== right)!.profile.id
    setDuel({ leftId: left, rightId: right })
  }

  const scopeLabel = `${PERIOD_LABEL[period]} · ${CATEGORIES.find((c) => c.key === category)?.label}`

  return (
    <MotionConfig reducedMotion="user">
      <PageContainer>
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              Leaderboard
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-pos opacity-60 status-ring" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-pos" />
              </span>
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              {loading ? 'Loading the arena…' : `${rows.length} competitors in the race · tap any rival to duel`}
            </p>
          </div>
        </div>

        {/* Period + category tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {([['all', 'All Time'], ['monthly', 'This Month'], ['weekly', 'This Week']] as [Period, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)}
                className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${period === key ? 'text-white dark:text-[rgb(240,240,240)]' : 'text-ink-500 hover:text-ink'}`}
              >
                {period === key && <motion.span layoutId="lb-period" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {CATEGORIES.map((cat) => (
              <button key={cat.key} onClick={() => setCategory(cat.key)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${category === cat.key ? 'text-white dark:text-[rgb(240,240,240)]' : 'text-ink-500 hover:text-ink'}`}
              >
                {category === cat.key && <motion.span layoutId="lb-cat" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
                <span className="relative flex items-center gap-1.5">{cat.icon}{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <>
            <div className="mb-6 grid grid-cols-3 items-end gap-3">
              <Skeleton className="h-56 rounded-t-2xl" />
              <Skeleton className="h-64 rounded-t-2xl" />
              <Skeleton className="h-52 rounded-t-2xl" />
            </div>
            <Skeleton className="mb-4 h-24 w-full rounded-2xl" />
            <Card>
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            </Card>
          </>
        ) : rows.length === 0 ? (
          <Card>
            <p className="py-12 text-center text-sm text-ink-400">No competitors on the board yet for this period.</p>
          </Card>
        ) : (
          <>
            {/* Cinematic podium */}
            {rows.length >= 1 && <Podium rows={rows} category={category} />}

            {/* Personal stake */}
            {myRow && (
              <div className="mt-4">
                <YourCard myRow={myRow} board={rows} category={category} onDuel={openDuel} />
              </div>
            )}

            {/* Hall of records */}
            {records.length > 0 && (
              <div className="mt-5">
                <HallOfRecords records={records} />
              </div>
            )}

            {/* The race */}
            <Card className="mt-5">
              <CardHeader
                title="The Race"
                desc={`${PERIOD_LABEL[period]} · ranked by ${CATEGORIES.find((c) => c.key === category)?.label.toLowerCase()}`}
                action={<Swords size={16} strokeWidth={1.75} className="text-ink-300" />}
              />
              <div className="space-y-1.5">
                {rows.map((row, i) => (
                  <RankRow
                    key={row.profile.id}
                    row={row}
                    category={category}
                    index={i}
                    isMe={user?.id === row.profile.id}
                    onDuel={openDuel}
                  />
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Head-to-head duel */}
        <DuelModal
          open={duel != null}
          onClose={() => setDuel(null)}
          rows={rows}
          leftId={duel?.leftId ?? null}
          rightId={duel?.rightId ?? null}
          onSwap={(leftId, rightId) => setDuel({ leftId, rightId })}
          scopeLabel={scopeLabel}
        />
      </PageContainer>
    </MotionConfig>
  )
}
