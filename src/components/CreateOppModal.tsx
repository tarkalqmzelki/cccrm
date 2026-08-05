import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Building2, AlertTriangle, Check, Plus, ChevronRight, Network } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Select, Field, Textarea } from './ui/Input'
import { Badge } from './ui/Badge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import type { Company, ServiceItem, Opportunity, OppStatus } from '../lib/types'

type Step = 'company' | 'details'

export function CreateOppModal({
  open, onClose, onSaved, presetCompany,
}: {
  open: boolean
  onClose: () => void
  onSaved: (oppId: string) => void
  presetCompany?: Company
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const [step, setStep] = useState<Step>('company')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(presetCompany || null)
  const [searching, setSearching] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // New company fields
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyVat, setCompanyVat] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')
  const [companyLogo, setCompanyLogo] = useState('')

  // Opportunity fields
  const [services, setServices] = useState<ServiceItem[]>([])
  const [serviceId, setServiceId] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [estRevenue, setEstRevenue] = useState('0')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Existing opps for duplicate detection
  const [existingOpps, setExistingOpps] = useState<Opportunity[]>([])

  useEffect(() => {
    if (open) {
      setStep(presetCompany ? 'details' : 'company')
      setSelected(presetCompany || null)
      setSearch(''); setResults([]); setShowNew(false)
      setCompanyName(''); setCompanyWebsite(''); setCompanyVat(''); setCompanyIndustry(''); setCompanyLogo('')
      setTitle(''); setPriority('medium'); setEstRevenue('0'); setNotes('')
      db.listServices().then(setServices)
    }
  }, [open, presetCompany])

  // Debounced search
  useEffect(() => {
    if (!open || step !== 'company' || presetCompany) return
    const q = search.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await db.searchCompanies(q)
        setResults(r)
      } catch { setResults([]) }
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [search, open, step, presetCompany])

  // When company selected, check existing opps for duplicate detection
  useEffect(() => {
    if (selected) {
      db.listOpportunitiesByCompany(selected.id).then(setExistingOpps)
    }
  }, [selected])

  async function createCompanyAndProceed() {
    if (!companyName.trim()) { push({ tone: 'error', title: 'Company name required' }); return }
    setSaving(true)
    try {
      const domain = (companyWebsite || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      const c = await db.createCompany({ name: companyName, website: companyWebsite, domain, vat_number: companyVat, industry: companyIndustry, logo_url: companyLogo })
      setSelected(c)
      setStep('details')
      push({ tone: 'success', title: 'Company created' })
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not create company', desc: e?.message })
    } finally { setSaving(false) }
  }

  async function save() {
    if (!selected || !serviceId || !user) { push({ tone: 'error', title: 'Company and service required' }); return }
    setSaving(true)
    try {
      const opp = await db.createOpp({
        company_id: selected.id, service_id: serviceId, owner_id: user.id,
        title: title || services.find((s) => s.id === serviceId)?.name || '',
        priority: priority as 'low' | 'medium' | 'high',
        est_revenue: Number(estRevenue) || 0, notes,
      })
      push({ tone: 'success', title: 'Opportunity created' })
      onSaved(opp.id)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not create', desc: e?.message })
    } finally { setSaving(false) }
  }

  // Check for duplicate service
  const selectedService = services.find((s) => s.id === serviceId)
  const duplicateService = selectedService ? existingOpps.find((o) => o.service_id === serviceId) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Opportunity"
      desc="Search for a company, then create the opportunity."
      size="lg"
      footer={
        step === 'company' ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={createCompanyAndProceed} disabled={saving || !companyName.trim()} icon={<Plus size={15} strokeWidth={1.75} />}>Create company</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => { setStep('company'); setSelected(null) }}>Back</Button>
            <Button onClick={save} disabled={saving || !serviceId} icon={<Check size={15} strokeWidth={1.75} />}>Create opportunity</Button>
          </>
        )
      }
    >
      {/* Step 1: Company search */}
      {step === 'company' && (
        <div className="space-y-4">
          {selected ? (
            <div className="rounded-xl border border-ink p-3 flex items-center gap-3">
              <Building2 size={20} strokeWidth={1.75} className="text-ink" />
              <div className="flex-1">
                <p className="text-sm font-medium">{selected.name}</p>
                <p className="text-2xs text-ink-400">{selected.website || selected.domain}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => { setSelected(null); setShowNew(false) }}>Change</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, website, domain, VAT…" className="pl-9" autoFocus />
              </div>

              {searching && <p className="text-2xs text-ink-400">Searching…</p>}

              {results.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {results.map((c) => (
                    <button key={c.id} onClick={() => { setSelected(c); setStep('details') }}
                      className="flex w-full items-center gap-3 rounded-xl border border-line p-3 hover:border-ink-200 transition-colors text-left"
                    >
                      <Building2 size={18} strokeWidth={1.75} className="text-ink-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-2xs text-ink-400 truncate">{c.website || c.domain}</p>
                      </div>
                      <ChevronRight size={16} strokeWidth={1.75} className="text-ink-300" />
                    </button>
                  ))}
                </div>
              )}

              {!showNew && results.length === 0 && search.length >= 2 && !searching && (
                <button onClick={() => { setShowNew(true); setCompanyName(search) }}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line p-3 hover:border-ink-200 transition-colors text-sm text-ink-500"
                >
                  <Plus size={16} strokeWidth={1.75} /> Create "{search}" as a new company
                </button>
              )}

              {showNew && (
                <div className="space-y-3 rounded-xl border border-line p-4">
                  <Field label="Company name" required>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Microsoft" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Website"><Input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="microsoft.com" /></Field>
                    <Field label="VAT number"><Input value={companyVat} onChange={(e) => setCompanyVat(e.target.value)} placeholder="IT12345678901" /></Field>
                  </div>
                  <Field label="Industry"><Input value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} placeholder="Technology" /></Field>
                  <Field label="Logo URL" hint="Optional — paste an image URL">
                    <Input value={companyLogo} onChange={(e) => setCompanyLogo(e.target.value)} placeholder="https://…" />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Opportunity details */}
      {step === 'details' && selected && (
        <div className="space-y-4">
          {/* Selected company */}
          <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
            <Building2 size={18} strokeWidth={1.75} className="text-ink" />
            <div className="flex-1">
              <p className="text-sm font-medium">{selected.name}</p>
              <p className="text-2xs text-ink-400">{selected.website || selected.domain || 'No website'}</p>
            </div>
          </div>

          {/* Existing opportunities (duplicate detection) */}
          {existingOpps.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="text-2xs font-medium text-ink-500 mb-2">Existing opportunities at {selected.name}:</p>
              <div className="space-y-1">
                {existingOpps.map((o) => {
                  const svc = services.find((s) => s.id === o.service_id)
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <Network size={13} strokeWidth={1.75} className="text-ink-400" />
                      <span className="flex-1 truncate">{o.title || svc?.name || 'Opportunity'}</span>
                      <Badge tone="neutral">{svc?.name}</Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Service" required>
              <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Select…</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_custom ? ' (custom)' : ''}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>

          {/* Duplicate warning */}
          <AnimatePresence>
            {duplicateService && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warnBg p-3"
              >
                <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 text-warn shrink-0" />
                <div>
                  <p className="text-sm font-medium text-warn">Duplicate service detected</p>
                  <p className="text-2xs text-warn">An opportunity for {selectedService?.name} already exists at {selected.name}. You can still proceed — this is advisory only, for team coordination.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Field label="Title" hint="Optional — defaults to service name">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website Development" />
          </Field>

          <Field label="Estimated revenue (€)">
            <Input type="number" min={0} value={estRevenue} onChange={(e) => setEstRevenue(e.target.value)} placeholder="25000" />
          </Field>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Initial context…" />
          </Field>
        </div>
      )}
    </Modal>
  )
}
