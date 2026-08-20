import { useEffect, useMemo, useState } from 'react'
import { Save, Copy, RefreshCw, Braces, Building2, UserRound, X } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Field, Textarea, Select } from './ui/Input'
import { DateTimePicker } from './ui/DateTimePicker'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import {
  CONTRACT_STATUS_META,
  CONTRACT_STATUSES,
} from '../lib/types'
import type { Contract, ContractStatus, ContractTemplate, InvoiceSettings, CustomPlaceholderDef, Company, Contact, ContractTemplateVariant } from '../lib/types'
import { parseContractNotes, serializeContractNotes, type CustomFields } from '../lib/contractExtras'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Contract | null
  templates: ContractTemplate[]
  issuerSettings: InvoiceSettings | null
}

export function ContractEditor({ open, onClose, onSaved, editing, templates, issuerSettings }: Props) {
  const { push } = useToast()
  const isEdit = !!editing

  // --- Source: existing lead vs custom ---
  const [sourceMode, setSourceMode] = useState<'lead' | 'custom'>('custom')
  const [companies, setCompanies] = useState<Company[]>([])
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, Contact[]>>({})
  const [leadPickerOpen, setLeadPickerOpen] = useState(false)
  const [pickedCompanyId, setPickedCompanyId] = useState('')
  const [pickedContactId, setPickedContactId] = useState('')

  const [number, setNumber] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [status, setStatus] = useState<ContractStatus>('draft')
  const [cpName, setCpName] = useState('')
  const [cpCompany, setCpCompany] = useState('')
  const [cpAddress, setCpAddress] = useState('')
  const [cpPhone, setCpPhone] = useState('')
  const [cpEmail, setCpEmail] = useState('')
  const [cpVat, setCpVat] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [customFields, setCustomFields] = useState<CustomFields>({})
  // Load language variants for the selected template
  const [variants, setVariants] = useState<ContractTemplateVariant[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!templateId) { setVariants([]); setSelectedVariantId(''); return }
    db.listContractVariants(templateId).then(setVariants).catch(() => setVariants([]))
    setSelectedVariantId('')
  }, [templateId])

  // When a template or variant is selected, swap the body + custom
  // placeholders that get rendered.  The "template" prop passed to
  // FormalContractDocument should reflect the chosen language.
  const effectiveTemplate = useMemo<ContractTemplate | null>(() => {
    const base = templates.find((t) => t.id === templateId) || null
    if (!base) return null
    if (!selectedVariantId) return base
    const variant = variants.find((v) => v.id === selectedVariantId)
    if (!variant) return base
    return {
      ...base,
      body: variant.body,
      custom_placeholders: variant.custom_placeholders ?? [],
    }
  }, [templateId, templates, variants, selectedVariantId])

  // Load companies (and lazily their contacts) for the lead picker.
  useEffect(() => {
    if (!open) return
    db.listCompanies().then(setCompanies).catch(() => setCompanies([]))
  }, [open])

  /** Auto-fill the counterparty fields from a picked company + contact. */
  function applyLead(companyId: string, contactId: string) {
    const company = companies.find((c) => c.id === companyId)
    if (!company) return
    setPickedCompanyId(companyId)
    setPickedContactId(contactId)
    setSourceMode('lead')
    setCpCompany(company.name)
    setCpAddress(company.address || '')
    setCpVat(company.vat_number || '')
    // Contact fields — use the selected contact when present, else
    // fall back to the company's first contact, else blank.
    const contacts = contactsByCompany[companyId]
    if (contacts && contacts.length > 0) {
      const contact = contacts.find((c) => c.id === contactId) || contacts[0]
      setCpName(contact.full_name || '')
      setCpPhone(contact.phone || '')
      setCpEmail(contact.email || '')
    } else {
      // Load contacts for this company then fill
      db.listContacts(companyId).then((list) => {
        setContactsByCompany((cur) => ({ ...cur, [companyId]: list }))
        const contact = contactId ? list.find((c) => c.id === contactId) : list[0]
        if (contact) {
          setCpName(contact.full_name || '')
          setCpPhone(contact.phone || '')
          setCpEmail(contact.email || '')
        }
      }).catch(() => {})
    }
  }

  /** When the contact dropdown changes, re-apply just the person fields. */
  function applyContact(contactId: string) {
    const contacts = contactsByCompany[pickedCompanyId] || []
    const contact = contacts.find((c) => c.id === contactId)
    setPickedContactId(contactId)
    if (contact) {
      setCpName(contact.full_name || '')
      setCpPhone(contact.phone || '')
      setCpEmail(contact.email || '')
    }
  }

  useEffect(() => {
    if (!open) return
    if (editing) {
      setSourceMode('custom')  // editing an existing contract — fields as saved
      setPickedCompanyId('')
      setPickedContactId('')
      setNumber(editing.number)
      setTemplateId(editing.template_id ?? '')
      setStatus(editing.status)
      setCpName(editing.counterparty_name)
      setCpCompany(editing.counterparty_company)
      setCpAddress(editing.counterparty_address)
      setCpPhone(editing.counterparty_phone)
      setCpEmail(editing.counterparty_email)
      setCpVat(editing.counterparty_vat)
      setIssueDate(editing.issue_date)
      setStartDate(editing.start_date ?? '')
      setEndDate(editing.end_date ?? '')
      // Parse notes → freeform + custom_fields
      const extras = parseContractNotes(editing.notes)
      setNotes(extras.freeform)
      setCustomFields(extras.custom_fields)
    } else {
      setSourceMode('custom')
      setPickedCompanyId('')
      setPickedContactId('')
      setNumber(db.randomContractNumber())
      setTemplateId(templates[0]?.id ?? '')
      setStatus('draft')
      setCpName(''); setCpCompany(''); setCpAddress(''); setCpPhone(''); setCpEmail(''); setCpVat('')
      setIssueDate(new Date().toISOString().slice(0, 10))
      setStartDate(''); setEndDate('')
      setNotes('')
      setCustomFields({})
    }
  }, [open, editing, templates])

  async function save() {
    if (!cpName.trim()) { push({ tone: 'error', title: 'Counterparty name is required' }); return }
    if (!number.trim()) { push({ tone: 'error', title: 'Contract number is required' }); return }
    setSaving(true)
    try {
      const payload = {
        number,
        template_id: templateId || null,
        status,
        counterparty_name: cpName.trim(),
        counterparty_company: cpCompany.trim(),
        counterparty_address: cpAddress.trim(),
        counterparty_phone: cpPhone.trim(),
        counterparty_email: cpEmail.trim(),
        counterparty_vat: cpVat.trim(),
        issue_date: issueDate,
        start_date: startDate || null,
        end_date: endDate || null,
        notes: serializeContractNotes(notes.trim(), customFields),
      }
      if (editing) {
        await db.updateContract(editing.id, payload)
        push({ tone: 'success', title: 'Contract updated' })
      } else {
        const c = await db.createContract(payload)
        push({ tone: 'success', title: 'Contract created', desc: c.number })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  const selectedTemplate = effectiveTemplate

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit contract ${editing?.number ?? ''}` : 'New contract'}
      desc={isEdit ? 'Update contract details.' : 'Generate a new contract. Pick a template, fill in the counterparty, and print.'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Generate contract'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ============================================================ */}
        {/* SOURCE — pick an existing lead (auto-fill) or go custom       */}
        {/* ============================================================ */}
        {!isEdit && (
          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">Contract source</p>
            {/* Mode toggle */}
            <div className="mb-3 flex gap-1 rounded-xl border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => { setSourceMode('lead'); if (!pickedCompanyId) setLeadPickerOpen(true) }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${sourceMode === 'lead' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}
              >
                <Building2 size={14} strokeWidth={1.75} /> From existing lead
              </button>
              <button
                type="button"
                onClick={() => { setSourceMode('custom'); setPickedCompanyId(''); setPickedContactId('') }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${sourceMode === 'custom' ? 'bg-ink text-white' : 'text-ink-500 hover:text-ink'}`}
              >
                <UserRound size={14} strokeWidth={1.75} /> Custom
              </button>
            </div>

            {sourceMode === 'lead' && (
              <div className="space-y-2">
                {/* Company picker trigger */}
                <button
                  type="button"
                  onClick={() => setLeadPickerOpen(true)}
                  className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
                >
                  {pickedCompanyId ? (
                    <>
                      <Building2 size={15} strokeWidth={1.75} className="shrink-0 text-ink-400" />
                      <span className="flex-1 truncate text-left">{companies.find((c) => c.id === pickedCompanyId)?.name}</span>
                      {(contactsByCompany[pickedCompanyId] || []).length > 1 && (
                        <span className="text-2xs text-ink-400">{(contactsByCompany[pickedCompanyId] || []).length} contacts</span>
                      )}
                    </>
                  ) : (
                    <>
                      <Building2 size={15} strokeWidth={1.75} className="shrink-0 text-ink-400" />
                      <span className="flex-1 text-left text-ink-400">Search a lead to auto-fill the contract…</span>
                    </>
                  )}
                </button>

                {/* Contact dropdown — when the company has multiple contacts */}
                {pickedCompanyId && (contactsByCompany[pickedCompanyId] || []).length > 1 && (
                  <Select value={pickedContactId} onChange={(e) => applyContact(e.target.value)}>
                    {(contactsByCompany[pickedCompanyId] || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}{c.role ? ` · ${c.role}` : ''}{c.email ? ` · ${c.email}` : ''}
                      </option>
                    ))}
                  </Select>
                )}

                <p className="text-2xs text-ink-400">
                  Picking a lead fills the company name, address, VAT, and contact details below. You can still edit them.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Contract number" required>
            <div className="flex gap-1.5">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono text-sm" />
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setNumber(db.randomContractNumber())}
                  title="Generate new random number"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-ink-50 text-ink-500 hover:bg-ink-100"
                >
                  <RefreshCw size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </Field>
          <Field label="Template" hint="Fetches the contract text">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— No template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {templateId && variants.length > 0 && (
            <Field label="Language" hint="Translated version">
              <Select value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)}>
                <option value="">Default (English)</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.language_label || v.language}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
              {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{CONTRACT_STATUS_META[s].label}</option>)}
            </Select>
          </Field>
        </div>

        {/* Template preview hint */}
        {selectedTemplate && (
          <div className="rounded-xl border border-info/30 bg-infoBg/30 px-3 py-2 text-2xs text-ink-600">
            Using template <strong>{selectedTemplate.name}</strong>. The contract text will be filled with the counterparty data below when printed.
          </div>
        )}

        {/* Custom fields — from the selected template's custom_placeholders.
            The admin fills in per-contract values (e.g. {payable} = 500)
            that get injected into the template body when printed. */}
        {selectedTemplate && selectedTemplate.custom_placeholders && selectedTemplate.custom_placeholders.length > 0 && (
          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center gap-2">
              <Braces size={14} strokeWidth={1.75} className="text-ink-600" />
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-400">Custom fields for this contract</p>
            </div>
            <p className="mb-3 text-2xs text-ink-400">
              These values fill the template's custom placeholders. Leave blank to keep the placeholder as-is in the printed text.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {selectedTemplate.custom_placeholders.map((ph) => (
                <Field key={ph.key} label={ph.label}>
                  {ph.type === 'textarea' ? (
                    <Textarea
                      value={customFields[ph.key] ?? ''}
                      onChange={(e) => setCustomFields((cur) => ({ ...cur, [ph.key]: e.target.value }))}
                      rows={2}
                      placeholder={`Enter ${ph.label.toLowerCase()}`}
                    />
                  ) : ph.type === 'date' ? (
                    <DateTimePicker
                      value={customFields[ph.key] ?? ''}
                      onChange={(v) => setCustomFields((cur) => ({ ...cur, [ph.key]: v }))}
                      outputIso={false}
                      dateOnly
                    />
                  ) : (
                    <Input
                      type={ph.type === 'number' ? 'number' : 'text'}
                      value={customFields[ph.key] ?? ''}
                      onChange={(e) => setCustomFields((cur) => ({ ...cur, [ph.key]: e.target.value }))}
                      placeholder={`Enter ${ph.label.toLowerCase()}`}
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        )}

        {/* Counterparty */}
        <div className="rounded-xl border border-line p-4">
          <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">Counterparty — who is the contact with</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact person name" required>
              <Input value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="Sofia Marchetti" />
            </Field>
            <Field label="Company / organisation">
              <Input value={cpCompany} onChange={(e) => setCpCompany(e.target.value)} placeholder="Acme S.r.l." />
            </Field>
            <Field label="Address">
              <Input value={cpAddress} onChange={(e) => setCpAddress(e.target.value)} placeholder="Via Roma 12, Milano" />
            </Field>
            <Field label="Phone">
              <Input value={cpPhone} onChange={(e) => setCpPhone(e.target.value)} placeholder="+39 333 1122334" />
            </Field>
            <Field label="Email">
              <Input type="email" value={cpEmail} onChange={(e) => setCpEmail(e.target.value)} placeholder="contact@acme.com" />
            </Field>
            <Field label="VAT / ID number">
              <Input value={cpVat} onChange={(e) => setCpVat(e.target.value)} placeholder="IT12345678901" />
            </Field>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Issue date" required>
            <DateTimePicker value={issueDate} onChange={(v) => setIssueDate(v)} outputIso={false} dateOnly />
          </Field>
          <Field label="Start date" hint="Optional">
            <DateTimePicker value={startDate} onChange={(v) => setStartDate(v)} outputIso={false} dateOnly />
          </Field>
          <Field label="End date" hint="Optional">
            <DateTimePicker value={endDate} onChange={(v) => setEndDate(v)} outputIso={false} dateOnly />
          </Field>
        </div>

        {/* Notes */}
        <Field label="Notes" hint="Optional — internal notes, not printed">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal context about this contract…" />
        </Field>
      </div>

      {/* Lead picker — searchable modal of companies */}
      <LeadPickerModal
        open={leadPickerOpen}
        onClose={() => setLeadPickerOpen(false)}
        companies={companies}
        onPick={(companyId) => {
          applyLead(companyId, '')
          setLeadPickerOpen(false)
        }}
      />
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Lead picker — searchable list of companies (leads)                  */
/* ------------------------------------------------------------------ */
function LeadPickerModal({
  open, onClose, companies, onPick,
}: {
  open: boolean
  onClose: () => void
  companies: Company[]
  onPick: (companyId: string) => void
}) {
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const query = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return companies
    return companies.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      (c.website || '').toLowerCase().includes(query) ||
      (c.domain || '').toLowerCase().includes(query) ||
      (c.industry || '').toLowerCase().includes(query)
    )
  }, [companies, query])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pick a lead"
      desc="Search by company name, website, or industry. The contract will be auto-filled with the lead's data."
      size="md"
      backdrop="strong"
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads…"
            className="h-10 w-full rounded-xl border border-line bg-ink-50/60 px-3 pr-9 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink">
              <X size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1 -mr-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Building2 size={22} strokeWidth={1.75} className="text-ink-300" />
              <p className="text-sm text-ink-400">No leads match "{q}"</p>
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-ink-50"
              >
                {c.logo_url ? (
                  <img src={c.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-50 text-ink-500 shrink-0">
                    <Building2 size={15} strokeWidth={1.75} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="truncate text-2xs text-ink-400">
                    {[c.industry, c.website].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
