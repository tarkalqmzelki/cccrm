import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar as CalIcon, Link2, TrendingUp, Users, Activity as ActivityIcon, Clock } from 'lucide-react'
import { Card, CardHeader } from './ui/Card'
import { Avatar } from './ui/Avatar'
import { Skeleton } from './ui/Skeleton'
import { LeadScoreGauge } from './ui/LeadScoreGauge'
import { MotionBorder } from './ui/MotionBorder'
import { GAUGE_CORAL, GAUGE_GREEN, GAUGE_SLATE, GAUGE_TEAL } from './ui/gaugeColors'
import { computeMemberStats } from '../lib/hooks/useActivityStats'
import type { ScheduledActivity, Company, Deal, Profile } from '../lib/types'
import type { ActivityStats } from '../lib/hooks/useActivityStats'

export function ActivitiesStatsPanel({
  loading,
  isAdmin,
  activities,
  companies,
  deals,
  profiles,
  selfStats,
  selfProfile,
}: {
  loading: boolean
  isAdmin: boolean
  activities: ScheduledActivity[]
  companies: Company[]
  deals: Deal[]
  profiles: Profile[]
  selfStats: ActivityStats
  selfProfile: Profile | null
}) {
  const memberStats = useMemo(
    () => (isAdmin && profiles.length > 0 ? computeMemberStats(activities, companies, deals, profiles) : []),
    [isAdmin, profiles, activities, companies, deals],
  )

  /* Apple-style success rings */
  const linkedPct = selfStats.total > 0 ? (selfStats.linkedToLead / selfStats.total) * 100 : 0
  const monthPct = selfStats.total > 0 ? Math.min((selfStats.thisMonth / selfStats.total) * 100 * 3, 100) : 0

  const maxMemberTotal = Math.max(...memberStats.map((m) => m.total), 1)

  return (
    <div className="space-y-5">
      {/* Scope summary */}
      <Card>
        <CardHeader
          title={isAdmin ? 'Platform activities' : 'Your activities'}
          desc={isAdmin ? 'Aggregated across every member' : 'Only meetings you own'}
        />

        {/* Apple-style radial gauge — centered, stats stacked below */}
        <div className="mb-4 flex w-full flex-col items-center gap-3 rounded-xl bg-[#F7F9FC] px-2 py-4 dark:bg-[rgb(28,28,28)]">
          {loading ? (
            <Skeleton className="h-[150px] w-[150px] rounded-full" />
          ) : (
            <LeadScoreGauge score={selfStats.successRate} label="Lead Score" size={150} barWidth={3} barLength={15} />
          )}
          <div className="w-full max-w-[220px] space-y-1.5">
            <RingLegend color={GAUGE_GREEN} label="Success rate" value={loading ? '—' : `${selfStats.successRate}%`} />
            <RingLegend color={GAUGE_TEAL} label="Linked to leads" value={loading ? '—' : `${Math.round(linkedPct)}%`} />
            <RingLegend color={GAUGE_CORAL} label="Month intensity" value={loading ? '—' : `${Math.round(monthPct)}%`} />
            <RingLegend color={GAUGE_SLATE} label="Total meetings" value={loading ? '—' : String(selfStats.total)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<CalIcon size={15} strokeWidth={1.75} />} label="Total meetings" value={loading ? undefined : String(selfStats.total)} tone="#3b82f6" delay={0} />
          <Stat icon={<Clock size={15} strokeWidth={1.75} />} label="This month" value={loading ? undefined : String(selfStats.thisMonth)} tone="#f59e0b" delay={0.05} />
          <Stat icon={<Link2 size={15} strokeWidth={1.75} />} label="Linked to lead" value={loading ? undefined : String(selfStats.linkedToLead)} tone="#8b5cf6" delay={0.1} />
          <Stat icon={<TrendingUp size={15} strokeWidth={1.75} />} label="Successful" value={loading ? undefined : String(selfStats.successful)} tone="#22c55e" delay={0.15} />
        </div>
      </Card>

      {/* Per-member breakdown for admins */}
      {isAdmin && (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-1.5"><Users size={15} strokeWidth={1.75} /> Members</span>}
            desc="Per-member meeting productivity"
          />
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : memberStats.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <ActivityIcon size={20} strokeWidth={1.75} className="text-ink-300" />
              <p className="text-sm text-ink-400">No members yet.</p>
            </div>
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 -mr-1">
              {memberStats
                .filter((m) => m.profile.role !== 'admin' || m.total > 0)
                .sort((a, b) => b.total - a.total)
                .map((m, i) => {
                  const isMe = m.profile.id === selfProfile?.id
                  return (
                    <motion.div
                      key={m.profile.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                      className={`relative overflow-hidden rounded-xl border p-3 ${
                        isMe ? 'border-info/30 bg-infoBg/40 dark:bg-infoBg/20' : 'border-line'
                      }`}
                    >
                      {/* productivity race bar */}
                      <motion.div
                        aria-hidden
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.total / maxMemberTotal) * 100}%` }}
                        transition={{ duration: 0.9, delay: 0.2 + Math.min(i * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
                        className={`absolute inset-y-0 left-0 ${isMe ? 'bg-info/10' : 'bg-ink-100/70 dark:bg-ink-200/40'}`}
                      />
                      <div className="relative flex items-center gap-2.5">
                        <Avatar name={m.profile.full_name} color={m.profile.avatar_color} url={m.profile.avatar_url} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.profile.full_name}</p>
                          <p className="text-2xs capitalize text-ink-400">{m.profile.role}</p>
                        </div>
                        <div className="text-right">
                          <p className="num text-sm font-semibold">{m.total}</p>
                          <p className="num text-2xs text-pos">{m.successRate}% success</p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function RingLegend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative inline-flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 rounded-full status-ring" style={{ background: color, opacity: 0.35 }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-white/80">{label}</span>
      <span className="num shrink-0 font-bold text-ink-600 dark:text-white">{value}</span>
    </div>
  )
}

function Stat({
  icon, label, value, tone, delay,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  tone: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <MotionBorder colors={[tone, `${tone}55`, tone]} speed={7}>
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-2xs text-ink-400">{label}</p>
            <span style={{ color: tone }}>{icon}</span>
          </div>
          <p className="mt-1 num text-lg font-semibold leading-none" style={{ color: tone }}>
            {value === undefined ? <span className="inline-block h-4 w-10 rounded skeleton align-middle" /> : value}
          </p>
        </div>
      </MotionBorder>
    </motion.div>
  )
}
