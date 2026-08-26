import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2, Zap, Target, Coins, Rocket, Square, Swords, Sparkles, UsersRound, Workflow } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Button } from './ui/Button'
import { Input, Field, Textarea } from './ui/Input'
import { Modal } from './ui/Modal'
import { Badge } from './ui/Badge'
import { Skeleton } from './ui/Skeleton'
import { SegmentedControl } from './ui/SegmentedControl'
import { EmptyState } from './ui/EmptyState'
import { MotionBorder } from './ui/MotionBorder'
import { FlowCreator, emptyFlow, validateFlow } from './FlowCreator'
import { useToast } from '../context/ToastContext'
import { FUNCTIONAL_CHALLENGE_META, BONUS_SPLIT_META } from '../lib/types'
import type { Challenge, ChallengeType, FunctionalChallengeType, RuleFlow } from '../lib/types'
import { eur } from '../lib/format'

/**
 * Admin manager for platform challenges — create, configure, end and
 * delete quests that are pushed to every member's Challenges page.
 */
export function ChallengesManager({ adminId }: { adminId: string }) {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listChallenges(), [])
  const challenges = data || []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Challenge | null>(null)

  function openNew() { setEditing(null); setFormOpen(true) }
  function openEdit(c: Challenge) { setEditing(c); setFormOpen(true) }

  async function toggleStatus(c: Challenge) {
    try {
      await db.updateChallenge(c.id, { status: c.status === 'active' ? 'ended' : 'active' })
      push({ tone: 'success', title: c.status === 'active' ? 'Challenge ended' : 'Challenge re-activated' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function remove(c: Challenge) {
    if (!confirm(`Delete "${c.title}"? Progress history is removed too.`)) return
    try {
      await db.deleteChallenge(c.id)
      push({ tone: 'success', title: 'Challenge deleted' })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  const active = challenges.filter((c) => c.status === 'active')
  const ended = challenges.filter((c) => c.status === 'ended')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          Quests appear instantly on every member's Challenges page. Functional ones auto-check; regular ones are self-reported.
        </p>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={openNew}>New challenge</Button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : challenges.length === 0 ? (
        <EmptyState icon={<Swords size={22} strokeWidth={1.5} />} title="No challenges yet" desc="Create your first quest and push it to the team." />
      ) : (
        <>
          <Section label={`Live · ${active.length}`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((c, i) => (
              <AdminChallengeCard key={c.id} c={c} index={i} onEdit={() => openEdit(c)} onToggle={() => toggleStatus(c)} onDelete={() => remove(c)} />
            ))}
            {active.length === 0 && <p className="text-sm text-ink-300 sm:col-span-2">Nothing live right now.</p>}
          </div>

          {ended.length > 0 && (
            <>
              <Section label={`Ended · ${ended.length}`} className="mt-6" />
              <div className="grid gap-3 opacity-70 sm:grid-cols-2">
                {ended.map((c, i) => (
                  <AdminChallengeCard key={c.id} c={c} index={i} onEdit={() => openEdit(c)} onToggle={() => toggleStatus(c)} onDelete={() => remove(c)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ChallengeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        adminId={adminId}
        onSaved={() => { setFormOpen(false); reload() }}
      />
    </div>
  )
}

function Section({ label, className = '' }: { label: string; className?: string }) {
  return <p className={`mb-2 text-2xs font-bold uppercase tracking-wider text-ink-400 ${className}`}>{label}</p>
}

/* ------------------------------------------------------------------ */
/* Admin card                                                          */
/* ------------------------------------------------------------------ */
function AdminChallengeCard({
  c, index, onEdit, onToggle, onDelete,
}: {
  c: Challenge
  index: number
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const accent = c.type === 'functional' ? '#3b82f6' : '#a855f7'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <MotionBorder colors={c.scope === 'team' ? ['#f59e0b', '#a855f7', '#f59e0b'] : [accent, `${accent}44`, accent]} speed={8}>
        <div className="relative h-full overflow-hidden rounded-[15px] p-4">
        {/* sheen */}
        <div
          aria-hidden
          className="sheen-x pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
          style={{ '--sheen-cycle': '10s' } as React.CSSProperties}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{c.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{c.description || 'No description.'}</p>
          </div>
          <Badge tone={c.type === 'functional' ? 'info' : 'neutral'} dot className="shrink-0 capitalize">
            {c.type}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {c.scope === 'team' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warn/25 bg-warnBg px-2 py-0.5 text-2xs font-semibold text-warn">
              <UsersRound size={10} strokeWidth={2} /> Team · {BONUS_SPLIT_META[c.bonus_split ?? 'full'].label.toLowerCase()}
            </span>
          )}
          {c.rule_flow && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-100 px-2 py-0.5 text-2xs font-semibold text-violet-600 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300">
              <Workflow size={10} strokeWidth={2} /> Flow rule
            </span>
          )}
          {c.type === 'functional' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/25 bg-infoBg px-2 py-0.5 text-2xs font-semibold text-info">
              <Zap size={10} strokeWidth={2} /> {FUNCTIONAL_CHALLENGE_META[c.functional_type].label}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-warn/25 bg-warnBg px-2 py-0.5 text-2xs font-semibold text-warn">
            <Target size={10} strokeWidth={2} /> ×{c.target_count}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-50 px-2 py-0.5 text-2xs font-semibold text-ink-500 dark:bg-ink-100">
            <Sparkles size={10} strokeWidth={2} /> +{c.points} pts
          </span>
          {c.financial_bonus > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-pos/25 bg-posBg px-2 py-0.5 text-2xs font-semibold text-pos">
              <Coins size={10} strokeWidth={2} /> {eur(c.financial_bonus)} bonus
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
          <Button variant="ghost" size="sm" icon={<Pencil size={13} strokeWidth={1.75} />} onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="sm" icon={c.status === 'active' ? <Square size={13} strokeWidth={1.75} /> : <Rocket size={13} strokeWidth={1.75} />} onClick={onToggle}>
            {c.status === 'active' ? 'End' : 'Re-activate'}
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto text-neg hover:bg-negBg" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={onDelete}>Delete</Button>
        </div>
        </div>
      </MotionBorder>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Create / edit form                                                  */
/* ------------------------------------------------------------------ */
function ChallengeFormModal({
  open, onClose, editing, adminId, onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: Challenge | null
  adminId: string
  onSaved: () => void
}) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ChallengeType>('functional')
  const [functionalType, setFunctionalType] = useState<FunctionalChallengeType>('lead_created')
  const [scope, setScope] = useState<'solo' | 'team'>('solo')
  const [targetCount, setTargetCount] = useState(5)
  const [points, setPoints] = useState(100)
  const [bonus, setBonus] = useState(0)
  const [announce, setAnnounce] = useState(true)
  const [announceText, setAnnounceText] = useState('')
  const [ruleMode, setRuleMode] = useState<'simple' | 'flow'>('simple')
  const [flow, setFlow] = useState<RuleFlow | null>(null)
  const [bonusSplit, setBonusSplit] = useState<'full' | 'equal' | 'contribution'>('full')
  const [saving, setSaving] = useState(false)

  // Hydrate when opening
  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    setWasOpen(true)
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setType(editing?.type ?? 'functional')
    setFunctionalType(editing?.functional_type ?? 'lead_created')
    setScope(editing?.scope ?? 'solo')
    setTargetCount(editing?.target_count ?? 5)
    setPoints(editing?.points ?? 100)
    setBonus(editing?.financial_bonus ?? 0)
    const f = editing?.rule_flow ?? null
    setFlow(f ? { order: [...f.order], nodes: f.nodes.map((n) => ({ ...n })) } : null)
    setRuleMode(f ? 'flow' : 'simple')
    setBonusSplit(editing?.bonus_split ?? 'full')
    if (!editing) {
      setAnnounce(true)
      setAnnounceText('')
    }
  }
  if (!open && wasOpen) setWasOpen(false)

  async function save() {
    if (!title.trim()) {
      push({ tone: 'error', title: 'Title is required' })
      return
    }
    // Flow validation for functional challenges in flow mode
    let ruleFlow: RuleFlow | null = null
    let effPoints = points
    let effBonus = Math.max(0, bonus)
    if (type === 'functional' && ruleMode === 'flow') {
      const err = validateFlow(flow)
      if (err) { push({ tone: 'error', title: err }); return }
      ruleFlow = flow
      const rewardNode = flow!.nodes.find((n) => n.kind === 'reward')
      if (rewardNode) {
        effPoints = rewardNode.points ?? effPoints
        effBonus = Math.max(0, rewardNode.bonus ?? effBonus)
      }
    }
    setSaving(true)
    try {
      const shared = {
        title: title.trim(),
        description: description.trim(),
        type,
        functional_type: type === 'functional' ? functionalType : 'lead_created',
        target_count: Math.max(1, targetCount),
        points: effPoints,
        financial_bonus: effBonus,
        scope,
        bonus_split: scope === 'team' ? bonusSplit : 'full',
        rule_flow: type === 'functional' ? ruleFlow : null,
      }
      if (editing) {
        await db.updateChallenge(editing.id, shared)
        push({ tone: 'success', title: 'Challenge updated' })
      } else {
        await db.createChallenge({ ...shared, created_by: adminId })

        // Announcement → inbox for every active member. The inbox insert
        // triggers the send-push Edge Function; the user_challenge_new
        // key is enabled by default so this reaches everyone unless they
        // opted out in their notification preferences.
        if (announce) {
          try {
            const profiles = await db.listProfiles()
            const recipients = profiles.filter((p) => p.role !== 'admin' && p.active)
            const reward = effBonus > 0
              ? scope === 'team'
                ? ` Team pool: ${eur(effBonus)} — ${BONUS_SPLIT_META[bonusSplit].label.toLowerCase()} between active members (${effPoints} pts each).`
                : ` Rewards: +${effPoints} pts and ${eur(effBonus)} on completion.`
              : ` Reward: +${effPoints} pts.`
            await db.announceChallenge(
              recipients.map((r) => r.id),
              adminId,
              `New ${scope === 'team' ? 'team quest' : 'challenge'}: ${title.trim()}`,
              `${announceText.trim() || description.trim() || 'A new challenge just landed — check the Challenges page.'}${reward}`,
            )
          } catch { /* announcement is best-effort */ }
        }

        push({ tone: 'success', title: announce ? 'Challenge pushed + announced' : 'Challenge pushed', desc: 'It is now live on every member\'s Challenges page.' })
      }
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? 'Edit challenge' : 'Create challenge'}
      desc="Configure the quest — it goes live the moment you save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{editing ? 'Save changes' : 'Push challenge'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lead Hunter Sprint" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What should the team do?" />
        </Field>

        <Field label="Challenge type">
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: 'functional', label: 'Functional · auto-checked' },
              { value: 'regular', label: 'Regular · self-reported' },
            ]}
            columns={2}
            size="sm"
          />
        </Field>

        <Field label="Scope" hint={scope === 'team' ? 'The whole company pools progress toward one goal — the bonus goes to everyone when it clears.' : 'Each member races their own copy of this quest.'}>
          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(v)}
            options={[
              { value: 'solo', label: 'Solo quest' },
              { value: 'team', label: 'Team quest' },
            ]}
            columns={2}
            size="sm"
          />
        </Field>

        {type === 'functional' && (
          <Field label="Platform action to check" hint={FUNCTIONAL_CHALLENGE_META[functionalType].hint}>
            <SegmentedControl
              value={functionalType}
              onChange={(v) => setFunctionalType(v as FunctionalChallengeType)}
              options={[
                { value: 'lead_created', label: FUNCTIONAL_CHALLENGE_META.lead_created.label },
                { value: 'deal_submitted', label: FUNCTIONAL_CHALLENGE_META.deal_submitted.label },
              ]}
              columns={2}
              size="sm"
            />
          </Field>
        )}

        {type === 'functional' && (
          <Field
            label="Rule mode"
            hint={ruleMode === 'flow'
              ? 'Chain goals & conditions visually — e.g. "10 leads, of which ≥1 deal, earns the reward".'
              : 'One metric, one target — quick and simple.'}
          >
            <SegmentedControl
              value={ruleMode}
              onChange={(v) => {
                setRuleMode(v as 'simple' | 'flow')
                if (v === 'flow' && !flow) setFlow(emptyFlow())
              }}
              options={[
                { value: 'simple', label: 'Simple' },
                { value: 'flow', label: 'Flow builder' },
              ]}
              columns={2}
              size="sm"
            />
          </Field>
        )}

        {type === 'functional' && ruleMode === 'flow' && (
          <FlowCreator value={flow} onChange={setFlow} />
        )}

        {!(type === 'functional' && ruleMode === 'flow') && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Target count" hint="Actions needed">
              <Input type="number" min={1} value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} />
            </Field>
            <Field label="Points" hint="XP reward">
              <Input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            </Field>
            <Field label="Bonus €" hint={bonus > 0 ? 'Paid to payouts' : '0 hides bonus'}>
              <Input type="number" min={0} step="0.01" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
            </Field>
          </div>
        )}

        {scope === 'team' && (
          <Field label="Team bonus split" hint={BONUS_SPLIT_META[bonusSplit].hint}>
            <SegmentedControl
              value={bonusSplit}
              onChange={(v) => setBonusSplit(v as 'full' | 'equal' | 'contribution')}
              options={[
                { value: 'full', label: 'Full ×N' },
                { value: 'equal', label: 'Equal split' },
                { value: 'contribution', label: 'By results' },
              ]}
              columns={3}
              size="sm"
            />
          </Field>
        )}

        <p className="rounded-xl border border-line bg-ink-50/60 px-3 py-2.5 text-2xs leading-relaxed text-ink-400 dark:bg-transparent">
          {type === 'functional' && ruleMode === 'flow' && flow ? (
            (() => {
              const rewardNode = flow.nodes.find((n) => n.kind === 'reward')
              const rb = rewardNode?.bonus ?? 0
              return rb > 0
                ? `On completion, the ${eur(rb)} ${scope === 'team' ? `pool is ${BONUS_SPLIT_META[scope === 'team' ? bonusSplit : 'full'].label.toLowerCase()} between active members'` : "is queued into the member's"} payouts as pending "bonus".`
                : 'Add a bonus to the Reward node to pay cash on completion.'
            })()
          ) : bonus > 0 ? (
            scope === 'team'
              ? `On completion, the ${eur(bonus)} ${BONUS_SPLIT_META[bonusSplit].label.toLowerCase()} between active members' payouts as pending "bonus".`
              : `On completion, ${eur(bonus)} is queued into the member's payouts automatically as a pending "bonus" payout.`
          ) : 'Financial bonus is off — only points will be shown as a reward.'}
        </p>

        {!editing && (
          <>
            <div className="rounded-xl border border-line p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={announce}
                  onChange={(e) => setAnnounce(e.target.checked)}
                  className="h-4 w-4 accent-[rgb(10,10,10)]"
                />
                Announce with a push notification
              </label>
              {announce && (
                <div className="mt-2">
                  <Textarea
                    value={announceText}
                    onChange={(e) => setAnnounceText(e.target.value)}
                    rows={2}
                    placeholder="Custom announcement text (like a broadcast). Leave empty to use the challenge description."
                  />
                  <p className="mt-1 text-2xs text-ink-400">
                    Lands in every active member's Inbox and fires the "New challenge pushed" push — enabled globally, members can opt out in their preferences.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
