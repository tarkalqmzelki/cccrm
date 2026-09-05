import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Coins, Plus, Sparkles, Swords, UsersRound, Zap, PartyPopper, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { evaluateRuleFlow } from '../lib/gamification'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { MotionBorder } from '../components/ui/MotionBorder'
import { useToast } from '../context/ToastContext'
import { FUNCTIONAL_CHALLENGE_META } from '../lib/types'
import type { Challenge, Company, Deal } from '../lib/types'
import { eur, eurFull } from '../lib/format'

/**
 * Member-facing quest board. Functional challenges are auto-checked
 * against platform data; regular ones are self-reported with a +1
 * button; TEAM quests pool the whole company's progress toward one
 * goal with a shared bonus payout for everyone on completion.
 */
export default function Challenges() {
  const { user } = useAuth()
  const { push } = useToast()

  const challengesQ = useAsync(async () => db.listChallenges(), [])
  /* All members' progress rows (RLS allows read) — needed to pool team totals */
  const progressQ = useAsync(async () => db.listChallengeProgress(), [])
  const platformQ = useAsync(async () => {
    const [companies, deals] = await Promise.all([db.listCompanies(), db.listDeals()])
    return { companies: companies as Company[], deals: deals as Deal[] }
  }, [])

  const loading = challengesQ.loading || progressQ.loading || platformQ.loading
  const allChallenges = challengesQ.data || []
  const active = useMemo(() => allChallenges.filter((c) => c.status === 'active'), [allChallenges])
  const conquered = useMemo(() => allChallenges.filter((c) => c.status === 'ended'), [allChallenges])

  const [justDone, setJustDone] = useState<Set<string>>(new Set())
  const claimLock = useRef<Set<string>>(new Set())

  /* ---- progress helpers ---- */

  function platformActionsSince(since: number, kind: 'lead_created' | 'deal_submitted', team: boolean): number {
    if (!platformQ.data || !user) return 0
    if (kind === 'lead_created') {
      return platformQ.data.companies.filter(
        (x) => new Date(x.created_at).getTime() >= since && (team || x.created_by === user.id),
      ).length
    }
    /* A deal only counts when it's been APPROVED by admins. */
    return platformQ.data.deals.filter(
      (d) => new Date(d.created_at).getTime() >= since
        && (d.status === 'approved' || d.status === 'closed')
        && (team || d.seller_id === user.id),
    ).length
  }

  function selfSum(c: Challenge, mineOnly: boolean): number {
    return (progressQ.data || [])
      .filter((r) => r.challenge_id === c.id && (!mineOnly || r.user_id === user?.id))
      .reduce((s, r) => s + r.progress, 0)
  }

  const progressOf = (c: Challenge): number => {
    const fe = flowEvalOf(c)
    if (fe) return Math.round(fe.pct)
    const team = c.scope === 'team'
    const raw =
      c.type === 'functional'
        ? platformActionsSince(new Date(c.created_at).getTime(), c.functional_type, team)
        : selfSum(c, !team)
    return Math.min(raw, c.target_count)
  }

  /** For flow challenges progress runs 0–100 against the node graph. */
  const targetOf = (c: Challenge): number => (flowEvalOf(c) ? 100 : c.target_count)

  /** Live evaluation of an authored rule graph (functional + rule_flow). */
  const flowEvalOf = (c: Challenge) => {
    if (c.type !== 'functional' || !c.rule_flow) return null
    const team = c.scope === 'team'
    const since = new Date(c.created_at).getTime()
    return evaluateRuleFlow(c.rule_flow, {
      lead_created: platformActionsSince(since, 'lead_created', team),
      deal_submitted: platformActionsSince(since, 'deal_submitted', team),
    })
  }

  const myRowFor = (c: Challenge) =>
    (progressQ.data || []).find((r) => r.challenge_id === c.id && r.user_id === user?.id)

  const isCompleted = (c: Challenge): boolean => {
    const fe = flowEvalOf(c)
    if (fe) return fe.completed
    if (progressOf(c) >= c.target_count) return true
    if (c.scope === 'team') {
      // Any stamped completion counts as claimed for the whole team.
      return (progressQ.data || []).some((r) => r.challenge_id === c.id && !!r.completed_at)
    }
    return !!myRowFor(c)?.completed_at
  }

  /* ---- completion claim: stamp + payouts + inbox/push recap ---- */

  /* ---- bonus math: per-member amounts for the three split modes ---- */

  const r2 = (n: number) => Math.round(n * 100) / 100

  /** Primary metric driving contributions (flow goal > functional type). */
  function primaryMetric(c: Challenge): 'lead_created' | 'deal_submitted' {
    const goal = c.rule_flow?.nodes.find((n) => n.kind === 'goal')
    return (goal?.metric ?? c.functional_type ?? 'lead_created') as 'lead_created' | 'deal_submitted'
  }

  /** Per-member contribution toward the goal metric since challenge start. */
  function contributionsFor(c: Challenge, memberIds: string[]): Map<string, number> {
    const map = new Map<string, number>()
    memberIds.forEach((id) => map.set(id, 0))
    if (!platformQ.data || !user) return map
    const since = new Date(c.created_at).getTime()
    const metric = primaryMetric(c)
    if (metric === 'lead_created') {
      for (const x of platformQ.data.companies) {
        if (new Date(x.created_at).getTime() >= since && memberIds.includes(x.created_by ?? '')) {
          map.set(x.created_by!, (map.get(x.created_by!) ?? 0) + 1)
        }
      }
    } else {
      for (const d of platformQ.data.deals) {
        if (
          new Date(d.created_at).getTime() >= since
          && (d.status === 'approved' || d.status === 'closed')
          && memberIds.includes(d.seller_id)
        ) {
          map.set(d.seller_id, (map.get(d.seller_id) ?? 0) + 1)
        }
      }
    }
    return map
  }

  /** Distribute the pool: last member absorbs the cent remainder so the
   *  sum always equals the bonus exactly. */
  function splitPool(total: number, weights: { id: string; w: number }[]): { id: string; amount: number }[] {
    const totalW = weights.reduce((s, x) => s + x.w, 0)
    const out: { id: string; amount: number }[] = []
    let paid = 0
    weights.forEach((x, i) => {
      const amount = i === weights.length - 1
        ? r2(total - paid)
        : r2(totalW > 0 ? (x.w / totalW) * total : total / weights.length)
      paid = r2(paid + amount)
      out.push({ id: x.id, amount })
    })
    return out
  }

  async function claimCompletion(c: Challenge) {
    if (!user || claimLock.current.has(c.id)) return
    claimLock.current.add(c.id)
    try {
      const myRow = myRowFor(c)
      const alreadyStamped = c.scope === 'team'
        ? (progressQ.data || []).some((r) => r.challenge_id === c.id && !!r.completed_at)
        : !!myRow?.completed_at

      if (!alreadyStamped) await supabaseStampCompletion(c.id, user.id)

      if (c.financial_bonus > 0) {
        let amounts: { id: string; amount: number }[] = []
        if (c.scope === 'team') {
          const profiles = await db.listProfiles()
          const recipients = profiles.filter((p) => p.role !== 'admin' && p.active).map((p) => p.id)
          if (!recipients.includes(user.id)) recipients.push(user.id)

          const split = c.bonus_split ?? 'full'
          if (split === 'full') {
            amounts = recipients.map((rid) => ({ id: rid, amount: c.financial_bonus }))
          } else if (split === 'equal') {
            amounts = splitPool(c.financial_bonus, recipients.map((rid) => ({ id: rid, w: 1 })))
          } else {
            // By results — weight = each member's contribution to the goal metric
            const contrib = contributionsFor(c, recipients)
            const weights = recipients.map((rid) => ({ id: rid, w: contrib.get(rid) ?? 0 }))
            const totalW = weights.reduce((s, x) => s + x.w, 0)
            amounts = totalW > 0
              ? splitPool(c.financial_bonus, weights)
              : splitPool(c.financial_bonus, recipients.map((rid) => ({ id: rid, w: 1 }))) // zero-activity fallback: equal
          }
        } else {
          amounts = [{ id: user.id, amount: c.financial_bonus }]
        }
        if (!myRow?.bonus_paid) {
          for (const a of amounts) {
            if (a.amount > 0) await db.createChallengeBonusPayout(a.id, a.amount)
          }
          if (myRow) await db.markChallengeBonusPaid(c.id, user.id)
          const mine = amounts.find((a) => a.id === user.id)?.amount ?? 0
          const splitLabel = c.scope === 'team'
            ? c.bonus_split === 'contribution' ? 'Split by results' : c.bonus_split === 'equal' ? 'Split equally' : 'Full bonus for everyone'
            : 'Pending bonus'
          push({ tone: 'success', title: c.scope === 'team' ? `${splitLabel} — ${eur(c.financial_bonus)} pool queued` : `${eur(c.financial_bonus)} bonus queued`, desc: c.scope === 'team' ? `Your share: ${eurFull(mine)}. Check your payouts.` : 'It\'s waiting in your payouts as a pending bonus.' })
        }
      } else {
        push({ tone: 'success', title: `Challenge completed — ${c.title}` })
      }

      // Inbox recap + optional push (best-effort)
      try {
        await db.sendChallengeCompletedNotice(
          user.id,
          `Completed: ${c.title}`,
          c.scope === 'team'
            ? `The team conquered "${c.title}".${c.financial_bonus > 0 ? ` The ${eur(c.financial_bonus)} bonus pool (${(c.bonus_split ?? 'full') === 'contribution' ? 'split by results' : (c.bonus_split ?? 'full') === 'equal' ? 'split equally' : 'full for everyone'}) is on its way to the members' payouts.` : ''} Keep the streak alive!`
            : `You conquered "${c.title}" and earned ${c.points} points.${c.financial_bonus > 0 ? ` Your ${eur(c.financial_bonus)} bonus is queued in payouts.` : ''}`,
        )
      } catch { /* best-effort */ }

      setJustDone((s) => new Set(s).add(c.id))
      progressQ.reload()
    } finally {
      claimLock.current.delete(c.id)
    }
  }

  /* Watch for auto-completions of functional challenges */
  useEffect(() => {
    if (!user || loading) return
    for (const c of active) {
      if (c.type !== 'functional') continue
      if (progressOf(c) >= targetOf(c) && !isCompleted(c)) {
        void claimCompletion(c)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, active, progressQ.data, platformQ.data])

  async function bump(c: Challenge) {
    if (!user) return
    try {
      const row = await db.bumpChallengeProgress(c.id, user.id, c.target_count)
      const pooled = c.scope === 'team' ? Math.min(selfSum(c, false), c.target_count) : row.progress
      if (pooled >= c.target_count) {
        await claimCompletion(c)
      } else {
        push({ tone: 'info', title: `Progress logged — ${pooled}/${c.target_count}` })
      }
      progressQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not log progress', desc: e?.message })
    }
  }

  const live = active.filter((c) => !isCompleted(c))
  const doneActive = active.filter(isCompleted)

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Challenges
          <Swords size={20} strokeWidth={1.75} className="text-warn" />
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Quests from HQ — complete them for points and cash bonuses. Functional ones check themselves.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : challengesQ.error ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertTriangle size={22} strokeWidth={1.75} className="text-neg" />
            <p className="text-sm font-semibold">Couldn't load challenges</p>
            <p className="max-w-sm text-2xs text-ink-400">{challengesQ.error} — check that schema59–65 have been run in Supabase, then reopen this page.</p>
          </div>
        </Card>
      ) : active.length === 0 && conquered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <PartyPopper size={24} strokeWidth={1.5} className="text-ink-300" />
            <p className="text-sm font-medium">No quests right now</p>
            <p className="text-sm text-ink-400">When HQ pushes a challenge it lands here instantly.</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {live.map((c, i) => (
              <ChallengeCard key={c.id} c={c} index={i} progress={progressOf(c)} target={targetOf(c)} fe={flowEvalOf(c)} justDone={false} onBump={c.type === 'regular' ? () => bump(c) : undefined} />
            ))}
            {live.length === 0 && doneActive.length > 0 && (
              <p className="text-sm text-ink-400 lg:col-span-2">Every live quest is conquered. Legendary.</p>
            )}
          </div>

          <AnimatePresence>
            {doneActive.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                <p className="mb-3 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-pos">
                  <Check size={12} strokeWidth={2.5} /> Conquered · {doneActive.length}
                </p>
                <div className="grid gap-4 opacity-80 lg:grid-cols-2">
                  {doneActive.map((c, i) => (
                    <ChallengeCard key={c.id} c={c} index={i} progress={targetOf(c)} target={targetOf(c)} fe={flowEvalOf(c)} justDone={justDone.has(c.id)} onBump={undefined} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {conquered.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-2xs font-bold uppercase tracking-wider text-ink-300">Past challenges</p>
              <div className="grid gap-4 opacity-50 lg:grid-cols-2">
                {conquered.slice(0, 4).map((c, i) => (
                  <ChallengeCard key={c.id} c={c} index={i} progress={Math.min(progressOf(c), targetOf(c))} target={targetOf(c)} fe={flowEvalOf(c)} justDone={false} onBump={undefined} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Challenge card — module scope: a nested component identity remounts
   the whole subtree on every parent render (state/interval ticks),
   replaying entrance animations. Hoisted for stability.             */
/* ------------------------------------------------------------------ */
function ChallengeCard({
  c, index, progress, target, fe, justDone: celebrate, onBump,
}: {
  c: Challenge
  index: number
  progress: number
  target: number
  fe: ReturnType<typeof evaluateRuleFlow> | null
  justDone: boolean
  onBump?: () => void
}) {
    const accent = c.type === 'functional' ? '#3b82f6' : '#a855f7'
    const isTeam = c.scope === 'team'
    const pct = fe ? fe.pct : Math.min(100, (progress / target) * 100)
    const complete = fe ? fe.completed : progress >= target
    const rewardPoints = fe ? fe.reward.points || c.points : c.points
    const rewardBonus = fe ? fe.reward.bonus : c.financial_bonus

    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={celebrate ? { opacity: 1, y: 0, scale: [1, 1.03, 1] } : { opacity: 1, y: 0, scale: 1 }}
        transition={
          celebrate
            ? { duration: 0.5, times: [0, 0.4, 1] }
            : { duration: 0.45, delay: Math.min(index * 0.07, 0.35), ease: [0.22, 1, 0.36, 1] }
        }
      >
        <MotionBorder
          colors={
            complete
              ? ['#22c55e', '#86efac', '#22c55e']
              : isTeam
                ? ['#f59e0b', '#a855f7', '#f59e0b']
                : [accent, `${accent}44`, accent]
          }
          speed={complete ? 4 : 7}
        >
          <div className={`relative h-full overflow-hidden rounded-[15px] p-4 sm:p-5 ${complete ? 'bg-posBg/30 dark:bg-transparent' : ''}`}>
          {/* Completion burst */}
          {celebrate && (
            <motion.div
              initial={{ opacity: 0.9, scale: 0.4 }}
              animate={{ opacity: 0, scale: 2.2 }}
              transition={{ duration: 0.8 }}
              className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-pos/20"
            />
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {isTeam && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warn/25 bg-warnBg px-2 py-0.5 text-2xs font-bold text-warn">
                    <UsersRound size={10} strokeWidth={2} /> TEAM QUEST
                  </span>
                )}
                <Badge tone={c.type === 'functional' ? 'info' : 'neutral'} dot className="capitalize">{c.type}</Badge>
                {c.type === 'functional' && (
                  <span className="text-2xs text-ink-400">{FUNCTIONAL_CHALLENGE_META[c.functional_type].label}</span>
                )}
              </div>
              <p className="truncate text-base font-bold">{c.title}</p>
              {c.description && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-400">{c.description}</p>}
            </div>
            {complete && (
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30"
              >
                <Check size={17} strokeWidth={2.5} />
              </motion.span>
            )}
          </div>

          {/* Rewards */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-warn/25 bg-warnBg px-2.5 py-1 text-2xs font-bold text-warn">
              <Sparkles size={11} strokeWidth={2} /> +{rewardPoints} pts{isTeam ? ' each' : ''}
            </span>
            {rewardBonus != null && rewardBonus > 0 && (
              <motion.span
                animate={complete ? undefined : { filter: ['drop-shadow(0 0 0px rgba(34,197,94,0))', 'drop-shadow(0 0 5px rgba(34,197,94,0.45))', 'drop-shadow(0 0 0px rgba(34,197,94,0))'] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="inline-flex items-center gap-1 rounded-full border border-pos/30 bg-posBg px-2.5 py-1 text-2xs font-bold text-pos"
              >
                <Coins size={11} strokeWidth={2} />
                {isTeam
                  ? `${eur(rewardBonus)} pool · ${(c.bonus_split ?? 'full') === 'contribution' ? 'split by results' : (c.bonus_split ?? 'full') === 'equal' ? 'split equally' : 'full × everyone'}`
                  : `${eur(rewardBonus)} bonus → your payout`}
              </motion.span>
            )}
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-2xs">
              <span className="font-semibold uppercase tracking-wide text-ink-400">
                {complete
                  ? 'Completed'
                  : fe
                    ? 'Rule flow · auto-checked'
                    : c.type === 'functional'
                      ? 'Auto-checked by the platform'
                      : isTeam
                        ? 'Pooled by the whole team'
                        : 'Self-reported'}
              </span>
              <span className="num font-bold text-ink-500 dark:text-ink-300">
                {fe ? `${Math.round(pct)}%` : `${progress}/${c.target_count}`}
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, delay: 0.25 + Math.min(index * 0.06, 0.3), ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${
                  complete
                    ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                    : isTeam
                      ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-fuchsia-400'
                      : c.type === 'functional'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-400'
                        : 'bg-gradient-to-r from-purple-500 to-fuchsia-400'
                }`}
              />
            </div>

            {/* Rule-flow goal chips — live per-node status */}
            {fe && fe.goals.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {fe.goals.map((g) => (
                  <span
                    key={g.label}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-bold num ${
                      g.ok ? 'border-pos/30 bg-posBg text-pos' : 'border-line bg-ink-50 text-ink-500 dark:bg-transparent dark:text-ink-300'
                    }`}
                  >
                    {g.ok && <Check size={10} strokeWidth={3} />}
                    {g.label} {g.cur}/{g.need}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action */}
          {onBump && !complete && (
            <Button size="sm" className="mt-4 w-full" icon={<Plus size={13} strokeWidth={2} />} onClick={onBump}>
              {isTeam ? 'Add to the pool (+1)' : 'Log progress (+1)'}
            </Button>
          )}
          {c.type === 'functional' && !complete && !fe && (
            <p className="mt-3 flex items-center gap-1 text-2xs text-ink-300">
              <Zap size={10} strokeWidth={2} /> The moment {isTeam ? 'the company hits' : 'you hit'} {c.target_count}, this clears itself.
            </p>
          )}
          {fe && !complete && (
            <p className="mt-3 flex items-center gap-1 text-2xs text-ink-300">
              <Zap size={10} strokeWidth={2} /> Every node in the flow must turn green.
            </p>
          )}
          </div>
        </MotionBorder>
      </motion.div>
  )
}

/* Stamp completion via the same upsert path used by bump (progress stays). */
async function supabaseStampCompletion(challengeId: string, userId: string): Promise<void> {
  const rows = await db.listChallengeProgress(userId)
  const row = rows.find((r) => r.challenge_id === challengeId)
  if (row) {
    await supabase!.from('challenge_progress').update({ completed_at: new Date().toISOString() }).eq('id', row.id)
  } else {
    await supabase!.from('challenge_progress').insert({
      challenge_id: challengeId,
      user_id: userId,
      progress: 0,
      completed_at: new Date().toISOString(),
    })
  }
}
