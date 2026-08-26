import type { Deal, Level, Payout, Profile, Referral, Settings, RuleFlow, FlowNode } from './types'
import { FLOW_METRIC_LABEL } from './types'
import { effectiveLevel } from './metrics'

/* =====================================================================
 * GAMIFICATION ENGINE — pure functions over existing CRM data.
 * Everything here is computed client-side from deals / payouts /
 * referrals / profiles so no schema changes are needed.
 * ==================================================================== */

export type Period = 'all' | 'monthly' | 'weekly'
export type Category = 'revenue' | 'deals' | 'earnings'

/* ------------------------------------------------------------------ */
/* RULE-FLOW EVALUATION (visual challenge builder)                     */
/* ------------------------------------------------------------------ */

export interface FlowGoalInfo {
  label: string
  cur: number
  need: number
  ok: boolean
}

export interface FlowEval {
  completed: boolean
  /** 0–100 average satisfaction across all goal/condition nodes */
  pct: number
  goals: FlowGoalInfo[]
  reward: { points: number; bonus: number }
}

/** Evaluate an authored rule graph against live platform counters. */
export function evaluateRuleFlow(
  flow: RuleFlow,
  counts: Record<string, number>,
): FlowEval {
  const byId = new Map<string, FlowNode>(flow.nodes.map((n) => [n.id, n]))
  const ordered = flow.order.map((id) => byId.get(id)).filter(Boolean) as FlowNode[]
  const goals: FlowGoalInfo[] = []
  let reward = { points: 0, bonus: 0 }

  for (const n of ordered) {
    if ((n.kind === 'goal' || n.kind === 'condition') && n.metric) {
      const cur = counts[n.metric] ?? 0
      const need = Math.max(n.kind === 'goal' ? n.count ?? 1 : n.min ?? 1, 1)
      const label = n.kind === 'condition'
        ? `incl. ${FLOW_METRIC_LABEL[n.metric].toLowerCase()}`
        : FLOW_METRIC_LABEL[n.metric]
      goals.push({ label, cur, need, ok: cur >= need })
    }
    if (n.kind === 'reward') {
      reward = { points: n.points ?? 0, bonus: n.bonus ?? 0 }
    }
  }

  const pct = goals.length > 0
    ? (goals.reduce((s, g) => s + Math.min(g.cur / g.need, 1), 0) / goals.length) * 100
    : 0
  return { completed: goals.length > 0 && goals.every((g) => g.ok), pct, goals, reward }
}

const DAY = 86400000

/* ------------------------------------------------------------------ */
/* PERIOD WINDOWS                                                      */
/* ------------------------------------------------------------------ */

export interface Window {
  start: number
  end: number
}

export function periodWindow(period: Period, now = Date.now()): Window {
  if (period === 'weekly') return { start: now - 7 * DAY, end: now }
  if (period === 'monthly') return { start: now - 30 * DAY, end: now }
  return { start: -Infinity, end: now }
}

/** Same duration, shifted one period back — used for momentum. */
export function previousWindow(period: Period, now = Date.now()): Window {
  const cur = periodWindow(period, now)
  if (period === 'all') return { start: -Infinity, end: -Infinity }
  const span = cur.end - cur.start
  return { start: cur.start - span, end: cur.start }
}

/* ------------------------------------------------------------------ */
/* PER-Seller STATS INSIDE A WINDOW                                    */
/* ------------------------------------------------------------------ */

export interface SellerStats {
  revenue: number
  deals: number
  closed: number
  payout: number
  referralEarnings: number
  totalEarnings: number
}

const countsForBoard = (d: Deal) => d.status === 'closed' || d.status === 'approved'

export function statsInWindow(
  sellerId: string,
  win: Window,
  deals: Deal[],
  payouts: Payout[],
  referrals: Referral[],
  profiles: Profile[],
  settings: Settings,
): SellerStats {
  const inWin = (iso: string) => {
    if (win.start === -Infinity && win.end === Infinity) return true
    const t = new Date(iso).getTime()
    return t >= win.start && t < win.end
  }

  const myDeals = deals.filter((d) => d.seller_id === sellerId && countsForBoard(d) && inWin(d.created_at))
  const revenue = myDeals.reduce((s, d) => s + d.gross_value, 0)

  const myPayouts = payouts.filter((p) => p.seller_id === sellerId && inWin(p.created_at))
  const payout = myPayouts.reduce((s, p) => s + p.amount, 0)

  // One-leg referral rule, windowed: referrer's own level pct applied to
  // DIRECT referees' gross value closed inside the window.
  let referralEarnings = 0
  const me = profiles.find((p) => p.id === sellerId)
  if (me) {
    const pctByLevel: Record<Level, number> = {
      L1: settings.l1_referral_pct,
      L2: settings.l2_referral_pct,
      L3: settings.l3_referral_pct,
    }
    const level = effectiveLevel(me, revenue, settings)
    const pct = pctByLevel[level]
    const refereeIds = new Set(referrals.filter((r) => r.referrer_id === sellerId).map((r) => r.referee_id))
    for (const d of deals) {
      if (refereeIds.has(d.seller_id) && countsForBoard(d) && inWin(d.created_at)) {
        referralEarnings += d.gross_value * (pct / 100)
      }
    }
    referralEarnings = Math.round(referralEarnings)
  }

  return {
    revenue,
    deals: myDeals.length,
    closed: myDeals.filter((d) => d.status === 'closed').length,
    payout,
    referralEarnings,
    totalEarnings: payout + referralEarnings,
  }
}

/* ------------------------------------------------------------------ */
/* XP POINTS                                                           */
/* ------------------------------------------------------------------ */

/** Corporate-legible scoring: €10 booked = 1 pt, a deal = 50 pts,
 *  €10 of referral income = 1 pt. Deterministic and easy to explain. */
export function xpOf(s: SellerStats): number {
  return Math.round(s.revenue / 10) + s.deals * 50 + Math.round(s.referralEarnings / 10)
}

/* ------------------------------------------------------------------ */
/* TIER PROGRESS (L1 → L2 → L3 via real revenue thresholds)            */
/* ------------------------------------------------------------------ */

export interface TierProgress {
  level: Level
  nextLevel: Level | null
  /** 0–100 progress toward the next tier. */
  pct: number
  /** Revenue still needed for the promotion. */
  remaining: number
  targetRevenue: number
}

export function tierProgress(revenue: number, settings: Settings): TierProgress {
  const l2 = settings.l2_threshold
  const l3 = settings.l3_threshold
  if (revenue >= l3) {
    return { level: 'L3', nextLevel: null, pct: 100, remaining: 0, targetRevenue: l3 }
  }
  if (revenue >= l2) {
    const span = Math.max(l3 - l2, 1)
    return { level: 'L2', nextLevel: 'L3', pct: clamp(((revenue - l2) / span) * 100), remaining: l3 - revenue, targetRevenue: l3 }
  }
  const floor = Math.min(settings.l1_threshold, l2 - 1)
  const span = Math.max(l2 - floor, 1)
  return { level: 'L1', nextLevel: 'L2', pct: clamp(((revenue - floor) / span) * 100), remaining: l2 - revenue, targetRevenue: l2 }
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n))
}

/* ------------------------------------------------------------------ */
/* STREAKS — consecutive months with ≥1 counted deal                   */
/* ------------------------------------------------------------------ */

export function activeMonthStreak(dealDates: number[], now = Date.now()): number {
  if (dealDates.length === 0) return 0
  const keys = new Set(dealDates.map((t) => monthKey(t)))
  let streak = 0
  const cursor = new Date(now)
  // Grace: an empty current month doesn't break last month's streak.
  if (!keys.has(monthKey(cursor.getTime()))) cursor.setMonth(cursor.getMonth() - 1)
  for (let i = 0; i < 36; i++) {
    if (keys.has(monthKey(cursor.getTime()))) {
      streak++
      cursor.setMonth(cursor.getMonth() - 1)
    } else break
  }
  return streak
}

function monthKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}`
}

/* ------------------------------------------------------------------ */
/* ACHIEVEMENT MEDALS                                                  */
/* ------------------------------------------------------------------ */

export type AchievementKey =
  | 'first_deal'
  | 'club_10k'
  | 'deal_machine'
  | 'rainmaker'
  | 'crown'
  | 'on_fire'

export const ACHIEVEMENT_META: Record<AchievementKey, { label: string; desc: string }> = {
  first_deal:   { label: 'First Deal',   desc: 'Closed their first deal' },
  club_10k:     { label: '€10K Club',    desc: '€10,000+ lifetime revenue' },
  deal_machine: { label: 'Deal Machine', desc: '10+ deals closed' },
  rainmaker:   { label: 'Rainmaker',    desc: 'Earned referral income' },
  crown:        { label: 'Champion',     desc: 'Holds #1 right now' },
  on_fire:      { label: 'On Fire',      desc: '3+ month active streak' },
}

export interface BoardEntry {
  profile: Profile
  stats: SellerStats
  xp: number
  tier: TierProgress
  streakMonths: number
  achievements: AchievementKey[]
}

/** Build the full board (unranked) for a window. Excludes admins and
 *  members hidden from leaderboards, mirroring metrics.leaderboard(). */
export function buildBoard(
  win: Window,
  deals: Deal[],
  profiles: Profile[],
  payouts: Payout[],
  referrals: Referral[],
  settings: Settings,
  career?: Map<string, { deals: number; revenue: number; referralEarnings: number; streakMonths: number }>,
): BoardEntry[] {
  const out: BoardEntry[] = []
  for (const p of profiles) {
    if (p.role === 'admin') continue
    if (p.show_in_leaderboard === false) continue
    const stats = statsInWindow(p.id, win, deals, payouts, referrals, profiles, settings)
    const c = career?.get(p.id)
    const achievements: AchievementKey[] = []
    if ((c?.deals ?? stats.deals) >= 1) achievements.push('first_deal')
    if ((c?.revenue ?? stats.revenue) >= 10000) achievements.push('club_10k')
    if ((c?.deals ?? stats.deals) >= 10) achievements.push('deal_machine')
    if ((c?.referralEarnings ?? stats.referralEarnings) > 0) achievements.push('rainmaker')
    const streak = c?.streakMonths ?? 0
    if (streak >= 3) achievements.push('on_fire')
    out.push({
      profile: p,
      stats,
      xp: xpOf(stats),
      tier: tierProgress(c?.revenue ?? stats.revenue, settings),
      streakMonths: streak,
      achievements,
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* RANKING + MOMENTUM                                                  */
/* ------------------------------------------------------------------ */

export type RankedRow = BoardEntry & {
  rank: number
  value: number
  /** 0–100 share of the category leader's value — drives race bars. */
  pctToLeader: number
  /** Rank movement vs previous window: >0 climbed, <0 fell, 0 same,
   *  null when there is no comparable previous window (all-time). */
  momentum: number | null
}

export function categoryValue(row: BoardEntry, category: Category): number {
  if (category === 'revenue') return row.stats.revenue
  if (category === 'deals') return row.stats.deals
  return row.stats.totalEarnings
}

export function rankRows(
  board: BoardEntry[],
  category: Category,
  prevBoard?: BoardEntry[],
): RankedRow[] {
  const cmp = (a: BoardEntry, b: BoardEntry) =>
    categoryValue(b, category) - categoryValue(a, category) || b.xp - a.xp ||
    a.profile.full_name.localeCompare(b.profile.full_name)

  const rows: RankedRow[] = [...board].sort(cmp).map((r, i) => ({
    ...r,
    rank: i + 1,
    value: categoryValue(r, category),
    pctToLeader: 0,
    momentum: null,
  }))

  const leader = rows[0]?.value ?? 0
  for (const row of rows) row.pctToLeader = leader > 0 ? Math.max((row.value / leader) * 100, row.value > 0 ? 3 : 0) : 0

  if (prevBoard) {
    const prevRank = new Map<string, number>()
    ;[...prevBoard].sort(cmp).forEach((r, i) => prevRank.set(r.profile.id, i + 1))
    for (const row of rows) {
      const pr = prevRank.get(row.profile.id)
      row.momentum = pr == null ? null : pr - row.rank
    }
  }

  // Crown medal follows the live view, not career stats.
  rows.forEach((r, i) => {
    if (i === 0 && r.value > 0) r.achievements = [...r.achievements, 'crown']
  })
  return rows
}

/* ------------------------------------------------------------------ */
/* CAREER TOTALS (achievements / records are all-time)                 */
/* ------------------------------------------------------------------ */

export interface CareerTotals {
  deals: number
  revenue: number
  referralEarnings: number
  streakMonths: number
}

export function careerTotals(
  deals: Deal[],
  profiles: Profile[],
  referrals: Referral[],
  settings: Settings,
): Map<string, CareerTotals> {
  const map = new Map<string, CareerTotals>()
  const eligible = new Set(profiles.filter((p) => p.role !== 'admin' && p.show_in_leaderboard !== false).map((p) => p.id))
  const counted = deals.filter((d) => eligible.has(d.seller_id) && countsForBoard(d))
  const datesBySeller = new Map<string, number[]>()
  for (const d of counted) {
    const arr = datesBySeller.get(d.seller_id) ?? []
    arr.push(new Date(d.created_at).getTime())
    datesBySeller.set(d.seller_id, arr)
  }
  for (const id of eligible) {
    const mine = counted.filter((d) => d.seller_id === id)
    const revenue = mine.reduce((s, d) => s + d.gross_value, 0)
    const refereeIds = new Set(referrals.filter((r) => r.referrer_id === id).map((r) => r.referee_id))
    const me = profiles.find((p) => p.id === id)
    const pctByLevel: Record<Level, number> = {
      L1: settings.l1_referral_pct,
      L2: settings.l2_referral_pct,
      L3: settings.l3_referral_pct,
    }
    const pct = me ? pctByLevel[effectiveLevel(me, revenue, settings)] : 0
    const refGross = counted.filter((d) => refereeIds.has(d.seller_id)).reduce((s, d) => s + d.gross_value, 0)
    map.set(id, {
      deals: mine.length,
      revenue,
      referralEarnings: Math.round(refGross * (pct / 100)),
      streakMonths: activeMonthStreak(datesBySeller.get(id) ?? []),
    })
  }
  return map
}

/* ------------------------------------------------------------------ */
/* HALL OF RECORDS                                                     */
/* ------------------------------------------------------------------ */

export interface RecordEntry {
  key: 'biggest_deal' | 'best_month' | 'top_referrer' | 'iron_streak'
  label: string
  valueLabel: string
  holderName: string
  holderId: string | null
}

export function hallOfRecords(
  deals: Deal[],
  profiles: Profile[],
  referrals: Referral[],
  career: Map<string, CareerTotals>,
): RecordEntry[] {
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? '—'

  // Biggest single deal ever
  let biggest: Deal | null = null
  for (const d of deals) {
    if (!countsForBoard(d)) continue
    if (!biggest || d.gross_value > biggest.gross_value) biggest = d
  }

  // Most deals by anyone in one calendar month
  let bestMonthKey = ''
  let bestMonthCount = 0
  let bestMonthSeller = ''
  const perMonth = new Map<string, number>()
  for (const d of deals) {
    if (!countsForBoard(d)) continue
    const t = new Date(d.created_at)
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
    const n = (perMonth.get(k) ?? 0) + 1
    perMonth.set(k, n)
    if (n > bestMonthCount) {
      bestMonthCount = n
      bestMonthKey = k
      bestMonthSeller = d.seller_id
    }
  }

  // Top referrer by lifetime referral earnings
  let topRef: { id: string; amount: number } | null = null
  for (const [id, c] of career) {
    if (c.referralEarnings > (topRef?.amount ?? 0)) topRef = { id, amount: c.referralEarnings }
  }

  // Longest active-month streak
  let streak: { id: string; months: number } | null = null
  for (const [id, c] of career) {
    if (c.streakMonths > (streak?.months ?? 0)) streak = { id, months: c.streakMonths }
  }

  const out: RecordEntry[] = []
  if (biggest) {
    out.push({
      key: 'biggest_deal',
      label: 'Biggest Deal',
      valueLabel: `€${Math.round(biggest.gross_value).toLocaleString('en')}`,
      holderName: nameOf(biggest.seller_id),
      holderId: biggest.seller_id,
    })
  }
  if (bestMonthCount > 0) {
    const [y, m] = bestMonthKey.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' })
    out.push({
      key: 'best_month',
      label: 'Most Deals in a Month',
      valueLabel: `${bestMonthCount} deals · ${label}`,
      holderName: nameOf(bestMonthSeller),
      holderId: bestMonthSeller,
    })
  }
  if (topRef && topRef.amount > 0) {
    out.push({
      key: 'top_referrer',
      label: 'Top Referrer',
      valueLabel: `€${topRef.amount.toLocaleString('en')} earned`,
      holderName: nameOf(topRef.id),
      holderId: topRef.id,
    })
  }
  if (streak && streak.months >= 2) {
    out.push({
      key: 'iron_streak',
      label: 'Iron Streak',
      valueLabel: `${streak.months} months active`,
      holderName: nameOf(streak.id),
      holderId: streak.id,
    })
  }
  return out
}
