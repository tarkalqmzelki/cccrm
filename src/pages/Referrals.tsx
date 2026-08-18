import { useMemo, useState } from 'react'
import { ArrowRight, Trash2, Plus, Network, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Textarea } from '../components/ui/Input'
import { EntityPickerModal, profileEntities } from '../components/EntityPickerModal'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { useToast } from '../context/ToastContext'
import { PageContainer } from '../components/layout/AppShell'
import type { Profile, Referral } from '../lib/types'
import { dateLong } from '../lib/format'

export default function Referrals() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => {
    const [referrals, profiles] = await Promise.all([db.listReferrals(), db.listProfiles()])
    return { referrals, profiles: profiles as Profile[] }
  }, [])
  const [addOpen, setAddOpen] = useState(false)

  const map = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  /* Non-admins only see referrals where they are the referrer or the
     referee — never other members' referral networks. Admins see all. */
  const visibleReferrals = useMemo(() => {
    if (!data) return [] as Referral[]
    if (isAdmin) return data.referrals
    if (!user) return [] as Referral[]
    return data.referrals.filter((r) => r.referrer_id === user.id || r.referee_id === user.id)
  }, [data, isAdmin, user])

  // tree view: for each person, who they referred
  const tree = useMemo(() => {
    if (!data) return [] as { profile: Profile; referees: Profile[] }[]
    if (!isAdmin && user) {
      // Non-admin: show only their own node and the people they referred.
      const me = data.profiles.find((p) => p.id === user.id)
      if (!me) return []
      const myReferees = data.referrals
        .filter((r) => r.referrer_id === user.id)
        .map((r) => map[r.referee_id])
        .filter(Boolean) as Profile[]
      return myReferees.length > 0 ? [{ profile: me, referees: myReferees }] : []
    }
    return data.profiles
      .filter((p) => p.role !== 'admin')
      .map((p) => ({
        profile: p,
        referees: data.referrals.filter((r) => r.referrer_id === p.id).map((r) => map[r.referee_id]).filter(Boolean) as Profile[],
      }))
      .filter((n) => n.referees.length > 0)
  }, [data, map, isAdmin, user])

  async function remove(r: Referral) {
    await db.deleteReferral(r.id)
    push({ tone: 'success', title: 'Referral removed' })
    reload()
  }

  function ctxItems(r: Referral): CtxItem[] {
    // Only the referrer (or an admin) can remove their own referral.
    const canRemove = isAdmin || (user?.id === r.referrer_id)
    return canRemove
      ? [{ label: 'Remove referral', danger: true, icon: <Trash2 size={15} strokeWidth={1.75} />, onClick: () => remove(r) }]
      : []
  }

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
          <p className="mt-1 text-sm text-ink-400">{isAdmin ? 'Manage who referred whom and adjust the network.' : 'Your referral network and team growth.'}</p>
        </div>
        {isAdmin && <Button icon={<Plus size={16} strokeWidth={1.75} />} onClick={() => setAddOpen(true)}>Add referral</Button>}
      </div>

      {/* Desktop: 2-column grid (list + network).  Mobile: single
          column, list first, network second — each card is laid out
          so the avatars + text never overflow horizontally. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={isAdmin ? 'Referral list' : 'Your referrals'} desc={`${visibleReferrals.length} ${visibleReferrals.length === 1 ? 'connection' : 'connections'}`} />
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div>
          ) : visibleReferrals.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">{isAdmin ? 'No referrals yet.' : 'You haven\'t referred anyone yet.'}</p>
          ) : (
            <div className="divide-y divide-line">
              {visibleReferrals.map((r) => {
                const a = map[r.referrer_id], b = map[r.referee_id]
                if (!a || !b) return null
                const canRemove = isAdmin || (user?.id === r.referrer_id)
                return (
                  <div
                    key={r.id}
                    onContextMenu={(e) => canRemove && openContextMenu(e, ctxItems(r))}
                    className="flex items-center gap-2 py-3 hover:bg-ink-50 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <Avatar name={a.full_name} color={a.avatar_color} url={a.avatar_url} size={28} />
                    <span className="hidden min-w-0 flex-shrink truncate text-sm font-medium sm:inline">{a.full_name}</span>
                    <ArrowRight size={14} strokeWidth={1.75} className="shrink-0 text-ink-300" />
                    <Avatar name={b.full_name} color={b.avatar_color} url={b.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.full_name}</span>
                      {/* On phone show both names stacked so nothing gets pushed right */}
                      <span className="block truncate text-2xs text-ink-400 sm:hidden">from {a.full_name}</span>
                      {r.note && <p className="truncate text-2xs text-ink-400">{r.note}</p>}
                    </div>
                    <span className="shrink-0 text-2xs text-ink-400">{dateLong(r.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={isAdmin ? 'Network' : 'Your network'} desc={isAdmin ? 'Referred members' : 'People you referred'} action={<Network size={16} strokeWidth={1.75} className="text-ink-300" />} />
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-lg" />)}</div>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">{isAdmin ? 'No referral chains yet.' : 'No one referred by you yet.'}</p>
          ) : (
            <div className="space-y-3">
              {tree.map((n) => (
                <div key={n.profile.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={n.profile.full_name} color={n.profile.avatar_color} url={n.profile.avatar_url} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.profile.full_name}</p>
                      <p className="text-2xs text-ink-400 capitalize">{n.profile.level}</p>
                    </div>
                    <Badge tone="neutral">{n.referees.length} referred</Badge>
                  </div>
                  <div className="mt-2 ml-9 space-y-1.5 border-l border-line pl-3">
                    {n.referees.map((r) => (
                      <div key={r.id} className="flex items-center gap-2">
                        <Avatar name={r.full_name} color={r.avatar_color} url={r.avatar_url} size={22} />
                        <span className="truncate text-sm text-ink-600">{r.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <AddReferralModal open={addOpen} onClose={() => setAddOpen(false)} profiles={data?.profiles ?? []} onSaved={() => { setAddOpen(false); reload() }} />
    </PageContainer>
  )
}

function AddReferralModal({ open, onClose, profiles, onSaved }: { open: boolean; onClose: () => void; profiles: Profile[]; onSaved: () => void }) {
  const { push } = useToast()
  const [referrerId, setReferrerId] = useState('')
  const [refereeId, setRefereeId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [referrerPickerOpen, setReferrerPickerOpen] = useState(false)
  const [refereePickerOpen, setRefereePickerOpen] = useState(false)

  const referrer = profiles.find((p) => p.id === referrerId)
  const referee = profiles.find((p) => p.id === refereeId)

  async function save() {
    if (!referrerId || !refereeId) { push({ tone: 'error', title: 'Select both people' }); return }
    if (referrerId === refereeId) { push({ tone: 'error', title: 'A person cannot refer themselves' }); return }
    setSaving(true)
    try {
      await db.createReferral({ referrer_id: referrerId, referee_id: refereeId, note })
      push({ tone: 'success', title: 'Referral added' })
      setReferrerId(''); setRefereeId(''); setNote('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not add', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add referral"
      desc="Record who referred whom into the network. Search by name, role, or phone — useful with many members."
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add referral'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Referrer" required hint="The person who made the referral.">
          <button
            type="button"
            onClick={() => setReferrerPickerOpen(true)}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
          >
            {referrer ? (
              <>
                <Avatar name={referrer.full_name} color={referrer.avatar_color} url={referrer.avatar_url} size={24} />
                <span className="flex-1 text-left truncate">{referrer.full_name}</span>
                <span className="text-2xs text-ink-400 capitalize">{referrer.role}</span>
              </>
            ) : (
              <span className="flex-1 text-left text-ink-400">Search a member…</span>
            )}
          </button>
        </Field>

        <Field label="Referee" required hint="The person who was referred.">
          <button
            type="button"
            onClick={() => setRefereePickerOpen(true)}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
          >
            {referee ? (
              <>
                <Avatar name={referee.full_name} color={referee.avatar_color} url={referee.avatar_url} size={24} />
                <span className="flex-1 text-left truncate">{referee.full_name}</span>
                <span className="text-2xs text-ink-400 capitalize">{referee.role}</span>
              </>
            ) : (
              <span className="flex-1 text-left text-ink-400">Search a member…</span>
            )}
          </button>
        </Field>

        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional context" rows={3} />
        </Field>
      </div>

      <EntityPickerModal
        open={referrerPickerOpen}
        onClose={() => setReferrerPickerOpen(false)}
        title="Select referrer"
        desc="Search by name, role, or phone."
        entities={profileEntities(profiles)}
        selectedId={referrerId}
        onSelect={setReferrerId}
        allowNone
      />

      <EntityPickerModal
        open={refereePickerOpen}
        onClose={() => setRefereePickerOpen(false)}
        title="Select referee"
        desc="Search by name, role, or phone."
        entities={profileEntities(profiles)}
        selectedId={refereeId}
        onSelect={setRefereeId}
        allowNone
      />
    </Modal>
  )
}
