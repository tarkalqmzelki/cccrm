import { useMemo } from 'react'
import type { ScheduledActivity, Company, Deal, Profile } from '../types'

export interface ActivityStats {
  total: number
  thisMonth: number
  linkedToLead: number
  successful: number
  successRate: number // percentage 0–100 (linked → success)
}

/**
 * Build a lookup of company IDs that have at least one deal whose status is
 * approved or closed. We match deals to companies by name text (the deals
 * table stores `company` as text) plus optionally through opportunity_id.
 */
export function buildCompanySuccessSet(companies: Company[], deals: Deal[]): Set<string> {
  const successStatuses = new Set(['approved', 'closed'])
  const byName = new Map<string, string>()
  for (const c of companies) byName.set((c.name || '').toLowerCase().trim(), c.id)

  const out = new Set<string>()
  for (const d of deals) {
    if (!successStatuses.has(d.status)) continue
    const cid = d.company ? byName.get((d.company || '').toLowerCase().trim()) : undefined
    if (cid) out.add(cid)
  }
  return out
}

/** Pure stats calculator (used by both the hook below and the per-member split). */
export function calcStats(
  activities: ScheduledActivity[],
  companyHasSuccess: Set<string>,
): ActivityStats {
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  let total = 0
  let month = 0
  let linked = 0
  let successful = 0
  for (const a of activities) {
    total++
    const sd = new Date(a.scheduled_at)
    if (sd.getMonth() === thisMonth && sd.getFullYear() === thisYear) month++
    if (a.company_id) {
      linked++
      if (companyHasSuccess.has(a.company_id)) successful++
    }
  }
  const rate = linked > 0 ? Math.round((successful / linked) * 1000) / 10 : 0
  return { total, thisMonth: month, linkedToLead: linked, successful, successRate: rate }
}

/**
 * Activity stats for a single scope of activities (e.g., the current user's
 * activities for sellers, all activities for admins).
 */
export function useActivityStats(
  activities: ScheduledActivity[],
  companies: Company[],
  deals: Deal[],
): ActivityStats {
  return useMemo(() => {
    const successSet = buildCompanySuccessSet(companies, deals)
    return calcStats(activities, successSet)
  }, [activities, companies, deals])
}

/**
 * Per-member breakdown — same metrics, but partitioned by owner_id.
 * Returns one entry per profile (even if 0 activities).
 */
export function computeMemberStats(
  activities: ScheduledActivity[],
  companies: Company[],
  deals: Deal[],
  profiles: Profile[],
): Array<{ profile: Profile } & ActivityStats> {
  const successSet = buildCompanySuccessSet(companies, deals)
  const byOwner = new Map<string, ScheduledActivity[]>()
  for (const a of activities) {
    if (!byOwner.has(a.owner_id)) byOwner.set(a.owner_id, [])
    byOwner.get(a.owner_id)!.push(a)
  }
  return profiles.map((profile) => ({
    profile,
    ...calcStats(byOwner.get(profile.id) || [], successSet),
  }))
}