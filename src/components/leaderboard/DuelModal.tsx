import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import type { RankedRow } from '../../lib/gamification'
import { ACHIEVEMENT_META } from '../../lib/gamification'
import { eur } from '../../lib/format'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'

/**
 * Head-to-head duel modal — pick any two members and compare every
 * stat side by side. Bars grow outward from the center "VS" spine.
 */
export function DuelModal({
  open,
  onClose,
  rows,
  leftId,
  rightId,
  onSwap,
  scopeLabel,
}: {
  open: boolean
  onClose: () => void
  rows: RankedRow[]
  leftId: string | null
  rightId: string | null
  onSwap: (leftId: string, rightId: string) => void
  scopeLabel: string
}) {
  const left = rows.find((r) => r.profile.id === leftId) ?? null
  const right = rows.find((r) => r.profile.id === rightId) ?? null

  const stats: { key: string; label: string; a: number; b: number; fmt?: (n: number) => string }[] = []
  if (left && right) {
    stats.push(
      { key: 'revenue', label: 'Revenue', a: left.stats.revenue, b: right.stats.revenue, fmt: eur },
      { key: 'deals', label: 'Deals', a: left.stats.deals, b: right.stats.deals },
      { key: 'closed', label: 'Closed', a: left.stats.closed, b: right.stats.closed },
      { key: 'payout', label: 'Payouts', a: left.stats.payout, b: right.stats.payout, fmt: eur },
      { key: 'referral', label: 'Referral earnings', a: left.stats.referralEarnings, b: right.stats.referralEarnings, fmt: eur },
      { key: 'earnings', label: 'Total earnings', a: left.stats.totalEarnings, b: right.stats.totalEarnings, fmt: eur },
      { key: 'xp', label: 'Points', a: left.xp, b: right.xp },
      { key: 'streak', label: 'Month streak', a: left.streakMonths, b: right.streakMonths },
      { key: 'medals', label: 'Medals', a: left.achievements.length, b: right.achievements.length },
    )
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Head-to-Head" desc={`Career vs current standings · ${scopeLabel}`}>
      {!left || !right ? (
        <p className="py-8 text-center text-sm text-ink-400">Not enough members on the board to duel.</p>
      ) : (
        <>
          {/* Fighters */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-4">
            <FighterHead row={left} align="left" />
            <motion.div
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: [1, 1.12, 1], rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.15, times: [0, 0.6, 1] }}
              className="mt-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sm font-black tracking-tight shadow-glass"
            >
              VS
            </motion.div>
            <FighterHead row={right} align="right" />
          </div>

          {/* Fighter switchers */}
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <FighterSelect value={left.profile.id} onChange={(id) => onSwap(id, right.profile.id)} rows={rows} exclude={right.profile.id} />
            <span />
            <FighterSelect value={right.profile.id} onChange={(id) => onSwap(left.profile.id, id)} rows={rows} exclude={left.profile.id} />
          </div>

          {/* Stat bars */}
          <div className="mt-5 space-y-3">
            {stats.map((s, i) => {
              const total = s.a + s.b
              const aW = total > 0 ? (s.a / total) * 100 : 50
              const fmt = s.fmt ?? ((n: number) => n.toLocaleString('en'))
              const aWins = s.a > s.b
              const bWins = s.b > s.a
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className={`num text-sm font-bold ${aWins ? 'text-pos' : ''}`}>{fmt(s.a)}</span>
                    <span className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{s.label}</span>
                    <span className={`num text-sm font-bold ${bWins ? 'text-pos' : ''}`}>{fmt(s.b)}</span>
                  </div>
                  <div className="flex h-1.5 gap-1">
                    <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${aW}%` }}
                        transition={{ duration: 0.7, delay: 0.25 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full rounded-full ${aWins ? 'bg-pos' : 'bg-ink-400 dark:bg-ink-500'}`}
                        style={{ marginLeft: 'auto' }}
                      />
                    </div>
                    <div className="flex flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${100 - aW}%` }}
                        transition={{ duration: 0.7, delay: 0.25 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full rounded-full ${bWins ? 'bg-pos' : 'bg-ink-400 dark:bg-ink-500'}`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Medal shelves */}
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4">
            <MedalShelf row={left} />
            <span />
            <MedalShelf row={right} />
          </div>

          {/* Verdict */}
          <Verdict left={left} right={right} />
        </>
      )}
    </Modal>
  )
}

function FighterHead({ row, align }: { row: RankedRow; align: 'left' | 'right' }) {
  const isChampion = row.rank === 1
  return (
    <motion.div
      initial={{ opacity: 0, x: align === 'left' ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex min-w-0 items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      <div className="relative shrink-0">
        <Avatar name={row.profile.full_name} color={row.profile.avatar_color} url={row.profile.avatar_url} size={48} />
        <span
          className={`num absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[10px] font-black ${
            isChampion ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white' : 'bg-ink text-white dark:bg-[rgb(58,58,58)]'
          }`}
        >
          #{row.rank}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{row.profile.full_name}</p>
        <p className="text-2xs capitalize text-ink-400">{row.tier.level} · {row.profile.role}</p>
        {row.streakMonths >= 2 && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-2xs font-semibold text-warn">
            <Flame size={10} strokeWidth={2.25} /> {row.streakMonths}-mo streak
          </p>
        )}
      </div>
    </motion.div>
  )
}

function FighterSelect({ value, onChange, rows, exclude }: { value: string; onChange: (id: string) => void; rows: RankedRow[]; exclude: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium focus-visible:outline-2"
    >
      {rows.map((r) => (
        <option key={r.profile.id} value={r.profile.id} disabled={r.profile.id === exclude}>
          #{r.rank} {r.profile.full_name}
        </option>
      ))}
    </select>
  )
}

function MedalShelf({ row }: { row: RankedRow }) {
  if (row.achievements.length === 0) {
    return <p className="text-2xs text-ink-300">No medals yet</p>
  }
  return (
    <ul className="space-y-1">
      {row.achievements.map((k) => (
        <li key={k} className="text-2xs text-ink-500 dark:text-ink-400">
          🏅 {ACHIEVEMENT_META[k].label}
        </li>
      ))}
    </ul>
  )
}

function Verdict({ left, right }: { left: RankedRow; right: RankedRow }) {
  const a = left.xp
  const b = right.xp
  if (a === b) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-5 rounded-xl bg-ink-50 py-3 text-center text-xs font-semibold text-ink-500 dark:bg-ink-100 dark:text-ink-400"
      >
        Dead heat — {a.toLocaleString('en')} pts each. Settle it in the field.
      </motion.p>
    )
  }
  const winner = a > b ? left : right
  const diff = Math.abs(a - b)
  return (
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9, duration: 0.35 }}
      className="mt-5 rounded-xl bg-posBg py-3 text-center text-xs font-semibold text-pos ring-1 ring-inset ring-pos/15"
    >
      {winner.profile.full_name} leads the duel by {diff.toLocaleString('en')} pts.
    </motion.p>
  )
}
