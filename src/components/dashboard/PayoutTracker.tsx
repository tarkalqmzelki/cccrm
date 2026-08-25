import { motion } from 'framer-motion'
import { HandCoins, Wallet } from 'lucide-react'
import { eur } from '../../lib/format'
import { MotionBorder } from '../ui/MotionBorder'

/**
 * "Revenue to next payout" — paid vs pending commission money with an
 * animated progress bar and a moving shimmer stripe so the pending
 * portion feels alive and on its way.
 */
export function PayoutTracker({
  paid,
  pending,
  delay = 0,
}: {
  paid: number
  pending: number
  delay?: number
}) {
  const total = paid + pending
  const pct = total > 0 ? (paid / total) * 100 : 0

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <MotionBorder colors={['#22c55e', '#86efac', '#22c55e']} speed={5}>
          <div className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-pos">
              <Wallet size={11} strokeWidth={2} /> Collected
            </p>
            <p className="num mt-1 text-lg font-extrabold text-pos">{eur(paid)}</p>
          </div>
        </MotionBorder>
        <MotionBorder colors={['#f59e0b', '#fde68a', '#f59e0b']} speed={5}>
          <div className="px-3 py-2.5">
            <p className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-warn">
              <HandCoins size={11} strokeWidth={2} /> On its way
            </p>
            <p className="num mt-1 text-lg font-extrabold text-warn">{eur(pending)}</p>
          </div>
        </MotionBorder>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-2xs">
          <span className="font-semibold uppercase tracking-wider text-ink-400">Collection progress</span>
          <span className="num font-bold text-ink-500 dark:text-ink-300">{Math.round(pct)}%</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.2, delay: delay + 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-pos/80 via-pos to-emerald-400"
          />
          {/* Shimmer stripe over the collected zone */}
          {paid > 0 && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/20"
              style={{ x: '-80px' }}
              animate={{ x: ['-80px', '480px'] }}
              transition={{ duration: 1.8, delay: delay + 1.2, repeatDelay: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
          {pending > 0 ? (
            <>
              <span className="num font-bold text-warn">{eur(pending)}</span> in commissions is waiting for admin approval & payout — keep the pipeline warm.
            </>
          ) : total > 0 ? (
            <>Everything you've earned has been collected. Time to close the next one.</>
          ) : (
            <>No payouts yet — your first closed deal starts the engine.</>
          )}
        </p>
      </div>
    </div>
  )
}
