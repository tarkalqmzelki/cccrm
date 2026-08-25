import { motion } from 'framer-motion'
import { Flame, TrendingDown, TrendingUp } from 'lucide-react'
import type { RankedRow, Category } from '../../lib/gamification'
import { eur } from '../../lib/format'
import { Avatar } from '../ui/Avatar'
import { AchievementMedals } from './medals'
import { useCountUp } from './useCountUp'

/**
 * A single race-track row. Rows are rendered inside a shared layout
 * group so switching category/period makes them physically glide past
 * each other into their new positions.
 */
export function RankRow({
  row,
  category,
  index,
  isMe,
  onDuel,
}: {
  row: RankedRow
  category: Category
  index: number
  isMe: boolean
  onDuel: (opponentId: string) => void
}) {
  const display = useCountUp(row.value, 0.9, Math.min(index * 0.04, 0.4))
  const isTop3 = row.rank <= 3

  const accentBar =
    row.rank === 1
      ? 'from-amber-400/50 to-amber-400/10 dark:from-amber-500/30 dark:to-transparent'
      : row.rank === 2
        ? 'from-ink-300/40 to-transparent dark:from-ink-600/30'
        : row.rank === 3
          ? 'from-orange-400/35 to-transparent dark:from-orange-600/25'
          : 'from-ink-200/45 to-transparent dark:from-ink-800'

  const momentumTone =
    row.momentum == null || row.momentum === 0
      ? 'text-ink-300'
      : row.momentum > 0
        ? 'text-pos'
        : 'text-neg'

  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
      <motion.button
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, delay: Math.min(index * 0.035, 0.5) }}
        whileTap={{ scale: 0.99 }}
        onClick={() => onDuel(row.profile.id)}
        title={`Head-to-head with ${row.profile.full_name}`}
        className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-colors sm:gap-3 ${
          isMe
            ? 'border-info/30 bg-infoBg/60 dark:bg-infoBg/30'
            : isTop3
              ? 'border-line bg-surface hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]'
              : 'border-transparent hover:border-line hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]'
        }`}
      >
        {/* Race track fill */}
        <motion.div
          aria-hidden
          initial={{ width: 0 }}
          animate={{ width: `${row.pctToLeader}%` }}
          transition={{ duration: 1.1, delay: 0.15 + Math.min(index * 0.05, 0.6), ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${accentBar}`}
        />

        {/* Rank */}
        <span
          className={`num relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            row.rank === 1
              ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-sm'
              : row.rank === 2
                ? 'bg-gradient-to-b from-ink-300 to-ink-400 text-white dark:from-ink-600 dark:to-ink-700'
                : row.rank === 3
                  ? 'bg-gradient-to-b from-orange-400 to-orange-600 text-white dark:from-orange-600 dark:to-orange-800'
                  : 'bg-ink-100 text-ink-500 dark:bg-ink-200 dark:text-ink-400'
          }`}
        >
          {row.rank}
        </span>

        {/* Momentum arrow */}
        <span className={`relative z-10 hidden w-4 shrink-0 justify-center sm:flex ${momentumTone}`}>
          {row.momentum != null && row.momentum !== 0 ? (
            row.momentum > 0 ? (
              <TrendingUp size={13} strokeWidth={2.25} />
            ) : (
              <TrendingDown size={13} strokeWidth={2.25} />
            )
          ) : (
            <span className="h-1 w-1 rounded-full bg-current opacity-60" />
          )}
        </span>

        <div className="relative z-10">
          <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={34} />
          {row.rank === 1 && (
            <span className="absolute -right-1 -top-1.5 text-[11px]" title="Champion">
              👑
            </span>
          )}
        </div>

        {/* Name + meta */}
        <div className="relative z-10 min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{row.profile.full_name}</span>
            {isMe && (
              <span className="shrink-0 rounded-full bg-info px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">You</span>
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-2xs capitalize text-ink-400">{row.tier.level} · {row.profile.role}</span>
            {row.streakMonths >= 2 && (
              <span className="inline-flex items-center gap-0.5 text-2xs font-semibold text-warn">
                <Flame size={10} strokeWidth={2.25} />
                {row.streakMonths}
              </span>
            )}
            <AchievementMedals achievements={row.achievements} max={5} />
          </div>
        </div>

        {/* Value */}
        <div className="relative z-10 shrink-0 text-right">
          <p className="num text-sm font-bold tabular-nums">
            {category === 'deals' ? Math.round(display).toLocaleString('en') : eur(display)}
          </p>
          <p className="text-2xs text-ink-400 num">
            {category === 'revenue' && `${row.stats.deals} deals`}
            {category === 'deals' && `${row.stats.closed} closed`}
            {category === 'earnings' && `${eur(row.stats.payout)} + ${eur(row.stats.referralEarnings)} ref`}
          </p>
          <p className="hidden text-2xs font-medium text-ink-300 num sm:block">{row.xp.toLocaleString('en')} pts</p>
        </div>
      </motion.button>
    </motion.div>
  )
}
