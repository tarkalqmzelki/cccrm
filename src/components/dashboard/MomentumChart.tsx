import { motion } from 'framer-motion'
import { useState } from 'react'
import { eur } from '../../lib/format'

/**
 * "Your Momentum" — the seller's daily closed revenue over the last 14
 * days as hand-animated bars (gradient fills, staggered grow-in, hover
 * value bubbles). Pure framer-motion for full control of the feel.
 */
export function MomentumChart({ series, delay = 0 }: { series: { label: string; value: number }[]; delay?: number }) {
  const max = Math.max(...series.map((s) => s.value), 1)
  const total = series.reduce((s, d) => s + d.value, 0)

  return (
    <div>
      <div className="flex h-40 items-end gap-[3px] sm:gap-1.5">
        {series.map((d, i) => (
          <Bar key={d.label + i} day={d} pct={(d.value / max) * 100} isToday={i === series.length - 1} index={i} delay={delay} />
        ))}
      </div>

      {/* X labels — sparse to stay clean */}
      <div className="mt-2 flex justify-between text-2xs text-ink-300">
        <span>{series[0]?.label}</span>
        <span>{series[Math.floor(series.length / 2)]?.label}</span>
        <span className="font-semibold text-ink-400">Today</span>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-400">
        <span className="num font-bold text-ink">{eur(total)}</span> booked in the last 14 days
      </p>
    </div>
  )
}

function Bar({
  day,
  pct,
  isToday,
  index,
  delay,
}: {
  day: { label: string; value: number }
  pct: number
  isToday: boolean
  index: number
  delay: number
}) {
  const [hover, setHover] = useState(false)
  const h = Math.max(pct, day.value > 0 ? 4 : 2) // visible stub even for zero days

  return (
    <div
      className="group relative flex h-full flex-1 items-end"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Hover bubble */}
      {hover && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-1 text-2xs font-semibold shadow-glass num"
        >
          {eur(day.value)}
          <span className="ml-1 font-normal text-ink-400">{day.label}</span>
        </motion.div>
      )}

      <motion.div
        initial={{ height: 0 }}
        animate={{ height: `${h}%` }}
        transition={{ duration: 0.7, delay: delay + index * 0.045, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full rounded-t-md transition-all duration-150 ${
          isToday
            ? 'bg-gradient-to-t from-amber-500/80 to-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.35)] group-hover:brightness-110'
            : day.value > 0
              ? 'bg-gradient-to-t from-ink-400/70 to-ink-200 dark:from-ink-600 dark:to-ink-700 group-hover:brightness-125'
              : 'bg-ink-100 dark:bg-ink-100 group-hover:bg-ink-200 dark:!bg-ink-200'
        }`}
        style={{ minHeight: 3 }}
      />
    </div>
  )
}
