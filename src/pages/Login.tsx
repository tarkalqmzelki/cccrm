import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Field } from '../components/ui/Input'
import { useToast } from '../context/ToastContext'

/* Subtle monochromatic grain — kills the "generic AI gradient" feel and adds
 * a print-like, editorial texture over the dark brand panel. */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"

export default function Login() {
  const { signIn } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  /* Autofocus only on desktop — on mobile, auto-focusing pops the keyboard
   * immediately, which pushes content around on first paint. */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      emailRef.current?.focus()
    }
  }, [])

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

  function handleForgot() {
    push({
      tone: 'info',
      title: 'Reset your password',
      desc: 'Contact your Calista Concept administrator to reset your credentials.',
    })
  }

  return (
    <div className="min-h-dvh bg-canvas lg:flex lg:items-stretch">
      {/* ============================================================
          LEFT — Atmospheric brand / visual section
          ============================================================ */}
      <section className="relative isolate hidden overflow-hidden bg-ink-900 lg:block lg:w-[52%] lg:min-h-dvh">
        {/* Base monochromatic gradient: near-black → graphite */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-700" />

        {/* Soft radial highlights — subtle silver light, top-right */}
        <div className="pointer-events-none absolute -top-48 -right-32 h-[42rem] w-[42rem] rounded-full bg-white/[0.055] blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-44 -left-24 h-[32rem] w-[32rem] rounded-full bg-white/[0.035] blur-[110px]" />

        {/* Fine concentric arcs — restrained, editorial, futuristic */}
        <div className="pointer-events-none absolute -right-44 top-1/2 h-[46rem] w-[46rem] -translate-y-1/2 rounded-full border border-white/[0.06]" />
        <div className="pointer-events-none absolute -right-24 top-1/2 h-[34rem] w-[34rem] -translate-y-1/2 rounded-full border border-white/[0.05]" />
        <div className="pointer-events-none absolute -right-6 top-1/2 h-[22rem] w-[22rem] -translate-y-1/2 rounded-full border border-white/[0.04]" />

        {/* Elegant sweeping curves */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.07]"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 800 800"
          aria-hidden
        >
          <path d="M-100 560 C 220 470, 520 690, 920 380" stroke="currentColor" strokeWidth="1.5" />
          <path d="M-100 640 C 240 560, 540 760, 940 460" stroke="currentColor" strokeWidth="1" />
        </svg>

        {/* Print-like grain overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* Content */}
        <div className="relative z-10 flex min-h-[46vh] flex-col justify-between px-8 pb-24 pt-12 lg:min-h-dvh lg:px-16 lg:py-16 lg:pb-16">
          {/* Logo — on a white brand plate so the black mark always reads cleanly */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex rounded-2xl bg-white px-7 py-5 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/40">
              <img src="https://kappa.lol/FAHnNi" alt="Calista Concept" className="h-12 w-auto lg:h-14" />
            </div>
          </motion.div>

          {/* Brand statement */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-white/40" />
              <span className="text-2xs uppercase tracking-[0.28em] text-white/55">Calista Concept</span>
            </div>
            <h2 className="text-[2rem] font-light leading-[1.08] tracking-tight text-white lg:text-[2.75rem] lg:leading-[1.06]">
              Connections that
              <br />
              create revenue.
            </h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">
              A unified platform for referrals, deals and payouts — built for sellers and headhunters who turn relationships into revenue.
            </p>
          </motion.div>

          {/* Footer meta */}
          <div className="flex items-center justify-between text-2xs text-white/35">
            <span>Referrals &amp; Revenue Platform</span>
            <span>© {new Date().getFullYear()} Calista Concept</span>
          </div>
        </div>
      </section>

      {/* ============================================================
          RIGHT — Clean, spacious login section
          ============================================================ */}
      <section className="relative z-10 flex min-h-dvh flex-1 items-center justify-center bg-canvas px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] lg:px-10">
        {/* Subtle background depth — off-white → soft grey */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white to-ink-50" />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-ink-100/50 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[400px]"
        >
          {/* Compact brand mark — mobile only (desktop shows the brand panel) */}
          <img src="https://kappa.lol/FAHnNi" alt="Calista Concept" className="mb-8 h-8 w-auto lg:hidden" />

          {/* Eyebrow */}
            <div className="mb-3 flex items-center gap-2 text-2xs uppercase tracking-[0.22em] text-ink-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />
              Welcome back
            </div>

            {/* Heading hierarchy */}
            <h1 className="text-[2rem] font-semibold leading-[1.1] tracking-tight text-ink">
              Sign in to Calista Concept
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Enter your credentials to access your referrals, deals and payouts.
            </p>

            <form onSubmit={submit} className="mt-9 space-y-4">
              <Field label="Email" required>
                <div className="relative">
                  <Mail size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                  <Input
                    ref={emailRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
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
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-600 transition-colors p-1"
                  >
                    {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                </div>
              </Field>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-2xs text-ink-400 transition-colors hover:text-ink-700"
                >
                  Forgot password?
                </button>
              </div>

              {err && <p className="text-sm text-neg">{err}</p>}

              <Button
                type="submit"
                block
                size="lg"
                disabled={busy}
                iconRight={<ArrowRight size={16} strokeWidth={1.75} />}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-10 text-center text-2xs text-ink-400">
              Protected by Calista Concept · By signing in you agree to our terms.
            </p>
        </motion.div>
      </section>
    </div>
  )
}
