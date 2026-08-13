import { useMemo } from 'react'
import { Calendar as CalIcon, Link2, TrendingUp, Users, Activity as ActivityIcon, Clock } from 'lucide-react'
import { Card, CardHeader } from './ui/Card'
import { Avatar } from './ui/Avatar'
import { Skeleton } from './ui/Skeleton'
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

  return (
    <div className="space-y-5">
      {/* Scope summary */}
      <Card>
        <CardHeader
          title={isAdmin ? 'Platform activities' : 'Your activities'}
          desc={isAdmin ? 'Aggregated across every member' : 'Only meetings you own'}
        />
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<CalIcon size={15} strokeWidth={1.75} />} label="Total meetings" value={loading ? undefined : String(selfStats.total)} tone="info" />
          <Stat icon={<Clock size={15} strokeWidth={1.75} />} label="This month" value={loading ? undefined : String(selfStats.thisMonth)} tone="info" />
          <Stat icon={<Link2 size={15} strokeWidth={1.75} />} label="Linked to lead" value={loading ? undefined : String(selfStats.linkedToLead)} tone="neutral" />
          <Stat icon={<TrendingUp size={15} strokeWidth={1.75} />} label="Success rate" value={loading ? undefined : `${selfStats.successRate}%`} tone="pos" />
        </div>
        <div className="mt-3 rounded-lg bg-ink-50/60 px-3 py-2 text-2xs text-ink-500">
          <span className="font-semibold">{selfStats.successful}</span> meeting{selfStats.successful === 1 ? '' : 's'} linked to a lead whose deal is approved/closed.
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
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 -mr-1">
              {memberStats
                .filter((m) => m.profile.role !== 'admin' || m.total > 0)
                .sort((a, b) => b.total - a.total)
                .map((m) => (
                  <div
                    key={m.profile.id}
                    className={`rounded-xl border p-3 ${m.profile.id === selfProfile?.id ? 'border-info/30 bg-infoBg/40' : 'border-line'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.profile.full_name} color={m.profile.avatar_color} url={m.profile.avatar_url} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.profile.full_name}</p>
                        <p className="text-2xs text-ink-400 capitalize">{m.profile.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-semibold">{m.total}</p>
                        <p className="text-2xs text-ink-400">{m.successRate}% success</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-2xs text-ink-500">
                      <span>Linked: <span className="num font-medium text-ink">{m.linkedToLead}</span></span>
                      <span>Won: <span className="num font-medium text-pos">{m.successful}</span></span>
                      <span>This month: <span className="num font-medium text-ink">{m.thisMonth}</span></span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Stat({
  icon, label, value, tone,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  tone: 'pos' | 'neg' | 'warn' | 'info' | 'neutral'
}) {
  const toneClass = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-ink'
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-2xs text-ink-400">{label}</p>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className={`mt-1 num text-lg font-semibold leading-none ${toneClass}`}>
        {value === undefined ? <span className="inline-block h-4 w-10 rounded skeleton align-middle" /> : value}
      </p>
    </div>
  )
}