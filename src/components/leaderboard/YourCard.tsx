import { motion } from 'framer-motion'
import { Crown, Flame, Swords, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import type { Category, RankedRow } from '../../lib/gamification'
import { eur } from '../../lib/format'
import { Avatar } from '../ui/Avatar'

/**
 * The logged-in user's pinned stake card: current rank, the gap to the
 * next rung (or the lead over #2), promotion progress and XP. This is
 * the daily-motivation anchor of the page.
 */
export function YourCard({
  myRow,
  board,
  category,
  onDuel,
}: {
  myRow: RankedRow
  board: RankedRow[]
  category: Category
  onDuel: (opponentId: string) => void
}) {
  const isLeader = myRow.rank === 1
  const target = isLeader ? board[1] : board.find((r) => r.rank === myRow.rank - 1)
  const gap = target ? Math.abs(target.value - myRow.value) : 0

  const unit = (v: number) => (category === 'deals' ? `${Math.round(v)} deals` : eur(v))
  const chasePct =
    target && target.value > 0 ? Math.min((myRow.value / target.value) * 100, 100) : isLeader ? 100 : 0

  const momentumTone =
    myRow.momentum == null || myRow.momentum === 0
      ? 'border-line bg-ink-50 text-ink-400'
      : myRow.momentum > 0
        ? 'border-pos/25 bg-posBg text-pos'
        : 'border-neg/25 bg-negBg text-neg'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.75, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      {/* subtle edge glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink-300/60 to-transparent dark:via-ink-700" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Rank + identity */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <span
              className={`num flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black ${
                isLeader ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white' : 'bg-ink text-white dark:bg-[rgb(58,58,58)]'
              }`}
            >
              #{myRow.rank}
            </span>
          </div>
          <Avatar name={myRow.profile.full_name} color={myRow.profile.avatar_color} url={myRow.profile.avatar_url} size={38} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
              Your position
              {isLeader && (
                <>
                  · <Crown size={11} strokeWidth={2} className="text-amber-500" /> <span className="text-amber-600 dark:text-amber-400">Champion</span>
                </>
              )}
            </p>
            <p className="truncate text-sm font-semibold">{myRow.profile.full_name}</p>
          </div>
        </div>

        {/* Momentum + streak + XP chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {myRow.momentum != null && myRow.momentum !== 0 && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${momentumTone}`}>
              {myRow.momentum > 0 ? <TrendingUp size={11} strokeWidth={2} /> : <TrendingDown size={11} strokeWidth={2} />}
              {myRow.momentum > 0 ? `+${myRow.momentum}` : myRow.momentum}
            </span>
          )}
          {myRow.streakMonths >= 2 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warn/25 bg-warnBg px-2 py-0.5 text-2xs font-semibold text-warn">
              <Flame size={11} strokeWidth={2} />
              {myRow.streakMonths}-mo streak
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-info/25 bg-infoBg px-2 py-0.5 text-2xs font-semibold text-info">
            <Zap size={11} strokeWidth={2} />
            {myRow.xp.toLocaleString('en')} pts
          </span>
        </div>

        {/* Duel CTA */}
        {!isLeader && target && (
          <button
            onClick={() => onDuel(target.profile.id)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800 active:bg-ink-900 dark:bg-[rgb(58,58,58)] dark:hover:bg-[rgb(72,72,72)]"
          >
            <Swords size={13} strokeWidth={2} />
            Challenge {target.profile.full_name.split(' ')[0]}
          </button>
        )}
      </div>

      {/* Chase / lead strip */}
      {target ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
            {isLeader ? (
              <p className="text-ink-500 dark:text-ink-400">
                Leading <span className="font-semibold text-ink">{target.profile.full_name}</span> by{' '}
                <span className="num font-bold text-pos">{unit(gap)}</span> — defend the crown.
              </p>
            ) : (
              <p className="text-ink-500 dark:text-ink-400">
                <span className="num font-bold text-ink">{unit(gap)}</span> behind{' '}
                <span className="font-semibold text-ink">{target.profile.full_name}</span> (#{
                  target.rank
                }). Take the rung.
              </p>
            )}
            <span className="hidden shrink-0 text-2xs text-ink-300 num sm:block">{Math.round(chasePct)}%</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
            <motion.div
              key={`${category}-${myRow.value}-${target.value}`}
              initial={{ width: 0 }}
              animate={{ width: `${chasePct}%` }}
              transition={{ duration: 1, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full rounded-full ${isLeader ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-ink-400 to-ink'}`}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-400">You're the only one on the board for this view — set the benchmark.</p>
      )}

      {/* Promotion progress */}
      {myRow.tier.nextLevel && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-2xs font-semibold text-ink-400">
            {eur(myRow.tier.remaining)} to {myRow.tier.nextLevel}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-info/70 to-info"
              initial={{ width: 0 }}
              animate={{ width: `${myRow.tier.pct}%` }}
              transition={{ duration: 1, delay: 1.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="text-2xs font-bold text-ink-400 num">{Math.round(myRow.tier.pct)}%</span>
        </div>
      )}
    </motion.div>
  )
}
