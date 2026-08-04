import type { Deal, Profile, Lead, Payout, Referral, Settings, Level } from './types'
import { DEFAULT_SETTINGS } from './types'

/* ------------------------------------------------------------------ */
/* LEVEL & COMMISSION                                                  */
/* ------------------------------------------------------------------ */

export function effectiveLevel(profile: Profile, revenue: number, settings: Settings): Level {
  if (revenue >= settings.l3_threshold) return 'L3'
  if (revenue >= settings.l2_threshold) return 'L2'
  return 'L1'
}

export function commissionFor(
  profile: Profile,
  revenue: number,
  settings: Settings,
  deal?: Deal,
): number {
  // deal-level custom override
  if (deal?.custom_commission_pct != null) return deal.custom_commission_pct
  // seller-level custom override
  if (profile.custom_commission_pct != null) return profile.custom_commission_pct
  // level-based
  const level = effectiveLevel(profile, revenue, settings)
  switch (level) {
    case 'L3': return settings.l3_commission_pct
    case 'L2': return settings.l2_commission_pct
    default: return settings.l1_commission_pct
  }
}

/* ------------------------------------------------------------------ */
/* REVENUE                                                             */
/* ------------------------------------------------------------------ */

export function revenueOf(deals: Deal[], sellerId: string): number {
  return deals
    .filter((d) => d.seller_id === sellerId && (d.status === 'closed' || d.status === 'approved'))
    .reduce((sum, d) => sum + d.gross_value, 0)
}

export function grossVolume(deals: Deal[]): number {
  return deals.filter((d) => d.status === 'closed' || d.status === 'approved')
    .reduce((s, d) => s + d.gross_value, 0)
}

/* ------------------------------------------------------------------ */
/* REFERRAL EARNINGS  — ONE-LEG RULE                                   */
/*                                                                    */
/* A referrer earns a commission on deals closed by their DIRECT      */
/* (first-level) referees only. The commission rate is the referrer's */
/* OWN effective commission rate (based on the referrer's level),     */
/* applied to the GROSS VALUE of the deal (not the referee's payout). */
/*                                                                    */
/* One-leg rule: if A refers B, and B refers C:                       */
/*   - C closes a deal → C earns C's commission                       */
/*   - B earns B's commission on C's deal (B is C's direct referrer)  */
/*   - A earns NOTHING (C is not A's direct referral — one leg only)  */
/* ------------------------------------------------------------------ */

export function referralEarnings(
  sellerId: string,
  referrals: Referral[],
  deals: Deal[],
  profiles: Profile[],
  settings: Settings,
): number {
  const directReferees = referrals
    .filter((r) => r.referrer_id === sellerId)
    .map((r) => r.referee_id)
  if (directReferees.length === 0) return 0

  const referrerProfile = profiles.find((p) => p.id === sellerId)
  if (!referrerProfile) return 0
  const referrerRevenue = revenueOf(deals, sellerId)
  const referrerLevel = effectiveLevel(referrerProfile, referrerRevenue, settings)

  // Referral commission rate is SEPARATE from sales commission, per level
  const referralPct = referrerLevel === 'L3' ? settings.l3_referral_pct
    : referrerLevel === 'L2' ? settings.l2_referral_pct
    : settings.l1_referral_pct

  let total = 0
  for (const refereeId of directReferees) {
    const refereeDeals = deals.filter(
      (d) => d.seller_id === refereeId && (d.status === 'closed' || d.status === 'approved'),
    )
    const refereeGross = refereeDeals.reduce((s, d) => s + d.gross_value, 0)
    total += refereeGross * (referralPct / 100)
  }
  return Math.round(total)
}

/* ------------------------------------------------------------------ */
/* LEADERBOARD                                                         */
/* ------------------------------------------------------------------ */

export interface LeaderRow {
  profile: Profile
  level: Level
  revenue: number
  deals: number
  closed: number
  payout: number
  referralEarnings: number
  totalEarnings: number
}

export function leaderboard(
  deals: Deal[],
  profiles: Profile[],
  payouts: Payout[],
  referrals: Referral[],
  settings: Settings = DEFAULT_SETTINGS,
): LeaderRow[] {
  const rows: Record<string, LeaderRow> = {}
  for (const p of profiles) {
    if (p.role === 'admin') continue
    const rev = revenueOf(deals, p.id)
    const level = effectiveLevel(p, rev, settings)
    const sellerPayouts = payouts.filter((x) => x.seller_id === p.id)
    const payout = sellerPayouts.reduce((s, x) => s + x.amount, 0)
    const refEarn = referralEarnings(p.id, referrals, deals, profiles, settings)
    rows[p.id] = {
      profile: p,
      level,
      revenue: rev,
      deals: 0,
      closed: 0,
      payout,
      referralEarnings: refEarn,
      totalEarnings: payout + refEarn,
    }
  }
  for (const d of deals) {
    const r = rows[d.seller_id]
    if (!r) continue
    r.deals += 1
    if (d.status === 'closed') r.closed += 1
  }
  return Object.values(rows)
}

/* ------------------------------------------------------------------ */
/* PERIOD STATS                                                        */
/* ------------------------------------------------------------------ */

export interface PeriodStats {
  revenue: number
  prevRevenue: number
  leads: number
  prevLeads: number
  members: number
  prevMembers: number
  dealsSubmitted: number
  prevDeals: number
}

const DAY = 86400000

export function periodStats(deals: Deal[], leads: Lead[], profiles: Profile[], days = 30): PeriodStats {
  const cutoff = Date.now() - days * DAY
  const prevCutoff = cutoff - days * DAY
  const inPeriod = (iso: string, from: number, to: number) => {
    const t = new Date(iso).getTime()
    return t >= from && t < to
  }
  const revenueDeals = deals.filter((d) => d.status === 'closed' || d.status === 'approved')
  const revenue = revenueDeals.filter((d) => new Date(d.created_at).getTime() >= cutoff).reduce((s, d) => s + d.gross_value, 0)
  const prevRevenue = revenueDeals.filter((d) => inPeriod(d.created_at, prevCutoff, cutoff)).reduce((s, d) => s + d.gross_value, 0)
  const leadsCount = leads.filter((l) => new Date(l.created_at).getTime() >= cutoff).length
  const prevLeads = leads.filter((l) => inPeriod(l.created_at, prevCutoff, cutoff)).length
  const nonAdmin = profiles.filter((p) => p.role !== 'admin')
  const members = nonAdmin.filter((p) => new Date(p.created_at).getTime() >= cutoff).length
  const prevMembers = nonAdmin.filter((p) => inPeriod(p.created_at, prevCutoff, cutoff)).length
  const dealsSubmitted = deals.filter((d) => new Date(d.created_at).getTime() >= cutoff).length
  const prevDeals = deals.filter((d) => inPeriod(d.created_at, prevCutoff, cutoff)).length
  return { revenue, prevRevenue, leads: leadsCount, prevLeads, members, prevMembers, dealsSubmitted, prevDeals }
}

export function revenueSeries(deals: Deal[], buckets = 14): { label: string; value: number }[] {
  const revenueDeals = deals.filter((d) => d.status === 'closed' || d.status === 'approved')
  const out: { label: string; value: number }[] = []
  const now = Date.now()
  for (let i = buckets - 1; i >= 0; i--) {
    const start = now - (i + 1) * DAY
    const end = now - i * DAY
    const value = revenueDeals
      .filter((d) => {
        const t = new Date(d.created_at).getTime()
        return t >= start && t < end
      })
      .reduce((s, d) => s + d.gross_value, 0)
    out.push({ label: new Date(end).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value })
  }
  return out
}
