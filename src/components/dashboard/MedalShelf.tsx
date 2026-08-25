import { motion } from 'framer-motion'
import { CloudRain, Crown, Flag, Flame, Gem, Lock, Zap } from 'lucide-react'
import type { AchievementKey } from '../../lib/gamification'

export interface ShelfMedal {
  key: AchievementKey
  label: string
  earned: boolean
  /** Progress hint shown under locked medals. */
  hint: string
}

/**
 * Medal shelf — earned medals glow in color; locked ones sit grayed out
 * with a live progress hint so there's always a visible next unlock.
 */
export function MedalShelf({ medals, delay = 0 }: { medals: ShelfMedal[]; delay?: number }) {
  const earnedCount = medals.filter((m) => m.earned).length

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {medals.map((m, i) => (
          <MedalTile key={m.key} medal={m} index={i} delay={delay} />
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-400">
        <span className="num font-bold text-ink">{earnedCount}</span> of {medals.length} medals unlocked — the gray ones tell you exactly how to earn them.
      </p>
    </div>
  )
}

const ICON: Record<AchievementKey, React.ReactNode> = {
  first_deal: <Flag size={18} strokeWidth={1.75} />,
  club_10k: <Gem size={18} strokeWidth={1.75} />,
  deal_machine: <Zap size={18} strokeWidth={1.75} />,
  rainmaker: <CloudRain size={18} strokeWidth={1.75} />,
  crown: <Crown size={18} strokeWidth={1.75} />,
  on_fire: <Flame size={18} strokeWidth={1.75} />,
}

const EARNED_CLS: Record<AchievementKey, string> = {
  first_deal: 'from-sky-400 to-blue-600 shadow-blue-500/30',
  club_10k: 'from-amber-300 to-yellow-500 shadow-amber-500/30',
  deal_machine: 'from-emerald-400 to-green-600 shadow-emerald-500/30',
  rainmaker: 'from-cyan-400 to-sky-600 shadow-cyan-500/30',
  crown: 'from-amber-400 via-yellow-400 to-amber-600 shadow-amber-500/40',
  on_fire: 'from-orange-400 to-red-600 shadow-orange-500/30',
}

function MedalTile({ medal, index, delay }: { medal: ShelfMedal; index: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: delay + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className={`flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-colors ${
        medal.earned ? 'border-line bg-surface' : 'border-dashed border-line bg-ink-50/50 dark:bg-transparent'
      }`}
      title={medal.hint}
    >
      <motion.span
        className={`grid h-10 w-10 place-items-center rounded-full shadow-lg ${
          medal.earned ? `bg-gradient-to-b text-white ${EARNED_CLS[medal.key]}` : 'bg-ink-100 text-ink-300 dark:bg-ink-100 dark:text-ink-400 shadow-none'
        }`}
        animate={medal.earned && medal.key === 'crown' ? { scale: [1, 1.06, 1] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 1 + index * 0.2 }}
      >
        {medal.earned ? ICON[medal.key] : <Lock size={14} strokeWidth={2} />}
      </motion.span>
      <p className={`mt-2 text-2xs font-semibold leading-tight ${medal.earned ? '' : 'text-ink-400'}`}>{medal.label}</p>
      <p className={`mt-0.5 text-[10px] leading-tight ${medal.earned ? 'text-pos' : 'text-ink-300'}`}>
        {medal.earned ? 'Unlocked' : medal.hint}
      </p>
    </motion.div>
  )
}
