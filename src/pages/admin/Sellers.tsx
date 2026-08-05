import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, KeyRound, Power, ShieldCheck, UserCog, Search } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { Table, useSort, type Column } from '../../components/ui/Table'
import { openContextMenu, type CtxItem } from '../../components/ui/ContextMenu'
import { PageContainer } from '../../components/layout/AppShell'
import { useToast } from '../../context/ToastContext'
import { blankProfile, roleOptions } from '../../lib/mock'
import { DEFAULT_SETTINGS } from '../../lib/types'
import type { Profile, Role, Deal, Referral, Settings } from '../../lib/types'
import { eur, dateShort } from '../../lib/format'
import { leaderboard, effectiveLevel, commissionFor, revenueOf } from '../../lib/metrics'

export default function Sellers() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => {
    const [profiles, deals, payouts, referrals] = await Promise.all([
      db.listProfiles(), db.listDeals(), db.listPayouts(), db.listReferrals(),
    ])
    const settings = await db.getSettings()
    return { profiles, deals: deals as Deal[], payouts, referrals, settings: settings || DEFAULT_SETTINGS }
  }, [])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pwUser, setPwUser] = useState<Profile | null>(null)

  const settings = data?.settings ?? DEFAULT_SETTINGS
  const board = useMemo(
    () => (data ? leaderboard(data.deals, data.profiles, data.payouts, data.referrals, settings) : []),
    [data, settings],
  )
  const boardMap = useMemo(() => {
    const m: Record<string, { deals: number; revenue: number; level: string; commission: number }> = {}
    board.forEach((b) => (m[b.profile.id] = { deals: b.deals, revenue: b.revenue, level: b.level, commission: commissionFor(b.profile, b.revenue, settings) }))
    return m
  }, [board, settings])

  const rows = useMemo(() => {
    if (!data) return []
    let r = (data.profiles as Profile[]).filter((p) => p.role !== 'admin')
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    }
    return r
  }, [data, query])

  const { sort, toggle } = useSort('revenue', 'desc')
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = (p: Profile): string | number => {
      if (sort.key === 'revenue') return boardMap[p.id]?.revenue ?? 0
      if (sort.key === 'deals') return boardMap[p.id]?.deals ?? 0
      if (sort.key === 'name') return p.full_name.toLowerCase()
      if (sort.key === 'level') return boardMap[p.id]?.level ?? 'L1'
      return new Date(p.created_at).getTime()
    }
    return [...rows].sort((a, b) => { const av = get(a), bv = get(b); return av < bv ? -dir : av > bv ? dir : 0 })
  }, [rows, sort, boardMap])

  async function toggleActive(p: Profile) {
    await db.updateProfile(p.id, { active: !p.active })
    push({ tone: 'success', title: p.active ? 'Account deactivated' : 'Account activated' })
    reload()
  }
  async function remove(p: Profile) {
    await db.deleteProfile(p.id)
    push({ tone: 'success', title: 'Account deleted' })
    reload()
  }

  function ctxItems(p: Profile): CtxItem[] {
    return [
      { label: 'Edit account', icon: <Pencil size={15} strokeWidth={1.75} />, onClick: () => setEditing(p) },
      { label: 'Change password', icon: <KeyRound size={15} strokeWidth={1.75} />, onClick: () => setPwUser(p) },
      { label: p.active ? 'Deactivate' : 'Activate', icon: <Power size={15} strokeWidth={1.75} />, onClick: () => toggleActive(p) },
      { divider: true },
      { label: 'Delete account', danger: true, icon: <Trash2 size={15} strokeWidth={1.75} />, onClick: () => remove(p) },
    ]
  }

  const columns: Column<Profile>[] = [
    { key: 'name', header: 'Person', sortable: true, cell: (p) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={p.full_name} color={p.avatar_color} url={p.avatar_url} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{p.full_name}</p>
          <p className="truncate text-2xs text-ink-400">{p.email}</p>
        </div>
      </div>
    ) },
    { key: 'level', header: 'Level', sortable: true, cell: (p) => {
      const lvl = boardMap[p.id]?.level ?? 'L1'
      return <Badge tone="neutral">{lvl}{p.custom_commission_pct != null ? ' *' : ''}</Badge>
    } },
    { key: 'uid', header: 'UID', cell: (p) => (
      <span className="font-mono text-2xs tracking-wider text-ink-500">{p.uid || '—'}</span>
    ) },
    { key: 'commission', header: 'Commission', align: 'right', cell: (p) => (
      <span className="num text-sm text-ink-600">{boardMap[p.id]?.commission ?? 0}%</span>
    ) },
    { key: 'deals', header: 'Deals', align: 'right', sortable: true, cell: (p) => <span className="num text-sm">{boardMap[p.id]?.deals ?? 0}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right', sortable: true, cell: (p) => <span className="num font-medium">{eur(boardMap[p.id]?.revenue ?? 0)}</span> },
    { key: 'created_at', header: 'Joined', align: 'right', sortable: true, cell: (p) => <span className="text-2xs text-ink-400">{dateShort(p.created_at)}</span> },
    { key: 'status', header: 'Status', cell: (p) => <Badge tone={p.active ? 'pos' : 'neg'} dot>{p.active ? 'Active' : 'Disabled'}</Badge> },
  ]

  return (
    <PageContainer>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sellers & Headhunters</h1>
          <p className="mt-1 text-sm text-ink-400">Create accounts, set custom commissions, manage access. Levels are auto-determined by revenue.</p>
        </div>
        <Button icon={<Plus size={16} strokeWidth={1.75} />} onClick={() => setCreateOpen(true)}>Add member</Button>
      </div>

      <Card>
        <div className="mb-3 relative w-full sm:max-w-xs">
          <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-9 h-10" />
        </div>
        <Table
          columns={columns}
          rows={sorted}
          rowKey={(p) => p.id}
          sort={sort}
          onSortChange={toggle}
          loading={loading}
          onRowClick={(p) => setEditing(p)}
          onRowContext={(e, p) => openContextMenu(e, ctxItems(p))}
          empty={<div className="flex flex-col items-center gap-3 py-12"><UserCog size={20} strokeWidth={1.75} className="text-ink-300" /><p className="text-sm text-ink-400">No members yet</p></div>}
        />
      </Card>

      <UserModal
        open={createOpen || !!editing}
        profile={editing}
        settings={settings}
        onClose={() => { setCreateOpen(false); setEditing(null) }}
        onSaved={() => { setCreateOpen(false); setEditing(null); reload() }}
      />

      <PasswordModal profile={pwUser} onClose={() => setPwUser(null)} onSaved={() => setPwUser(null)} />
    </PageContainer>
  )
}

/* ----------------- Create / Edit member ----------------- */
function UserModal({ open, profile, settings, onClose, onSaved }: { open: boolean; profile: Profile | null; settings: Settings; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast()
  const isEdit = !!profile
  const [form, setForm] = useState<Profile>(blankProfile())
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(profile ? { ...profile } : blankProfile({ role: 'seller', level: 'L1' }))
      setPassword('')
    }
  }, [open, profile])

  const set = (k: keyof Profile, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.full_name.trim() || !form.email.trim()) { push({ tone: 'error', title: 'Name and email are required' }); return }
    setSaving(true)
    try {
      if (isEdit && form) {
        await db.updateProfile(form.id, {
          full_name: form.full_name, email: form.email, role: form.role,
          phone: form.phone, address: form.address,
          active: form.active, avatar_color: form.avatar_color, avatar_url: form.avatar_url,
          custom_commission_pct: form.custom_commission_pct,
        })
        push({ tone: 'success', title: 'Account updated' })
      } else {
        // Create new user via RPC (creates auth user + profile + password)
        if (!password) { push({ tone: 'error', title: 'Password is required for new users' }); setSaving(false); return }
        await db.createUser({
          email: form.email,
          password,
          full_name: form.full_name,
          role: form.role as 'seller' | 'headhunter',
          level: form.level,
          phone: form.phone,
        })
        push({ tone: 'success', title: 'Member created', desc: `${form.full_name} can now sign in.` })
      }
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  // show auto level preview
  const previewRev = 0
  const autoLevel = effectiveLevel(form, previewRev, settings)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit account' : 'Add a member'}
      desc={isEdit ? 'Update details and custom commission.' : 'Create a new seller or headhunter account.'}
      size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving} icon={<ShieldCheck size={15} strokeWidth={1.75} />}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create member'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Sofia Marchetti" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@calistaconcept.eu" autoComplete="email" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              {roleOptions.filter((r) => r !== 'admin').map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </Select>
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+39 333 1122334" autoComplete="tel" />
          </Field>
          {isEdit && form.uid && (
            <div className="rounded-xl border border-line bg-ink-50 p-3">
              <p className="text-2xs text-ink-400">UID (for contact unlock)</p>
              <p className="mt-1 font-mono text-lg tracking-[0.3em] font-semibold">{form.uid}</p>
            </div>
          )}
        </div>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Via Roma 12, Milano" />
        </Field>
        <Field label="Photo URL">
          <Input value={form.avatar_url} onChange={(e) => set('avatar_url', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Custom commission %" hint="Leave blank to auto-calculate from level. Set a value to override.">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.custom_commission_pct ?? ''}
            onChange={(e) => set('custom_commission_pct', e.target.value === '' ? null : Number(e.target.value))}
            placeholder={`Auto by level (currently ${autoLevel})`}
          />
        </Field>
        {isEdit ? (
          <Field label="Account status">
            <Select value={form.active ? 'active' : 'disabled'} onChange={(e) => set('active', e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        ) : (
          <Field label="Temporary password" hint="Share this with the member. They can change it later.">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set initial password" />
          </Field>
        )}
      </div>
    </Modal>
  )
}

/* ----------------- Change password ----------------- */
function PasswordModal({ profile, onClose, onSaved }: { profile: Profile | null; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!profile) return
    if (pw1.length < 6) { push({ tone: 'error', title: 'Password too short', desc: 'Use at least 6 characters' }); return }
    if (pw1 !== pw2) { push({ tone: 'error', title: 'Passwords do not match' }); return }
    setSaving(true)
    try {
      await db.adminSetPassword(profile.id, pw1)
      push({ tone: 'success', title: 'Password updated', desc: `${profile.full_name} can use the new password.` })
      setPw1(''); setPw2('')
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update password', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!profile}
      onClose={onClose}
      title="Change password"
      desc={profile ? `Set a new password for ${profile.full_name}.` : ''}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update password'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="New password" required>
          <Input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" required>
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  )
}
