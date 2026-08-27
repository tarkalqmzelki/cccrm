import { motion } from 'framer-motion'
import { Crown, Flame, TrendingUp, Zap } from 'lucide-react'
import { eur } from '../../lib/format'
import { Avatar } from '../ui/Avatar'

/**
 * Hero "player card" for the seller overview — identity, level
 * promotion bar, XP, live rank and streak on a premium gradient.
 */
export function CareerCard({
  name,
  avatarColor,
  avatarUrl,
  role,
  level,
  nextLevel,
  tierPct,
  remainingRevenue,
  xp,
  monthRank,
  boardSize,
  streakMonths,
}: {
  name: string
  avatarColor?: string
  avatarUrl?: string
  role: string
  level: string
  nextLevel: string | null
  tierPct: number
  remainingRevenue: number
  xp: number
  monthRank: number | null
  boardSize: number
  streakMonths: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 p-5 text-white shadow-glass dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]"
    >
      {/* Decorative glows */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-info/20 blur-3xl" />

      {/* Shine sweep */}
      <div
        aria-hidden
        className="sheen-x pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        style={{ '--sheen-cycle': '9s' } as React.CSSProperties}
      />

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="relative shrink-0">
            <Avatar name={name} color={avatarColor} url={avatarUrl} size={56} />
            <span className="absolute inset-0 rounded-full ring-2 ring-white/25" />
            <span className="absolute -bottom-1 -right-1 rounded-md bg-gradient-to-b from-amber-400 to-amber-600 px-1.5 py-px text-[10px] font-black text-white shadow">
              {level}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/50">Seller card</p>
            <p className="truncate text-lg font-bold leading-tight">{name}</p>
            <p className="text-xs capitalize text-white/60">{role}</p>
          </div>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {monthRank != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold">
              <TrendingUp size={11} strokeWidth={2} />
              #{monthRank} of {boardSize} this month
            </span>
          )}
          {monthRank === 1 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-2xs font-semibold text-amber-200">
              <Crown size={11} strokeWidth={2} /> Champion
            </span>
          )}
          {streakMonths >= 2 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-300/40 bg-orange-400/15 px-2.5 py-1 text-2xs font-semibold text-orange-200">
              <Flame size={11} strokeWidth={2} /> {streakMonths}-mo streak
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold">
            <Zap size={11} strokeWidth={2} /> {xp.toLocaleString('en')} pts
          </span>
        </div>

        {/* Promotion bar */}
        <div className="ml-auto w-full sm:w-64">
          <div className="mb-1.5 flex items-baseline justify-between text-2xs">
            <span className="font-bold uppercase tracking-wider text-white/60">
              {nextLevel ? `Next stop · ${nextLevel}` : 'Top tier reached'}
            </span>
            <span className="num font-bold text-white/80">{Math.round(tierPct)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${tierPct}%` }}
              transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300"
            />
          </div>
          <p className="mt-1.5 text-2xs text-white/55">
            {nextLevel ? `${eur(remainingRevenue)} revenue to promote` : 'You are playing in the top league.'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
