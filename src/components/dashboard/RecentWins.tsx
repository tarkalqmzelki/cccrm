import { motion } from 'framer-motion'
import { PartyPopper } from 'lucide-react'
import type { Deal } from '../../lib/types'
import { STATUS_META } from '../../lib/types'
import { dateShort, eur } from '../../lib/format'
import { Badge } from '../ui/Badge'

/**
 * "Recent wins" — the seller's latest approved & closed deals with
 * count-up values and celebratory styling.
 */
export function RecentWins({ deals, delay = 0 }: { deals: Deal[]; delay?: number }) {
  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <PartyPopper size={22} strokeWidth={1.5} className="text-ink-300" />
        <p className="text-sm text-ink-400">No wins yet — your first approved deal lands here.</p>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {deals.map((d, i) => {
        const m = STATUS_META[d.status]
        return (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: delay + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-posBg/50 dark:hover:bg-posBg/20"
          >
            {/* Trophy dot */}
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${m.tone === 'pos' ? 'bg-posBg text-pos' : 'bg-infoBg text-info'}`}>
              🏆
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.company || 'Untitled deal'}</p>
              <p className="text-2xs text-ink-400">{dateShort(d.created_at)}</p>
            </div>
            <Badge tone={m.tone} dot>{m.label}</Badge>
            <p className="num w-24 shrink-0 text-right text-sm font-bold tabular-nums">{eur(d.gross_value)}</p>
          </motion.div>
        )
      })}
    </div>
  )
}
