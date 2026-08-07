import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Building2, AlertTriangle, Check, Plus, ChevronRight, Network, UserPlus } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Select, Field, Textarea } from './ui/Input'
import { Badge } from './ui/Badge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import type { Company, ServiceItem, Opportunity } from '../lib/types'

type Mode = 'new_lead' | 'new_offer'

export function CreateOppModal({
  open, onClose, onSaved, presetCompany,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  presetCompany?: Company
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const mode: Mode = presetCompany ? 'new_offer' : 'new_lead'

  // New lead = create company + contact + summary in one step
  // New offer = create offer for existing company

  // Company fields
  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyVat, setCompanyVat] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')
  const [companyLogo, setCompanyLogo] = useState('')
  const [summary, setSummary] = useState('')

  // Contact fields (for new lead)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactRole, setContactRole] = useState('')

  // Offer fields (for new offer)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [serviceId, setServiceId] = useState('')
  const [customService, setCustomService] = useState('')
  const [title, setTitle] = useState('')
  const [offerValue, setOfferValue] = useState('0')
  const [offerDescription, setOfferDescription] = useState('')
  const [notes, setNotes] = useState('')

  // Existing offers for duplicate detection
  const [existingOpps, setExistingOpps] = useState<Opportunity[]>([])

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setCompanyName(''); setCompanyWebsite(''); setCompanyVat(''); setCompanyIndustry(''); setCompanyLogo('')
      setSummary(''); setContactName(''); setContactEmail(''); setContactPhone(''); setContactRole('')
      setTitle(''); setOfferValue('0'); setOfferDescription(''); setNotes('')
      setServiceId(''); setCustomService('')
      db.listServices().then(setServices)
      if (presetCompany) {
        db.listOpportunitiesByCompany(presetCompany.id).then(setExistingOpps)
      }
    }
  }, [open, presetCompany])

  const isOtherService = serviceId === '__other__'
  const effectiveServiceName = isOtherService ? customService : services.find((s) => s.id === serviceId)?.name || ''

  // Create a new lead: company + summary + contact
  async function createNewLead() {
    if (!companyName.trim()) { push({ tone: 'error', title: 'Company name required' }); return }
    if (!summary.trim()) { push({ tone: 'error', title: 'Summary required', desc: 'Please describe what happened during the call.' }); return }
    if (!user) return
    setSaving(true)
    try {
      const domain = (companyWebsite || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      const c = await db.createCompany({ name: companyName, website: companyWebsite, domain, vat_number: companyVat, industry: companyIndustry, logo_url: companyLogo, summary, created_by: user.id })

      // Create contact if any field is filled
      if (contactName.trim() || contactEmail.trim() || contactPhone.trim()) {
        await db.createContact({ company_id: c.id, full_name: contactName, email: contactEmail, phone: contactPhone, role: contactRole, created_by: user.id })
      }

      push({ tone: 'success', title: 'Lead created' })
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not create lead', desc: e?.message })
    } finally { setSaving(false) }
  }

  // Create a new offer for existing company
  async function createNewOffer() {
    if (!presetCompany || !user) return
    if (!serviceId) { push({ tone: 'error', title: 'Service required' }); return }
    if (isOtherService && !customService.trim()) { push({ tone: 'error', title: 'Please specify the service' }); return }

    setSaving(true)
    try {
      let finalServiceId = serviceId
      if (isOtherService && customService.trim()) {
        const slug = customService.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        try {
          const svc = await db.createService(customService.trim(), slug)
          finalServiceId = svc.id
        } catch {
          const allServices = await db.listServices()
          const existing = allServices.find((s) => s.slug === slug)
          if (existing) finalServiceId = existing.id
          else throw new Error('Could not create service')
        }
      }

      await db.createOpp({
        company_id: presetCompany.id, service_id: finalServiceId, owner_id: user.id,
        title: title || effectiveServiceName || '',
        offer_value: Number(offerValue) || 0,
        offer_description: offerDescription,
        notes,
      })
      push({ tone: 'success', title: 'Offer created' })
      onSaved()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not create offer', desc: e?.message })
    } finally { setSaving(false) }
  }

  const selectedService = services.find((s) => s.id === serviceId)
  const duplicateService = selectedService ? existingOpps.find((o) => o.service_id === serviceId) : null

  const canSave = mode === 'new_lead'
    ? companyName.trim() && summary.trim()
    : serviceId && (!isOtherService || customService.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'new_lead' ? 'New Lead' : 'New Offer'}
      desc={mode === 'new_lead' ? 'Add a company, the cold call summary, and contact details.' : `Add a new offer for ${presetCompany?.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={mode === 'new_lead' ? createNewLead : createNewOffer} disabled={saving || !canSave} icon={<Check size={15} strokeWidth={1.75} />}>
            {saving ? 'Creating…' : mode === 'new_lead' ? 'Create lead' : 'Create offer'}
          </Button>
        </>
      }
    >
      {mode === 'new_lead' ? (
        /* ---- NEW LEAD: company + summary + contact ---- */
        <div className="space-y-4">
          <Field label="Company name" required>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Microsoft" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Website"><Input value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="microsoft.com" /></Field>
            <Field label="VAT number"><Input value={companyVat} onChange={(e) => setCompanyVat(e.target.value)} placeholder="IT12345678901" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Industry"><Input value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} placeholder="Technology" /></Field>
            <Field label="Logo URL" hint="Optional"><Input value={companyLogo} onChange={(e) => setCompanyLogo(e.target.value)} placeholder="https://…" /></Field>
          </div>

          <Field label="Cold Call Summary" required hint="Describe what happened during the call. This will be public.">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="Spoke with the receptionist, they showed interest in our website services…" />
          </Field>

          {/* Contact section */}
          <div className="rounded-xl border border-line p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={16} strokeWidth={1.75} className="text-ink-400" />
              <p className="text-sm font-medium">Contact (optional)</p>
            </div>
            <p className="text-2xs text-ink-400">Who did you speak with during the cold call?</p>
            <Field label="Full name"><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Camille Faure" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email"><Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@company.com" /></Field>
              <Field label="Phone"><Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+33 1 4020 3040" /></Field>
            </div>
            <Field label="Role"><Input value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="CEO / CTO" /></Field>
          </div>
        </div>
      ) : (
        /* ---- NEW OFFER: offer details for existing company ---- */
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
            <Building2 size={18} strokeWidth={1.75} className="text-ink" />
            <div className="flex-1">
              <p className="text-sm font-medium">{presetCompany?.name}</p>
              <p className="text-2xs text-ink-400">{presetCompany?.website || presetCompany?.domain || 'No website'}</p>
            </div>
          </div>

          {/* Existing offers (duplicate detection) */}
          {existingOpps.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="text-2xs font-medium text-ink-500 mb-2">Existing offers at {presetCompany?.name}:</p>
              <div className="space-y-1">
                {existingOpps.map((o) => {
                  const svc = services.find((s) => s.id === o.service_id)
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <Network size={13} strokeWidth={1.75} className="text-ink-400" />
                      <span className="flex-1 truncate">{o.title || svc?.name || 'Offer'}</span>
                      <Badge tone="neutral">{svc?.name}</Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <Field label="Service" required>
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Select…</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_custom ? ' (custom)' : ''}</option>)}
              <option value="__other__">Other…</option>
            </Select>
          </Field>

          {isOtherService && (
            <Field label="Specify service" required>
              <Input value={customService} onChange={(e) => setCustomService(e.target.value)} placeholder="e.g. Brand Design" autoFocus />
            </Field>
          )}

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
                  <p className="text-2xs text-warn">An offer for {selectedService?.name} already exists at {presetCompany?.name}. You can still proceed — this is advisory only.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Field label="Title" hint="Optional — defaults to service name">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website Development" />
          </Field>

          <Field label="Offer value (€)" hint="The value of the offer">
            <Input type="number" min={0} value={offerValue} onChange={(e) => setOfferValue(e.target.value)} placeholder="25000" />
          </Field>

          <Field label="Offer description" hint="What is being offered to the client">
            <Textarea value={offerDescription} onChange={(e) => setOfferDescription(e.target.value)} rows={2} placeholder="Website development with CMS integration…" />
          </Field>

          <Field label="Notes" hint="Private notes for this offer">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Internal context…" />
          </Field>
        </div>
      )}
    </Modal>
  )
}
