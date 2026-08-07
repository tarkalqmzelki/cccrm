import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, Mail, ShieldCheck, UserCog } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Field } from '../components/ui/Input'
import { useToast } from '../context/ToastContext'

type Mode = 'seller' | 'admin'

export default function Login() {
  const { signIn } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('seller')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const u = await signIn(email, password)
      push({ tone: 'success', title: `Welcome back, ${u.full_name.split(' ')[0]}` })
      navigate(u.role === 'admin' ? '/' : '/deals')
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  function switchToAdmin() {
    setMode('admin')
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-ink-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-ink-50 blur-3xl" />

      <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="https://kappa.lol/FAHnNi" alt="Calista Concept" className="h-16 w-auto mb-4" />
            <h1 className="text-xl font-semibold">Calista Concept</h1>
            <p className="mt-1 text-sm text-ink-400">Referrals & Revenue Platform</p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
            {(['seller', 'admin'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${mode === m ? 'text-white' : 'text-ink-500 hover:text-ink'
                  }`}
              >
                {mode === m && (
                  <motion.span layoutId="login-mode" className="absolute inset-0 rounded-lg bg-ink" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />
                )}
                <span className="relative flex items-center gap-1.5">
                  {m === 'admin' ? <ShieldCheck size={15} strokeWidth={1.75} /> : <UserCog size={15} strokeWidth={1.75} />}
                  {m === 'admin' ? 'Admin' : 'Seller / Headhunter'}
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="glass-strong rounded-2xl shadow-glass p-6 space-y-4">
            <Field label="Email" required>
              <div className="relative">
                <Mail size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <Input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'admin' ? 'email' : 'email'}
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
            </Field>

            <Field label="Password" required>
              <div className="relative">
                <Lock size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <Input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-600 transition-colors p-1">
                  {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                </button>
              </div>
            </Field>

            {err && <p className="text-sm text-neg">{err}</p>}

            <Button type="submit" block size="lg" disabled={busy}>
              {busy ? 'Signing in…' : mode === 'admin' ? 'Sign in to Admin' : 'Sign in'}
            </Button>

            {mode === 'admin' ? (
              <button type="button" onClick={() => setMode('seller')} className="block w-full text-center text-2xs text-ink-400 hover:text-ink-600 transition-colors">
                Are you a seller or headhunter? Switch
              </button>
            ) : (
              <button type="button" onClick={switchToAdmin} className="block w-full text-center text-2xs text-ink-400 hover:text-ink-600 transition-colors">
                Admin? Sign in here
              </button>
            )}
          </form>
        </motion.div>
      </div>
    </div>
  )
}
