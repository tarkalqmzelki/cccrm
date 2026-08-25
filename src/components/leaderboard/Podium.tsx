import { motion } from 'framer-motion'
import { CloudRain, Crown, Flag, Flame, Gem, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import type { AchievementKey, RankedRow, Category } from '../../lib/gamification'
import { eur } from '../../lib/format'
import { Avatar } from '../ui/Avatar'
import { useCountUp } from './useCountUp'

/**
 * Cinematic top-3 podium. Reveal order is 3rd → 2nd → 1st so the
 * champion lands last with the crown drop. Metallic gradients stay
 * tasteful against the monochrome ink system.
 */

interface PodiumProps {
  rows: RankedRow[]
  category: Category
}

const SLOTS: { place: 1 | 2 | 3; delay: number }[] = [
  { place: 2, delay: 0.18 },
  { place: 1, delay: 0.5 },
  { place: 3, delay: 0 },
]

export function Podium({ rows, category }: PodiumProps) {
  const byPlace = new Map<number, RankedRow>()
  rows.slice(0, 3).forEach((r) => byPlace.set(r.rank as 1 | 2 | 3, r))
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {SLOTS.map(({ place, delay }) => {
        const row = byPlace.get(place)
        if (!row) return <div key={place} />
        return <PodiumSlot key={place} row={row} place={place} delay={delay} category={category} />
      })}
    </div>
  )
}

const THEME = {
  1: {
    card: 'border-amber-300/70 bg-gradient-to-b from-amber-50 via-surface to-surface dark:border-amber-400/30 dark:from-amber-400/10 dark:via-[rgb(26,26,26)] dark:to-[rgb(23,23,23)]',
    pedestal: 'bg-gradient-to-b from-amber-400 to-amber-600 text-white dark:from-amber-500 dark:to-amber-700',
    accent: 'text-amber-500 dark:text-amber-400',
    ring: 'ring-2 ring-amber-400/80',
    barFill: 'bg-gradient-to-r from-amber-400 to-amber-500',
  },
  2: {
    card: 'border-ink-200 bg-gradient-to-b from-ink-50 via-surface to-surface dark:border-line dark:from-ink-100 dark:via-[rgb(26,26,26)] dark:to-[rgb(23,23,23)]',
    pedestal: 'bg-gradient-to-b from-ink-300 to-ink-400 text-white dark:from-ink-600 dark:to-ink-700',
    accent: 'text-ink-500 dark:text-ink-300',
    ring: 'ring-1 ring-ink-200 dark:ring-line',
    barFill: 'bg-gradient-to-r from-ink-300 to-ink-400',
  },
  3: {
    card: 'border-orange-200 bg-gradient-to-b from-orange-50 via-surface to-surface dark:border-orange-500/20 dark:from-orange-500/10 dark:via-[rgb(26,26,26)] dark:to-[rgb(23,23,23)]',
    pedestal: 'bg-gradient-to-b from-orange-400 to-orange-600 text-white dark:from-orange-600 dark:to-orange-800',
    accent: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-1 ring-orange-200 dark:ring-orange-500/20',
    barFill: 'bg-gradient-to-r from-orange-300 to-orange-500',
  },
} as const

function PodiumSlot({ row, place, delay, category }: { row: RankedRow; place: 1 | 2 | 3; delay: number; category: Category }) {
  const t = THEME[place]
  const isFirst = place === 1
  const display = useCountUp(row.value, 1.3, delay + 0.25)
  const pctToLeader = row.pctToLeader ?? (place === 1 ? 100 : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 48, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col"
    >
      {/* Card */}
      <div className={`relative flex flex-col items-center overflow-hidden rounded-t-2xl border px-2 pb-3 pt-4 text-center sm:px-3 ${t.card}`}>
        {/* Light rays behind #1 */}
        {isFirst && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 opacity-25 blur-xl"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(245,158,11,0.9) 20deg, transparent 45deg, rgba(245,158,11,0.7) 90deg, transparent 120deg, rgba(245,158,11,0.8) 200deg, transparent 230deg, rgba(245,158,11,0.6) 300deg, transparent 330deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Crown floats above the champion's head */}
        {isFirst && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.6 }}
            animate={{ opacity: 1, y: [-1.5, -7, -1.5], rotate: [-3, 3, -3], scale: 1 }}
            transition={{
              opacity: { duration: 0.35, delay: delay + 0.55 },
              scale: { duration: 0.35, delay: delay + 0.55 },
              y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.9 },
              rotate: { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.9 },
            }}
            className="absolute top-0 left-1/2 z-10 -translate-x-1/2"
          >
            <Crown size={20} strokeWidth={1.75} className="fill-amber-400 text-amber-500 drop-shadow-sm dark:fill-amber-500/80 dark:text-amber-400" />
          </motion.div>
        )}

        {/* Momentum chip */}
        {row.momentum != null && row.momentum !== 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.7 }}
            className={`absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
              row.momentum > 0
                ? 'border-pos/25 bg-posBg text-pos'
                : 'border-neg/25 bg-negBg text-neg'
            }`}
          >
            {row.momentum > 0 ? <TrendingUp size={10} strokeWidth={2.25} /> : <TrendingDown size={10} strokeWidth={2.25} />}
            {Math.abs(row.momentum)}
          </motion.span>
        )}
        {row.streakMonths >= 2 && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full border border-warn/25 bg-warnBg px-1.5 py-0.5 text-[10px] font-bold text-warn">
            <Flame size={10} strokeWidth={2.25} />
            {row.streakMonths}
          </span>
        )}

        <div className="relative mt-3">
          <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={isFirst ? 52 : 40} />
          <span className={`absolute inset-0 rounded-full ${t.ring}`} />
        </div>

        <p className="mt-2 w-full truncate text-xs font-semibold sm:text-sm">{row.profile.full_name}</p>
        <p className="text-2xs capitalize text-ink-400">
          {row.tier.level} · {row.profile.role}
        </p>

        <p className={`num mt-2 text-base font-extrabold tabular-nums sm:text-lg ${isFirst ? 'text-amber-600 dark:text-amber-400' : ''}`}>
          {category === 'deals' ? Math.round(display).toLocaleString('en') : eur(display)}
        </p>

        {/* Race bar toward the leader */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
          <motion.div
            className={`h-full rounded-full ${t.barFill}`}
            initial={{ width: 0 }}
            animate={{ width: `${pctToLeader}%` }}
            transition={{ duration: 1.1, delay: delay + 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Tier promotion progress */}
        <TierMini label={row.tier.nextLevel ? `→ ${row.tier.nextLevel}` : 'MAX'} pct={row.tier.pct} />

        <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-1">
          <MedalDots achievements={row.achievements} />
        </div>
      </div>

      {/* Pedestal */}
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.4, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{ originY: 1, height: place === 1 ? 44 : place === 2 ? 32 : 24 }}
        className={`flex items-start justify-center rounded-b-xl pt-1 text-sm font-black tracking-widest num ${t.pedestal}`}
      >
        {place}
      </motion.div>
    </motion.div>
  )
}

function TierMini({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mt-1.5 flex w-full items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-300">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
        <motion.div
          className="h-full rounded-full bg-ink-400 dark:bg-ink-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function MedalDots({ achievements }: { achievements: RankedRow['achievements'] }) {
  if (achievements.length === 0) return null
  return (
    <div className="flex items-center gap-0.5" title={achievements.join(', ')}>
      {achievements.map((k) => (
        <MedalDot key={k} k={k} />
      ))}
    </div>
  )
}

const DOT_CLS: Record<AchievementKey, string> = {
  first_deal: 'bg-info',
  club_10k: 'bg-warn',
  deal_machine: 'bg-pos',
  rainmaker: 'bg-info',
  crown: 'bg-amber-400',
  on_fire: 'bg-neg',
}
const DOT_ICON: Record<AchievementKey, React.ReactNode> = {
  first_deal: <Flag size={8} strokeWidth={2.5} className="text-white" />,
  club_10k: <Gem size={8} strokeWidth={2.5} className="text-white" />,
  deal_machine: <Zap size={8} strokeWidth={2.5} className="text-white" />,
  rainmaker: <CloudRain size={8} strokeWidth={2.5} className="text-white" />,
  crown: <Crown size={8} strokeWidth={2.5} className="text-white" />,
  on_fire: <Flame size={8} strokeWidth={2.5} className="text-white" />,
}
function MedalDot({ k }: { k: AchievementKey }) {
  return (
    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${DOT_CLS[k]}`} title={k.replace(/_/g, ' ')}>
      {DOT_ICON[k]}
    </span>
  )
}
