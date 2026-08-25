import { motion } from 'framer-motion'
import { CalendarClock, CloudRain, Gem, ShieldCheck } from 'lucide-react'
import type { RecordEntry } from '../../lib/gamification'
import { Avatar } from '../ui/Avatar'

/**
 * All-time Hall of Records — the "legend board" that sits above the
 * live race. Records are career-based and independent of filters.
 */
export function HallOfRecords({ records }: { records: RecordEntry[] }) {
  if (records.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {records.map((r, i) => (
        <RecordCard key={r.key} record={r} index={i} />
      ))}
    </div>
  )
}

const ICONS: Record<RecordEntry['key'], React.ReactNode> = {
  biggest_deal: <Gem size={15} strokeWidth={1.75} />,
  best_month: <CalendarClock size={15} strokeWidth={1.75} />,
  top_referrer: <CloudRain size={15} strokeWidth={1.75} />,
  iron_streak: <ShieldCheck size={15} strokeWidth={1.75} />,
}

function RecordCard({ record, index }: { record: RecordEntry; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.9 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-xl border border-line bg-surface p-4"
    >
      {/* periodic shine sweep */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-ink-100/70 to-transparent dark:via-white/[0.04]"
        initial={{ x: '-150%' }}
        animate={{ x: ['-150%', '350%'] }}
        transition={{ duration: 2.4, delay: 1.6 + index * 0.5, repeatDelay: 7, repeat: Infinity, ease: 'easeInOut' }}
        style={{ x: '-150%' }}
      />
      <div className="flex items-center gap-2 text-ink-400">
        {ICONS[record.key]}
        <p className="text-2xs font-bold uppercase tracking-wider">{record.label}</p>
      </div>
      <p className="num mt-2 text-lg font-extrabold leading-tight">{record.valueLabel}</p>
      <div className="mt-2 flex items-center gap-2">
        {record.holderId && (
          <>
            <Avatar name={record.holderName} size={20} />
            <span className="truncate text-xs font-medium text-ink-500 dark:text-ink-400">{record.holderName}</span>
          </>
        )}
      </div>
    </motion.div>
  )
}
