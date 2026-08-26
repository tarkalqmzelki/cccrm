import { useEffect, useMemo, useState } from 'react'
import { Save, RotateCcw, Activity, AlertTriangle, Wrench, CheckCircle2, Bell, BookOpen, FileText, Settings2, Sparkles, BookMarked, Megaphone, FileText as InvoiceIcon, Palette, Languages, Globe, Swords, Store, CreditCard } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Field, Textarea } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { PageContainer } from '../../components/layout/AppShell'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_SETTINGS, SYSTEM_STATUS_META, DEFAULT_INVOICE_SETTINGS, DEFAULT_DESIGN_SETTINGS } from '../../lib/types'
import type { Settings, SystemStatus, SystemStatusValue, InvoiceSettings, DesignSettings } from '../../lib/types'
import { dateShort } from '../../lib/format'
import { NotificationTemplateEditor } from '../../components/NotificationTemplateEditor'
import { NotificationPreferences } from '../../components/NotificationPreferences'
import { PushDeliveryLog } from '../../components/PushDeliveryLog'
import { LogBook } from '../../components/LogBook'
import { ChangeLogManager } from '../../components/ChangeLogManager'
import { AdminDocumentation } from '../../components/AdminDocumentation'
import { BroadcastManager } from '../../components/BroadcastManager'
import { ContractTemplateManager } from '../../components/ContractTemplateManager'
import { LanguageSettingsManager } from '../../components/LanguageSettingsManager'
import { PlatformLocaleManager } from '../../components/PlatformLocaleManager'
import { ChallengesManager } from '../../components/ChallengesManager'
import { MarketplaceManager } from '../../components/marketplace/MarketplaceManager'
import { BankCardsManager } from '../../components/bank/BankCardsManager'

type Category =
  | 'commissions'
  | 'challenges'
  | 'lead-marketplace'
  | 'bank-cards'
  | 'design'
  | 'locales'
  | 'languages'
  | 'invoice-settings'
  | 'contract-templates'
  | 'notif-preferences'
  | 'notif-templates'
  | 'notif-log'
  | 'notif-errors'
  | 'broadcast'
  | 'system'
  | 'logbook'
  | 'changelog'
  | 'docs'

interface NavItem {
  id: Category
  label: string
  icon: typeof Bell
  group: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'commissions',       label: 'Commissions',       icon: Settings2,  group: 'Commissions' },
  { id: 'challenges',        label: 'Challenges',        icon: Swords,     group: 'Gamification' },
  { id: 'lead-marketplace',  label: 'Lead Marketplace',  icon: Store,      group: 'Gamification' },
  { id: 'bank-cards',        label: 'Bank Cards',        icon: CreditCard, group: 'Gamification' },
  { id: 'design',            label: 'Design Settings',   icon: Palette,    group: 'Commissions' },
  { id: 'locales',           label: 'Platform Locales',  icon: Globe,      group: 'Commissions' },
  { id: 'languages',         label: 'Language Settings', icon: Languages,  group: 'Commissions' },
  { id: 'invoice-settings',  label: 'Invoice settings',  icon: InvoiceIcon, group: 'Commissions' },
  { id: 'contract-templates', label: 'Contract templates', icon: FileText,  group: 'Commissions' },
  { id: 'notif-preferences',  label: 'Your preferences',  icon: Bell,       group: 'Notifications' },
  { id: 'notif-templates',    label: 'Templates',         icon: Bell,       group: 'Notifications' },
  { id: 'broadcast',          label: 'Broadcast',         icon: Megaphone,  group: 'Notifications' },
  { id: 'notif-log',          label: 'Delivery log',      icon: Bell,       group: 'Notifications' },
  { id: 'notif-errors',       label: 'Errors',            icon: Bell,       group: 'Notifications' },
  { id: 'system',             label: 'System status',     icon: Activity,   group: 'System' },
  { id: 'logbook',            label: 'LogBook',           icon: BookOpen,   group: 'System' },
  { id: 'changelog',          label: 'ChangeLog',         icon: Sparkles,   group: 'System' },
  { id: 'docs',               label: 'Admin Documentation', icon: BookMarked, group: 'System' },
]

const CATEGORY_TITLE: Record<Category, { title: string; desc: string }> = {
  commissions:       { title: 'Commissions',                      desc: 'Configure level thresholds, commission rates, and referral bonuses.' },
  challenges:        { title: 'Challenges',                       desc: 'Create quests and push them to every member — auto-checked functional goals or self-reported regular ones, with points and optional cash bonuses.' },
  'lead-marketplace': { title: 'Lead Marketplace',                desc: 'Feed the team a pool of companies. Import via JSON (same shape as creating a lead), publish in bulk, set claim timers, or allocate directly to one person.' },
  'bank-cards':      { title: 'Bank Cards',                       desc: 'Issue fully-manual virtual cards to members, record categorized top-ups and spends, freeze cards. Members see everything on their Bank page.' },
  design:            { title: 'Design settings',                 desc: 'Platform-wide branding — logo URLs for light and dark mode, shown in the sidebar and on the login page.' },
  locales:           { title: 'Platform locales',               desc: 'Translate the platform interface (nav, buttons, labels) into multiple languages. Users pick their locale from Profile Settings.' },
  languages:         { title: 'Language settings',               desc: 'Translate every fixed label on printed invoices and contracts. Add a language, translate the entries, pick it when generating documents.' },
  'invoice-settings': { title: 'Invoice settings',                desc: 'Your business identity + default templates that prefill every new invoice. Update once, reuse on every invoice.' },
  'contract-templates': { title: 'Contract templates',             desc: 'Create and edit contract text templates with {placeholders}. Used when generating contracts.' },
  'notif-preferences': { title: 'Your notification preferences',  desc: 'Enable or disable each alert type for your own account.' },
  'notif-templates':   { title: 'Notification templates',         desc: 'Edit the title and body format applied to every push notification. Disabling a type here suppresses it for everyone.' },
  broadcast:           { title: 'Broadcast announcement',         desc: 'Send a push notification to every active user. Toggle the channel on/off in Templates.' },
  'notif-log':         { title: 'Push delivery log',              desc: 'Successful push deliveries, written by the Edge Function.' },
  'notif-errors':      { title: 'Notification errors',            desc: 'Failed and skipped pushes. Empty after a test means the trigger can\'t reach the function — check app_secrets.' },
  system:             { title: 'System status',                  desc: 'Toggle each tracked service\'s status. Members see updates in real time (within ~30s).' },
  logbook:            { title: 'LogBook',                        desc: 'Every error and warning logged across the platform — push failures, sync issues, anything we surface.' },
  changelog:          { title: 'ChangeLog',                       desc: 'Release notes shown to all users in the sidebar. Drafts are hidden until published. Publishing a new entry also fires a "What\'s new" push to every subscribed device.' },
  docs:               { title: 'Admin Documentation',            desc: 'Internal knowledge base. Markdown body — pasted code blocks (triple backticks) render automatically. Add per-doc code snippets and a structure view.' },
}

export default function SettingsPage() {
  const { push } = useToast()
  const { user } = useAuth()
  const { data, loading } = useAsync(async () => db.getSettings(), [])
  const [form, setForm] = useState<Settings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState<Category>('commissions')

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const set = (k: keyof Settings, v: number) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      await db.updateSettings(form)
      push({ tone: 'success', title: 'Settings saved', desc: 'Levels and commissions updated.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setForm({ ...DEFAULT_SETTINGS })
    push({ tone: 'info', title: 'Reset to defaults', desc: 'Save to apply.' })
  }

  // Group nav items by group label for the sidebar
  const groups = Array.from(new Set(NAV_ITEMS.map((n) => n.group)))
  const meta = CATEGORY_TITLE[active]

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-400">{meta.desc}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sidebar — categories */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 lg:flex-col lg:overflow-visible">
            {groups.map((group) => (
              <div key={group} className="flex gap-1 lg:flex-col">
                <p className="hidden lg:block px-3 pt-3 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-400">{group}</p>
                {NAV_ITEMS.filter((n) => n.group === group).map((n) => {
                  const isActive = active === n.id
                  return (
                    <button
                      key={n.id}
                      onClick={() => setActive(n.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:w-full ${
                        isActive ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink-50 hover:text-ink'
                      }`}
                    >
                      <n.icon size={15} strokeWidth={1.75} />
                      <span className="truncate">{n.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">{meta.title}</h2>
            </div>
            {active === 'commissions' && (
              <div className="flex gap-2">
                <Button variant="secondary" icon={<RotateCcw size={15} strokeWidth={1.75} />} onClick={reset}>Reset</Button>
                <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </div>
            )}
          </div>

          {/* ---------- Commissions ---------- */}
          {active === 'commissions' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">              <Card>
                <CardHeader title="Level thresholds" desc="Revenue needed to reach each level (€)" />
                {loading ? (
                  <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
                ) : (
                  <div className="space-y-4">
                    <Field label="L1 threshold" hint="From 0 to this amount">
                      <Input type="number" min={0} value={form.l1_threshold} onChange={(e) => set('l1_threshold', Number(e.target.value))} />
                    </Field>
                    <Field label="L2 threshold" hint="From L1 threshold to this amount">
                      <Input type="number" min={0} value={form.l2_threshold} onChange={(e) => set('l2_threshold', Number(e.target.value))} />
                    </Field>
                    <Field label="L3 threshold" hint="Above this amount">
                      <Input type="number" min={0} value={form.l3_threshold} onChange={(e) => set('l3_threshold', Number(e.target.value))} />
                    </Field>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="Sales commission" desc="Percentage of gross value per level (seller's own deals)" />
                {loading ? (
                  <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
                ) : (
                  <div className="space-y-4">
                    <Field label="L1 commission %" hint="10% by default">
                      <Input type="number" min={0} max={100} value={form.l1_commission_pct} onChange={(e) => set('l1_commission_pct', Number(e.target.value))} />
                    </Field>
                    <Field label="L2 commission %" hint="15% by default">
                      <Input type="number" min={0} max={100} value={form.l2_commission_pct} onChange={(e) => set('l2_commission_pct', Number(e.target.value))} />
                    </Field>
                    <Field label="L3 commission %" hint="20% by default">
                      <Input type="number" min={0} max={100} value={form.l3_commission_pct} onChange={(e) => set('l3_commission_pct', Number(e.target.value))} />
                    </Field>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="Referral commission" desc="Separate rate — earned from your direct referrals' deals" />
                {loading ? (
                  <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-xl" />)}</div>
                ) : (
                  <div className="space-y-4">
                    <Field label="L1 referral %" hint="5% by default — earned on referral's gross value">
                      <Input type="number" min={0} max={100} value={form.l1_referral_pct} onChange={(e) => set('l1_referral_pct', Number(e.target.value))} />
                    </Field>
                    <Field label="L2 referral %" hint="5% by default">
                      <Input type="number" min={0} max={100} value={form.l2_referral_pct} onChange={(e) => set('l2_referral_pct', Number(e.target.value))} />
                    </Field>
                    <Field label="L3 referral %" hint="5% by default">
                      <Input type="number" min={0} max={100} value={form.l3_referral_pct} onChange={(e) => set('l3_referral_pct', Number(e.target.value))} />
                    </Field>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="How it works" desc="Summary of the rules" />
                <div className="space-y-2 text-sm text-ink-600">
                  <p>• <strong>Sales commission</strong> = the seller's level rate applied to their own deal gross value.</p>
                  <p>• <strong>Referral commission</strong> = the referrer's referral rate (separate from sales) applied to their direct referral's deal gross value.</p>
                  <p>• Levels auto-determined by total revenue (approved + closed deals).</p>
                  <p>• One-leg rule: only direct (first-level) referrals count — no cascading.</p>
                  <p>• Admin can override commission per seller or per deal.</p>
                </div>
              </Card>
            </div>
          )}

          {/* ---------- Invoice settings ---------- */}
          {active === 'invoice-settings' && (
            <InvoiceSettingsPanel />
          )}

          {/* ---------- Challenges ---------- */}
          {active === 'challenges' && <ChallengesManager adminId={user?.id || ''} />}

          {/* ---------- Lead Marketplace ---------- */}
          {active === 'lead-marketplace' && <MarketplaceManager adminId={user?.id || ''} />}

          {/* ---------- Bank Cards ---------- */}
          {active === 'bank-cards' && <BankCardsManager adminId={user?.id || ''} />}

          {/* ---------- Design settings ---------- */}
          {active === 'design' && (
            <DesignSettingsPanel />
          )}

          {/* ---------- Platform locales ---------- */}
          {active === 'locales' && (
            <Card>
              <CardHeader title="Platform locales" desc="Translate the platform interface (nav, buttons, labels) into multiple languages. Users pick their locale from Profile Settings." />
              <PlatformLocaleManager />
            </Card>
          )}

          {/* ---------- Language settings ---------- */}
          {active === 'languages' && (
            <Card>
              <CardHeader title="Language settings" desc="Translate every fixed label on printed invoices and contracts. Add a language, translate the entries, pick it when generating documents." />
              <LanguageSettingsManager />
            </Card>
          )}

          {/* ---------- Contract templates ---------- */}
          {active === 'contract-templates' && (
            <Card>
              <CardHeader title="Contract templates" desc="Create and edit contract text templates with {placeholders}. Used when generating contracts." />
              <ContractTemplateManager />
            </Card>
          )}

          {/* ---------- Notifications: Preferences ---------- */}
          {active === 'notif-preferences' && (
            <Card>
              <CardHeader title="Your notification preferences" desc="Enable or disable each alert type for your own account." />
              <NotificationPreferences />
            </Card>
          )}

          {/* ---------- Notifications: Templates ---------- */}
          {active === 'notif-templates' && (
            <Card>
              <CardHeader title="Notification templates" desc="Edit the title and body format applied to every push notification. Disabling a type here suppresses it for everyone." />
              <NotificationTemplateEditor />
            </Card>
          )}

          {/* ---------- Notifications: Delivery Log ---------- */}
          {active === 'notif-log' && (
            <Card>
              <CardHeader title="Push delivery log" desc="Successful push deliveries, written by the Edge Function." />
              <PushDeliveryLog status="sent" limit={50} />
            </Card>
          )}

          {/* ---------- Notifications: Errors ---------- */}
          {active === 'notif-errors' && (
            <Card>
              <CardHeader title="Notification errors" desc="Failed and skipped pushes. Empty after a test means the trigger can't reach the function — check app_secrets." />
              <PushDeliveryLog status="error" limit={50} />
            </Card>
          )}

          {/* ---------- Notifications: Broadcast ---------- */}
          {active === 'broadcast' && (
            <BroadcastManager />
          )}

          {/* ---------- System status ---------- */}
          {active === 'system' && <SystemStatusAdmin />}

          {/* ---------- LogBook ---------- */}
          {active === 'logbook' && (
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><BookOpen size={16} strokeWidth={1.75} className="text-ink-600" />LogBook</span>}
                desc="Every error and warning logged across the platform."
              />
              <LogBook />
            </Card>
          )}

          {/* ---------- ChangeLog manager ---------- */}
          {active === 'changelog' && (
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.75} className="text-ink-600" />ChangeLog</span>}
                desc="Release notes shown to all users in the sidebar. Drafts are hidden until published."
              />
              <ChangeLogManager />
            </Card>
          )}

          {/* ---------- Admin Documentation ---------- */}
          {active === 'docs' && <AdminDocumentation />}
        </div>
      </div>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* System status admin panel                                          */
/* ------------------------------------------------------------------ */
const STATUS_OPTIONS: { value: SystemStatusValue; label: string; color: string; icon: typeof CheckCircle2 }[] = [
  { value: 'operating',   label: 'Operating',   color: '#22c55e', icon: CheckCircle2 },
  { value: 'maintenance', label: 'Maintenance', color: '#f59e0b', icon: Wrench },
  { value: 'down',        label: 'Down',        color: '#ef4444', icon: AlertTriangle },
]

function SystemStatusAdmin() {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => db.listSystemStatuses(), [])
  const [local, setLocal] = useState<Record<string, SystemStatus>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const m: Record<string, SystemStatus> = {}
    data.forEach((s) => (m[s.id] = { ...s }))
    setLocal(m)
  }, [data])

  function setStatus(id: string, status: SystemStatusValue) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, status } }
    })
  }
  function setUptime(id: string, value: number) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, uptime_pct: Math.min(100, Math.max(0, value)) } }
    })
  }
  function setNote(id: string, note: string) {
    setLocal((m) => {
      const row = m[id]
      if (!row) return m
      return { ...m, [id]: { ...row, note } }
    })
  }

  async function persist(id: string) {
    const row = local[id]
    if (!row) return
    setSavingId(id)
    try {
      await db.updateSystemStatus(id, { status: row.status, uptime_pct: row.uptime_pct, note: row.note })
      push({ tone: 'success', title: 'System status updated', desc: `${row.system} → ${SYSTEM_STATUS_META[row.status].label}` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    } finally {
      setSavingId(null)
    }
  }

  const rows = useMemo(() => Object.values(local).sort((a, b) => a.system.localeCompare(b.system)), [local])

  return (
    <Card className="mt-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Activity size={16} strokeWidth={1.75} className="text-info" />
            System status
          </span>
        }
        desc="Toggle each tracked service's status. Members see updates in real time (within ~30s)."
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Activity size={20} strokeWidth={1.75} className="text-ink-300" />
          <p className="text-sm text-ink-400">No systems registered. Run schema24.sql to seed them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => {
            const dirty =
              data?.find((x) => x.id === s.id)?.status !== s.status ||
              data?.find((x) => x.id === s.id)?.uptime_pct !== s.uptime_pct ||
              (data?.find((x) => x.id === s.id)?.note || '') !== s.note
            return (
              <div key={s.id} className="rounded-xl border border-line p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.system}</p>
                    <p className="text-2xs text-ink-400">Updated {dateShortSafe(s.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {STATUS_OPTIONS.map((o) => {
                      const selected = s.status === o.value
                      return (
                        <button
                          key={o.value}
                          onClick={() => setStatus(s.id, o.value)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition-colors ${
                            selected ? 'border-transparent text-white' : 'border-line text-ink-500 hover:bg-ink-50'
                          }`}
                          style={selected ? { background: o.color } : undefined}
                        >
                          <o.icon size={12} strokeWidth={1.75} />
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <Input
                    value={s.note}
                    onChange={(e) => setNote(s.id, e.target.value)}
                    placeholder="Optional note (shown in the status modal)"
                    className="h-10"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-ink-400 shrink-0">Uptime %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={s.uptime_pct}
                      onChange={(e) => setUptime(s.id, Number(e.target.value))}
                      className="h-10 w-24"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!dirty || savingId === s.id}
                      onClick={() => persist(s.id)}
                    >
                      {savingId === s.id ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function dateShortSafe(iso: string): string {
  try { return dateShort(iso) } catch { return '—' }
}

/* ------------------------------------------------------------------ */
/* Invoice settings panel — issuer identity + default templates       */
/* ------------------------------------------------------------------ */
function InvoiceSettingsPanel() {
  const { push } = useToast()
  const { data, loading } = useAsync(async () => db.getInvoiceSettings(), [])
  const [form, setForm] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  function set<K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

      async function save() {
    setSaving(true)
    try {
      await db.updateInvoiceSettings({
        company_name: form.company_name,
        company_subname: form.company_subname,
        company_address: form.company_address,
        company_email: form.company_email,
        company_phone: form.company_phone,
        company_website: form.company_website,
        company_vat: form.company_vat,
        company_id: form.company_id,
        default_bank: form.default_bank,
        default_legal_notes: form.default_legal_notes,
        default_signature_name: form.default_signature_name,
        default_payment_terms: form.default_payment_terms,
        qr_verify_base_url: form.qr_verify_base_url,
      })
      push({ tone: 'success', title: 'Invoice settings saved', desc: 'New invoices will be prefilled from these templates.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Issuer identity */}
      <Card>
        <CardHeader title="Your business identity" desc="The 'From' block printed on every invoice. Shows the logo + your trading name + the legal entity underneath." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Trading name" required>
            <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Calista Concept" />
          </Field>
          <Field label="Legal entity name" hint="Printed underneath the trading name">
            <Input value={form.company_subname} onChange={(e) => set('company_subname', e.target.value)} placeholder="Legendary Design Ltd." />
          </Field>
          <Field label="Address">
            <Input value={form.company_address} onChange={(e) => set('company_address', e.target.value)} placeholder="Via Roma 12, Milano" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.company_email} onChange={(e) => set('company_email', e.target.value)} placeholder="accounting@calistaconcept.eu" />
          </Field>
          <Field label="Phone">
            <Input value={form.company_phone} onChange={(e) => set('company_phone', e.target.value)} placeholder="+39 02 1234 5678" />
          </Field>
          <Field label="Website">
            <Input value={form.company_website} onChange={(e) => set('company_website', e.target.value)} placeholder="calistaconcept.eu" />
          </Field>
          <Field label="VAT ID">
            <Input value={form.company_vat} onChange={(e) => set('company_vat', e.target.value)} placeholder="BG123456789" />
          </Field>
          <Field label="Company ID / Reg. number">
            <Input value={form.company_id} onChange={(e) => set('company_id', e.target.value)} placeholder="123456789" />
          </Field>
        </div>
      </Card>

      {/* Default templates */}
      <Card>
        <CardHeader title="Default templates" desc="Prefill every new invoice so you don't retype these each time. You can override per invoice." />
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bank name">
              <Input
                value={form.default_bank?.bank ?? ''}
                onChange={(e) => set('default_bank', { ...(form.default_bank || { bank: '', iban: '', bic: '', account: '' }), bank: e.target.value })}
                placeholder="UniCredit Bulbank"
              />
            </Field>
            <Field label="IBAN">
              <Input
                value={form.default_bank?.iban ?? ''}
                onChange={(e) => set('default_bank', { ...(form.default_bank || { bank: '', iban: '', bic: '', account: '' }), iban: e.target.value })}
                placeholder="BG80 BNBG 9661 1020 3456 78"
                className="font-mono text-sm"
              />
            </Field>
            <Field label="BIC / SWIFT">
              <Input
                value={form.default_bank?.bic ?? ''}
                onChange={(e) => set('default_bank', { ...(form.default_bank || { bank: '', iban: '', bic: '', account: '' }), bic: e.target.value })}
                placeholder="BICXXXXXXXX"
                className="font-mono text-sm"
              />
            </Field>
            <Field label="Account number (optional)">
              <Input
                value={form.default_bank?.account ?? ''}
                onChange={(e) => set('default_bank', { ...(form.default_bank || { bank: '', iban: '', bic: '', account: '' }), account: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Default payment terms" hint="Printed in the payment information block">
            <Input
              value={form.default_payment_terms}
              onChange={(e) => set('default_payment_terms', e.target.value)}
              placeholder="Bank transfer within 30 days from invoice date."
            />
          </Field>
          <Field label="Default legal / tax footnote" hint="Printed near the bottom of the invoice">
            <Textarea
              value={form.default_legal_notes}
              onChange={(e) => set('default_legal_notes', e.target.value)}
              rows={3}
              placeholder="VAT payable by recipient under reverse charge mechanism. This invoice was generated electronically and is valid without signature."
            />
          </Field>
          <Field label="Default signature — issued by" hint="Name pre-filled on every new invoice's signature block">
            <Input
              value={form.default_signature_name}
              onChange={(e) => set('default_signature_name', e.target.value)}
              placeholder="Sofia Marchetti"
            />
          </Field>
        </div>
      </Card>

      {/* QR verification */}
      <Card>
        <CardHeader title="QR code verification" desc="Every invoice's QR code points to this URL with the invoice ID appended. When someone scans the QR, they land on a page that confirms the invoice is genuine." />
        <Field label="Verification base URL" hint="The QR encodes `{base URL}/{invoice id}`">
          <Input
            value={form.qr_verify_base_url}
            onChange={(e) => set('qr_verify_base_url', e.target.value)}
            placeholder="https://calistaconcept.eu/invoice/verify"
            className="font-mono text-sm"
          />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save invoice settings'}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Design settings panel — platform logo URLs per theme               */
/* ------------------------------------------------------------------ */
function DesignSettingsPanel() {
  const { push } = useToast()
  const { data, loading } = useAsync(async () => db.getDesignSettings(), [])
  const [form, setForm] = useState<DesignSettings>(DEFAULT_DESIGN_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  async function save() {
    setSaving(true)
    try {
      await db.updateDesignSettings({
        logo_url_light: form.logo_url_light,
        logo_url_dark: form.logo_url_dark,
      })
      push({ tone: 'success', title: 'Design settings saved', desc: 'Logo will update across the platform.' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Logo" desc="Set the logo image URL for each theme. Shown in the sidebar (top-left), on the login page, and in printed documents. Paste an SVG or PNG URL — the platform fetches it at runtime, no upload needed." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Light mode logo */}
          <div>
            <Field label="Logo URL — light mode" hint="Shown when light mode is active">
              <Input
                value={form.logo_url_light}
                onChange={(e) => setForm((f) => ({ ...f, logo_url_light: e.target.value }))}
                placeholder="https://… (defaults to Calista logo)"
              />
            </Field>
            {form.logo_url_light && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <img src={form.logo_url_light} alt="Light logo preview" className="h-8 w-auto" />
                <span className="text-2xs text-ink-400">Preview (light mode)</span>
              </div>
            )}
          </div>
          {/* Dark mode logo */}
          <div>
            <Field label="Logo URL — dark mode" hint="Shown when dark mode is active">
              <Input
                value={form.logo_url_dark}
                onChange={(e) => setForm((f) => ({ ...f, logo_url_dark: e.target.value }))}
                placeholder="https://… (defaults to Calista logo)"
              />
            </Field>
            {form.logo_url_dark && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-ink-900 px-3 py-2">
                <img src={form.logo_url_dark} alt="Dark logo preview" className="h-8 w-auto" />
                <span className="text-2xs text-ink-400">Preview (dark mode)</span>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-2xs text-ink-400">
          Leave blank to use the default Calista Concept logo. SVG is recommended for crisp rendering at any size.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save design settings'}
        </Button>
      </div>
    </div>
  )
}
