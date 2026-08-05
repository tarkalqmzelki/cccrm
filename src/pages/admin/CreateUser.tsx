import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, ShieldCheck } from 'lucide-react'
import { db } from '../../lib/db'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field } from '../../components/ui/Input'
import { PageContainer } from '../../components/layout/AppShell'
import { useToast } from '../../context/ToastContext'
import { roleOptions, levelOptions } from '../../lib/mock'
import type { Role, Level } from '../../lib/types'

export default function CreateUser() {
  const { push } = useToast()
  const navigate = useNavigate()
  const [full_name, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('seller')
  const [level, setLevel] = useState<Level>('L1')
  const [phone, setPhone] = useState('')
  const [uid, setUid] = useState('')
  const [saving, setSaving] = useState(false)

  // Generate a preview UID
  function genUid() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let s = ''
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  // The actual UID is generated server-side by create_user().
  // We show a preview here and fetch the real one after creation.
  useEffect(() => { setUid(genUid()) }, [])

  async function save() {
    if (!full_name.trim() || !email.trim() || !password) {
      push({ tone: 'error', title: 'Name, email and password are required' })
      return
    }
    if (password.length < 6) {
      push({ tone: 'error', title: 'Password too short', desc: 'Use at least 6 characters' })
      return
    }
    setSaving(true)
    try {
      await db.createUser({
        email, password, full_name,
        role: role as 'seller' | 'headhunter',
        level, phone,
      })
      push({ tone: 'success', title: 'User created', desc: `${full_name} can now sign in.` })
      navigate('/sellers')
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not create user', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create User</h1>
        <p className="mt-1 text-sm text-ink-400">Create a new seller or headhunter account with login credentials.</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader title="New account" desc="The user will be able to sign in immediately with these credentials." />
        <div className="space-y-4">
          <Field label="Full name" required>
            <Input value={full_name} onChange={(e) => setFullName(e.target.value)} placeholder="Sofia Marchetti" />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@calistaconcept.eu" autoComplete="email" />
          </Field>
          <Field label="Password" required hint="At least 6 characters. The user can change it later.">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Initial password" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roleOptions.filter((r) => r !== 'admin').map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </Select>
            </Field>
            <Field label="Level" hint="Auto-adjusts based on revenue">
              <Select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                {levelOptions.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1122334" autoComplete="tel" />
          </Field>
          <div className="rounded-xl border border-line bg-ink-50 p-3">
            <p className="text-2xs text-ink-400">UID (auto-generated)</p>
            <p className="mt-1 font-mono text-lg tracking-[0.3em] font-semibold text-ink">
              {uid || '— — — — — —'}
            </p>
            <p className="mt-1 text-2xs text-ink-400">Share this 6-character code with the user. Other sellers need it to unlock their contact details.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/sellers')}>Cancel</Button>
          <Button onClick={save} disabled={saving} icon={<ShieldCheck size={15} strokeWidth={1.75} />}>
            {saving ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </Card>
    </PageContainer>
  )
}
