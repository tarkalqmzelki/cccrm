import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Copy, ExternalLink, Send, Upload, X, Sparkles,
  ArrowRight, FileDown, MessageSquare, Circle, CheckCircle2, Clock,
  Sun, Moon, Signature,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dateShort, dateLong, eur } from '../lib/format'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Input, Field, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'

/** Public, token-scoped client experience for an approved deal.
 *  All data flows through security-definer RPCs — the client never
 *  touches a table directly. */

const cx = {
  supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL ?? '',
  anonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? '',
}

async function callRpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!supabase) throw new Error('Database not configured')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return (data ?? null) as T | null
}

interface CxState {
  ok: boolean
  error?: 'INVALID' | 'REVOKED' | 'EXPIRED'
  expires_at?: string
  client_name?: string
  accepted_at?: string | null
  declined_at?: string | null
  decline_reason?: string
  contract_id?: string | null
  contract_accepted_at?: string | null
  onboarding?: Record<string, unknown>
  onboarding_status?: string
  deal?: { id: string; company: string; contact_name?: string; email?: string; phone?: string; website?: string; status: string; value: number; created_at: string; closed_at: string | null }
  company?: Record<string, unknown> | null
  opportunity?: { id: string | null; title: string; status: string | null; offer_value: number; offer_description: string } | null
  messages?: { id: string; sender: 'client' | 'seller'; body: string; created_at: string }[]
  events?: { id: string; event_type: string; actor_type: string; metadata: Record<string, unknown>; created_at: string }[]
  files?: { id: string; name: string; size_bytes: number; mime: string; uploaded_by: string; created_at: string }[]
  milestones?: { id: string; title: string; description: string; status: string; position: number; start_date: string | null; end_date: string | null; revision_note: string }[]
  objectives?: { id: string; title: string; description: string; status: string; due_date: string | null }[]
  invoices?: { id: string; number: string; status: string; issue_date: string; due_date: string | null; total: number; vat_pct: number; vat_included: boolean }[]
  contract?: Record<string, unknown> | null
}

type Stage = 'proposal' | 'declined' | 'contract' | 'onboarding' | 'project'

export default function ClientExperience() {
  const { token = '' } = useParams<{ token: string }>()
  const { push } = useToast()

  /* Theme */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('cx-theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') } catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem('cx-theme', theme) } catch { /* ignore */ }
  }, [theme])

  /* State */
  const [state, setState] = useState<CxState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchState = useCallback(async () => {
    if (!token) return
    try {
      const data = await callRpc<{ ok: boolean; error?: string }>('cx_get_state', { p_token: token })
      if (data && data.ok) {
        setState(data as unknown as CxState)
        setError(null)
      } else {
        setError((data as any)?.error || 'INVALID')
      }
    } catch (e: any) {
      // RPC-level failure (e.g. missing pgcrypto) — surface the real reason
      // so misconfiguration isn't mistaken for a bad link.
      const msg = e?.message ?? 'INVALID'
      setError(msg.includes('digest') ? 'MISSING_PGCRYPTO' : msg || 'INVALID')
    }
    setLoading(false)
  }, [token])

  useEffect(() => { void fetchState() }, [fetchState])
  useEffect(() => {
    const iv = setInterval(() => void fetchState(), 60000)
    return () => clearInterval(iv)
  }, [fetchState])

  /* Stage derivation */
  const stage: Stage = useMemo(() => {
    if (!state) return 'proposal'
    if (state.declined_at) return 'declined'
    if (!state.accepted_at) return 'proposal'
    if (!state.contract_accepted_at && state.contract) return 'contract'
    if (state.onboarding_status !== 'completed') return 'onboarding'
    return 'project'
  }, [state])

  if (loading) return <CxShell theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><CxSkeleton /></CxShell>

  if (error) {
    const isSetup = error === 'MISSING_PGCRYPTO'
      || error.toLowerCase().includes('digest')
      || error.toLowerCase().includes('does not exist')
      || error.toLowerCase().includes('schema')
    return (
      <CxShell theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-lg shadow-rose-500/30">
            {error === 'EXPIRED' ? <Circle size={26} strokeWidth={1.5} /> : <X size={26} strokeWidth={2} />}
          </span>
          <p className="text-lg font-bold">
            {error === 'EXPIRED'
              ? 'This link has expired'
              : error === 'REVOKED'
                ? 'This link was revoked'
                : isSetup
                  ? 'Server setup required'
                  : 'This link is not valid'}
          </p>
          {isSetup ? (
            <p className="max-w-md text-sm text-ink-400">
              The server-side function failed. Run the latest schema*.sql files in Supabase and reload this page.
            </p>
          ) : (
            <p className="max-w-sm text-sm text-ink-400">Ask us for a fresh link and you'll be right in.</p>
          )}
          <p className="num max-w-md break-all rounded-lg border border-line bg-ink-50 px-3 py-2 text-2xs text-ink-500 dark:bg-transparent dark:text-ink-300">{error}</p>
        </div>
      </CxShell>
    )
  }

  if (!state) return null

  return (
    <CxShell theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {stage === 'proposal' && <StageProposal state={state} token={token!} onDone={() => void fetchState()} />}
      {stage === 'declined' && <StageDeclined state={state} />}
      {stage === 'contract' && <StageContract state={state} token={token!} onDone={() => void fetchState()} />}
      {stage === 'onboarding' && <StageOnboarding state={state} token={token!} onDone={() => void fetchState()} />}
      {stage === 'project' && <StageProject state={state} token={token!} onRefresh={() => void fetchState()} />}
    </CxShell>
  )
}

/* ------------------------------------------------------------------ */
/* Shell + shared primitives                                           */
/* ------------------------------------------------------------------ */

function CxShell({ theme, onToggleTheme, children }: { theme: 'light' | 'dark'; onToggleTheme: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="text-sm font-black tracking-[0.14em] uppercase">Calista Concept</span>
          <button
            onClick={onToggleTheme}
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl bg-surface text-ink ring-1 ring-line transition-colors hover:bg-ink-50"
            title="Toggle light / dark"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6" style={{ paddingBottom: 'calc(2rem + var(--safe-bottom))' }}>
        {children}
      </main>
    </div>
  )
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function CxSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-64 rounded" />
      <div className="skeleton h-4 w-40 rounded" />
      <div className="skeleton h-64 w-full rounded-2xl" />
      <div className="skeleton h-12 w-56 rounded-xl" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* PROPOSAL                                                            */
/* ------------------------------------------------------------------ */
function StageProposal({ state, token, onDone }: { state: CxState; token: string; onDone: () => void }) {
  const { push } = useToast()
  const [signature, setSignature] = useState('')
  const [working, setWorking] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const opp = state.opportunity
  const company = state.company as Record<string, unknown> | null

  async function accept() {
    if (!signature.trim()) return
    setWorking(true)
    const res = await callRpc('cx_accept_proposal', { p_token: token, p_signature: signature.trim() })
    setWorking(false)
    if (res?.ok) onDone()
  }
  async function decline() {
    setWorking(true)
    const res = await callRpc('cx_decline_proposal', { p_token: token, p_reason: reason })
    setWorking(false)
    if (res?.ok) onDone()
  }

  const services = ((company as any)?.services_offered as string) || ''

  return (
    <Stage>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-2xs font-bold uppercase tracking-[0.2em] text-amber-500">Proposal</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {opp?.title || 'Project proposal'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-300">
          Prepared for <span className="font-semibold text-ink">{String(state.deal?.contact_name || state.deal?.company)}</span>
          {company?.address ? <> · <span>{String(company.address)}</span></> : null}
        </p>

        {/* Price hero */}
        <div className="mt-8 flex items-end gap-3 border-b border-line pb-8">
          <span className="num text-5xl font-black tracking-tight sm:text-6xl">{eur(state.deal?.value ?? opp?.offer_value ?? 0)}</span>
          <span className="pb-2 text-xs font-medium uppercase tracking-wider text-ink-400">Project investment</span>
        </div>

        {/* Description */}
        {opp?.offer_description && (
          <div className="mt-8">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-400">Scope & approach</h2>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-base leading-loose text-ink-700 dark:text-ink-200">{opp.offer_description}</p>
          </div>
        )}
        {services && (
          <div className="mt-6 flex flex-wrap gap-2">
            {services.split(',').map((s) => (
              <span key={s} className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{s.trim()}</span>
            ))}
          </div>
        )}

        {/* Accept */}
        <div className="mt-10 rounded-2xl border border-line bg-surface p-5 shadow-glass sm:p-6">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Signature size={16} strokeWidth={1.75} className="text-amber-500" />
            Ready to move forward?
          </p>
          <p className="mt-1 text-2xs text-ink-400">Type your name to sign the proposal digitally.</p>
          <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name — digital signature" className="mt-3" />
          <Button block size="lg" className="mt-4" disabled={!signature.trim() || working} onClick={() => void accept()} icon={<Signature size={16} strokeWidth={2} />}>
            {working ? 'Accepting…' : 'Accept proposal'}
          </Button>
          {!declining && (
            <button onClick={() => setDeclining(true)} className="mx-auto mt-3 block text-2xs text-ink-400 underline hover:text-ink">
              Not right for us — decline
            </button>
          )}
          {declining && (
            <div className="mt-3 space-y-2">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Tell us why (optional)" />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDeclining(false)}>Cancel</Button>
                <Button variant="danger" size="sm" onClick={() => void decline()}>Decline proposal</Button>
              </div>
            </div>
          )}
          <p className="mt-4 text-2xs leading-relaxed text-ink-400">
            Accepting starts the project journey: contract → onboarding → live progress. No payment is taken at this step.
          </p>
        </div>
      </motion.div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ */
/* DECLINED                                                            */
/* ------------------------------------------------------------------ */
function StageDeclined({ state }: { state: CxState }) {
  return (
    <Stage>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink dark:bg-[rgb(31,31,31)]">
          <X size={24} strokeWidth={2} />
        </span>
        <p className="text-lg font-bold">Proposal declined</p>
        {state.decline_reason && <p className="max-w-sm text-sm text-ink-400">"{state.decline_reason}"</p>}
        <p className="max-w-sm text-sm text-ink-400">Nothing is lost — reach out any time and we'll pick this back up.</p>
        {state.deal?.email && <a href={`mailto:${state.deal.email}`} className="mt-2 text-sm font-medium text-amber-600 underline dark:text-amber-400">Contact us directly</a>}
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ */
/* CONTRACT                                                            */
/* ------------------------------------------------------------------ */
function StageContract({ state, token, onDone }: { state: CxState; token: string; onDone: () => void }) {
  const [working, setWorking] = useState(false)
  const contract = state.contract as Record<string, unknown> | null

  async function approve() {
    setWorking(true)
    const res = await callRpc('cx_approve_contract', { p_token: token })
    setWorking(false)
    if (res?.ok) onDone()
  }

  return (
    <Stage>
      <p className="text-2xs font-bold uppercase tracking-[0.2em] text-pos">Proposal accepted ✓</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Your contract</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-300">
        Review the agreement below. Approving activates the contract and opens onboarding.
      </p>

      <div className="mt-8 space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
          <div>
            <p className="num text-sm font-black tracking-wide">{String(contract?.number || 'Agreement')}</p>
            <p className="text-2xs text-ink-400">{contract?.counterparty_company ? String(contract.counterparty_company) : String(state.deal?.company)}</p>
          </div>
          <Badge tone={contract?.status === 'active' ? 'pos' : 'warn'} dot>{contract?.status === 'active' ? 'Active' : 'Draft'}</Badge>
        </div>
        {contract?.body ? (
          <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-loose text-ink-700 dark:text-ink-200">{String(contract.body)}</div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
          <div><p className="text-2xs uppercase tracking-wide text-ink-400">Start date</p><p className="num font-semibold">{contract?.start_date ? dateLong(contract.start_date as string) : '—'}</p></div>
          <div><p className="text-2xs uppercase tracking-wide text-ink-400">End date</p><p className="num font-semibold">{contract?.end_date ? dateLong(contract.end_date as string) : '—'}</p></div>
        </div>
        <Button block size="lg" icon={<Signature size={16} strokeWidth={2} />} onClick={() => void approve()} disabled={working}>
          {working ? 'Approving…' : 'I approve this contract'}
        </Button>
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ */
/* ONBOARDING                                                          */
/* ------------------------------------------------------------------ */
function StageOnboarding({ state, token, onDone }: { state: CxState; token: string; onDone: () => void }) {
  const existing = state.onboarding || {}
  const deal = state.deal!
  const [form, setForm] = useState({
    contact_name: (existing.contact_name as string) || '',
    email: (existing.email as string) || deal.email || '',
    phone: (existing.phone as string) || '',
    address: (existing.address as string) || '',
    vat_number: (existing.vat_number as string) || '',
    website: (existing.website as string) || deal.website || '',
    requirements: (existing.requirements as string) || '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [working, setWorking] = useState(false)
  const { push } = useToast()

  async function submit() {
    setWorking(true)
    // Uploads first (optional)
    if (files.length > 0) {
      setUploading(true)
      for (const f of files) {
        const fd = new FormData()
        fd.append('token', token)
        fd.append('file', f)
        try {
          const r = await fetch(`${cx.supabaseUrl}/functions/v1/cx-upload`, { method: 'POST', body: fd })
          if (!r.ok) {
            const j = await r.json().catch(() => ({ error: 'UPLOAD_FAILED' }))
            push({ tone: 'error', title: `Upload failed: ${f.name}`, desc: j?.error })
          }
        } catch { /* keep going */ }
      }
      setUploading(false)
    }
    const res = await callRpc('cx_submit_onboarding', { p_token: token, p_data: form })
    setWorking(false)
    if (res?.ok) onDone()
    else push({ tone: 'error', title: 'Could not submit onboarding' })
  }

  return (
    <Stage>
      <p className="text-2xs font-bold uppercase tracking-[0.2em] text-pos">Contract approved ✓</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Let's set up your project</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-300">
        A few details so we can hit the ground running. Everything lands directly in your project file — no duplicate paperwork.
      </p>

      <div className="mt-8 space-y-6">
        <Section title="Company details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Primary contact"><Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Who we'll talk to" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+30 …" /></Field>
            <Field label="Website"><Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="company.com" /></Field>
            <Field label="Address"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street, City, Country" /></Field>
            <Field label="VAT number"><Input value={form.vat_number} onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))} placeholder="Optional" /></Field>
          </div>
        </Section>

        <Section title="Project requirements" desc="What matters most — goals, references, anything we should know.">
          <Textarea value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} rows={5} placeholder="Goals, style references, deadlines, access details…" />
        </Section>

        <Section title="Assets & files" desc="Logos, brand assets, documents — anything useful to start.">
          <FileDrop files={files} setFiles={setFiles} token={token} />
        </Section>

        <Button block size="lg" onClick={() => void submit()} disabled={working || uploading} icon={<ArrowRight size={16} strokeWidth={2} />}>
          {working || uploading ? 'Submitting…' : 'Complete onboarding'}
        </Button>
      </div>
    </Stage>
  )
}

/* ------------------------------------------------------------------ */
/* PROJECT (overview, journey, objectives, timeline, billing, messages)*/
/* ------------------------------------------------------------------ */
function StageProject({ state, token, onRefresh }: { state: CxState; token: string; onRefresh: () => void }) {
  const milestones = [...(state.milestones || [])].sort((a, b) => a.position - b.position)
  const objectives = state.objectives || []
  const completedMs = milestones.filter((m) => m.status === 'completed').length
  const doneTasks = objectives.filter((o) => o.status === 'done').length
  const pct = milestones.length > 0
    ? Math.round((completedMs / milestones.length) * 100)
    : objectives.length > 0
      ? Math.round((doneTasks / Math.max(objectives.length, 1)) * 100)
      : 0
  const current = milestones.find((m) => m.status === 'in_progress') ?? milestones.find((m) => m.status === 'waiting_client')
  const next = milestones.find((m) => m.status === 'planned')
  const closed = state.deal?.status === 'closed'
  const waitingClient = milestones.filter((m) => m.status === 'waiting_client')
  const [tab, setTab] = useState<'overview' | 'objectives' | 'timeline' | 'billing' | 'messages'>('overview')
  const sections = [
    ['overview', 'Overview'],
    ['objectives', 'Objectives'],
    ['timeline', 'Timeline'],
    ['billing', 'Billing'],
    ['messages', 'Messages'],
  ] as const

  return (
    <Stage>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 p-6 text-white sm:p-8 dark:from-[rgb(28,28,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
        <p className="text-2xs font-bold uppercase tracking-[0.25em] text-white/50">{state.deal?.company}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-black tracking-tight sm:text-4xl">{closed ? 'Project delivered' : state.onboarding_status !== 'completed' ? 'Almost there' : 'In progress'}</p>
            <p className="num mt-1 text-sm font-semibold text-white/70">{pct}% complete{closed ? ' - shipped' : ''}</p>
          </div>
          <ProgressRing pct={pct} size={84} />
        </div>

        {(current || next) && !closed && (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {current && (
              <div className="rounded-xl border border-white/15 bg-white/5 p-3.5 backdrop-blur">
                <p className="text-2xs font-bold uppercase tracking-wider text-amber-300">Current focus</p>
                <p className="mt-0.5 text-sm font-bold">{current.title}</p>
              </div>
            )}
            {next && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <p className="text-2xs font-bold uppercase tracking-wider text-white/50">Next</p>
                <p className="mt-0.5 text-sm font-bold text-white/85">{next.title}</p>
              </div>
            )}
          </div>
        )}

        {waitingClient.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/15 p-3.5">
            <p className="flex items-center gap-1.5 text-2xs font-black uppercase tracking-wider text-amber-300">
              <Signature size={12} strokeWidth={2.25} /> Your approval needed
            </p>
            <p className="mt-0.5 text-xs text-white/85">
              {waitingClient.map((m) => m.title).join(' · ')} — review below in Objectives & Journey.
            </p>
          </div>
        )}
      </div>

      {/* Journey */}
      <Section title="Project journey" desc="From kickoff to launch" className="mt-8">
        <Journey milestones={milestones} />
      </Section>

      {/* Tabs */}
      <div className="glass-tabs mt-8 inline-flex gap-1 rounded-full p-1">
        {sections.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as typeof tab)} className={`relative rounded-full px-4 py-2 text-2xs font-bold transition-colors ${tab === k ? 'text-white' : 'text-ink-500 hover:text-ink dark:text-white/60 dark:hover:text-white'}`}>
            {tab === k && <motion.span layoutId="cx-tab" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'objectives' && <Objectives objectives={objectives} />}
        {tab === 'timeline' && <Timeline milestones={milestones} />}
        {tab === 'billing' && <Billing invoices={state.invoices || []} />}
        {tab === 'messages' && <Messages state={state} token={token} onRefresh={onRefresh} />}
      </div>

      {/* Files */}
      <Section title="Files" desc="Shared between you and HQ" className="mt-8">
        <FileList files={state.files || []} />
      </Section>

      {/* Activity */}
      <Section title="Recent activity" desc="Everything that happened, automatically" className="mt-8">
        <ActivityFeed events={state.events || []} />
      </Section>
    </Stage>
  )
}

function Section({ title, desc, children, className = '' }: { title: string; desc?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-ink-400">{title}</h2>
      {desc && <p className="mt-1 text-2xs text-ink-300">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Journey({ milestones }: { milestones: NonNullable<CxState['milestones']> }) {
  if (milestones.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line py-8 text-center text-sm text-ink-400">The project journey will appear here once milestones are set.</p>
  }
  return (
    <div className="space-y-0">
      {milestones.map((m, i) => {
        const done = m.status === 'completed'
        const active = m.status === 'in_progress' || m.status === 'waiting_client'
        return (
          <motion.div key={m.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} className="relative flex gap-4 pb-8 last:pb-0">
            {/* connector */}
            {i < milestones.length - 1 && (
              <span className="absolute left-[15px] top-8 h-full w-px bg-line" />
            )}
            <span className={`relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${
              done ? 'border-emerald-500 bg-emerald-500 text-white' : active ? 'border-amber-400 bg-canvas text-amber-500' : 'border-line bg-canvas text-ink-300'
            }`}>
              {done ? <Check size={14} strokeWidth={3} /> : <Circle size={12} strokeWidth={2} className={active ? 'fill-amber-400' : ''} />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-bold ${done ? 'text-ink-400 line-through decoration-pos/60' : ''}`}>{m.title}</p>
                {m.status === 'waiting_client' && <Badge tone="warn" dot>Waiting for you</Badge>}
                {active && !closed && <Badge tone="info" dot>In progress</Badge>}
              </div>
              {m.description && <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-300">{m.description}</p>}
              {m.end_date && <p className="num mt-0.5 text-2xs text-ink-300">by {dateShort(m.end_date)}</p>}
              {m.revision_note && <p className="mt-1 rounded-lg bg-warnBg px-2.5 py-1.5 text-2xs text-warn">Revision: {m.revision_note}</p>}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function Objectives({ objectives }: { objectives: CxState['objectives'] }) {
  if (!objectives || objectives.length === 0) return <EmptyCx text="Objectives will appear as the project is planned." />
  return (
    <div className="space-y-1.5">
      {objectives.map((o) => {
        const label = o.status === 'done' ? 'Completed' : o.status === 'in_progress' ? 'In progress' : 'Planned'
        const tone = o.status === 'done' ? 'pos' : o.status === 'in_progress' ? 'info' : 'neutral'
        return (
          <div key={o.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
            {o.status === 'done'
              ? <CheckCircle2 size={16} strokeWidth={2} className="shrink-0 text-pos" />
              : <Circle size={15} strokeWidth={2} className={`shrink-0 ${o.status === 'in_progress' ? 'text-info fill-info/30' : 'text-ink-300'}`} />}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${o.status === 'done' ? 'text-ink-400 line-through' : ''}`}>{o.title}</p>
              {o.due_date && <p className="num text-2xs text-ink-400">due {dateShort(o.due_date)}</p>}
            </div>
            <Badge tone={tone as any}>{label}</Badge>
          </div>
        )
      })}
    </div>
  )
}

function Timeline({ milestones }: { milestones: CxState['milestones'] }) {
  const withDates = (milestones || []).filter((m) => m.start_date || m.end_date)
  if (withDates.length === 0) return <EmptyCx text="A visual timeline appears once milestones have dates." />
  const min = Math.min(...withDates.map((m) => new Date(m.start_date || m.end_date!).getTime()))
  const max = Math.max(...withDates.map((m) => new Date(m.end_date || m.start_date!).getTime()))
  const span = Math.max(max - min, 86400000)
  return (
    <div className="space-y-3">
      {withDates.map((m) => {
        const s = new Date(m.start_date || m.end_date!).getTime()
        const e = new Date(m.end_date || m.start_date!).getTime()
        const left = ((s - min) / span) * 100
        const width = Math.max(((e - s) / span) * 100, 6)
        return (
          <div key={m.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-2xs">
              <span className="font-semibold">{m.title}</span>
              <span className="num shrink-0 text-ink-400">{dateShort(m.start_date || m.end_date!)} → {dateShort(m.end_date || m.start_date!)}</span>
            </div>
            <div className="relative h-3 rounded-full bg-ink-100 dark:bg-[rgb(26,26,26)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className={`absolute h-full rounded-full ${m.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-green-400' : m.status === 'in_progress' ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-ink-300 to-ink-200 dark:from-ink-600 dark:to-ink-700'}`}
                style={{ marginLeft: `${(left / 100) * (100 / Math.max(width, 1)) * 0 + 0}%`, left: `${(s - min) / span * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Billing({ invoices }: { invoices: CxState['invoices'] }) {
  if (!invoices || invoices.length === 0) return <EmptyCx text="Invoices will appear here as they are issued." />
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <motion.div key={inv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="num text-sm font-bold">{inv.number}</p>
            <p className="num text-2xs text-ink-400">{dateShort(inv.issue_date)}{inv.due_date ? ` · due ${dateShort(inv.due_date)}` : ''}</p>
          </div>
          <p className="num shrink-0 text-sm font-extrabold">{eur(inv.total ?? 0)}</p>
          <a
            href={`/invoice/verify/${inv.id}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg border border-line p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]"
            title="View invoice"
          >
            <ExternalLink size={14} strokeWidth={1.75} />
          </a>
        </motion.div>
      ))}
      <p className="text-2xs text-ink-400">Payments are handled by bank transfer — details are on each invoice.</p>
    </div>
  )
}

function Messages({ state, token, onRefresh }: { state: CxState; token: string; onRefresh: () => void }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const messages = state.messages || []
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function send() {
    if (!draft.trim()) return
    setSending(true)
    await callRpc('cx_send_message', { p_token: token, p_body: draft.trim() })
    setDraft('')
    setSending(false)
    onRefresh()
  }

  return (
    <div>
      <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-line p-4">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-ink-400">Say hello — messages reach HQ instantly.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.sender === 'client' ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-white' : 'border border-line bg-surface'}`}
            >
              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
              <p className={`num mt-1 text-right text-[9px] ${m.sender === 'client' ? 'text-white/60' : 'text-ink-400'}`}>{dateShort(m.created_at)}</p>
            </motion.div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()} />
        <Button onClick={() => void send()} disabled={sending || !draft.trim()} icon={<Send size={14} strokeWidth={1.75} />}>Send</Button>
      </div>
    </div>
  )
}

function ActivityFeed({ events }: { events: CxState['events'] }) {
  if (!events || events.length === 0) return <EmptyCx text="Activity will appear automatically as work happens." />
  const LABELS: Record<string, string> = {
    experience_opened: 'Opened the experience',
    proposal_accepted: 'Accepted the proposal',
    proposal_declined: 'Declined the proposal',
    contract_approved: 'Approved the contract',
    onboarding_completed: 'Completed onboarding',
    milestone_created: 'Milestone planned',
    milestone_completed: 'Milestone completed',
    milestone_updated: 'Milestone updated',
    approval_completed: 'Approved a deliverable',
    change_requested: 'Requested a revision',
    message_sent: 'Sent a message',
    file_uploaded: 'Uploaded a file',
    file_shared: 'HQ shared a file',
    document_viewed: 'Viewed a document',
  }
  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <motion.div key={ev.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-xs">
          <span className="num shrink-0 text-2xs text-ink-300">{dateShort(ev.created_at)}</span>
          <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-300">{LABELS[ev.event_type] || ev.event_type.replace(/_/g, ' ')}{ev.metadata?.title ? `: ${ev.metadata.title}` : ''}</span>
        </motion.div>
      ))}
    </div>
  )
}

function FileDrop({ files, setFiles, token }: { files: File[]; setFiles: (f: File[]) => void; token: string }) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setFiles([...files, ...Array.from(e.dataTransfer.files)]) }}
      className="rounded-xl border border-dashed border-line p-5 text-center transition-colors hover:border-amber-400/60"
    >
      <Upload size={18} strokeWidth={1.5} className="mx-auto mb-2 text-ink-300" />
      <p className="text-xs text-ink-400">Drag files here — logos, briefs, anything useful.</p>
      {files.length > 0 && (
        <div className="mt-3 space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-neg hover:underline">remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/15" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fbbf24" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(Math.max(pct, 0), 100) / 100) }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <text x="50%" y="55%" textAnchor="middle" className="fill-white text-sm font-black" transform={`rotate(90 ${size / 2} ${size / 2})`} style={{ dominantBaseline: 'middle', fontSize: size * 0.24 }}>
        {pct}%
      </text>
    </svg>
  )
}

function FileList({ files }: { files: CxState['files'] }) {
  const token = useParams<{ token: string }>().token ?? ''
  const { push } = useToast()
  async function open(f: { id: string; name: string }) {
    try {
      const r = await fetch(`${cx.supabaseUrl}/functions/v1/cx-file?token=${encodeURIComponent(token)}&file=${f.id}`)
      const j = await r.json()
      if (j?.url) window.open(j.url, '_blank')
      else throw new Error(j?.error || 'Failed')
    } catch (e: any) {
      push({ tone: 'error', title: 'Download failed', desc: e?.message })
    }
  }
  if (!files || files.length === 0) return <EmptyCx text="Documents and assets shared on this project will appear here." />
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <motion.div key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{f.name}</p>
            <p className="num text-2xs text-ink-400">{dateShort(f.created_at)} · {f.uploaded_by === 'client' ? 'Uploaded by you' : 'From HQ'}</p>
          </div>
          <a
            href={`/experience/file?token=${encodeURIComponent(token)}&file=${f.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { e.preventDefault(); void open(f) }}
            className="shrink-0 rounded-lg border border-line p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]"
            title="Download"
          >
            <FileDown size={14} strokeWidth={1.75} />
          </a>
        </motion.div>
      ))}
      <p className="text-2xs text-ink-400">Files are private — only people with this link can open them.</p>
    </div>
  )
}

function EmptyCx({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line py-8 text-center text-sm text-ink-400">{text}</p>
}