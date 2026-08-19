import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, Copy, ChevronDown, Truck, FileText, Building, QrCode, Scale, PenLine, Layers } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input, Field, Textarea, Select } from './ui/Input'
import { DateTimePicker } from './ui/DateTimePicker'
import { ServiceCombobox } from './ui/ServiceCombobox'
import { useToast } from '../context/ToastContext'
import { db } from '../lib/db'
import {
  INVOICE_SERVICE_CATALOG,
  INVOICE_STATUS_META,
  INVOICE_STATUSES,
} from '../lib/types'
import type { Invoice, InvoiceService, InvoiceStatus, InvoiceSettings } from '../lib/types'
import {
  DEFAULT_EXTRAS, DOCUMENT_TYPES, SECONDARY_SECTION_TYPES,
  parseInvoiceNotes, serializeInvoiceNotes, defaultQrPayload,
  type InvoiceExtras, type ShipTo, type InvoiceReferences, type BankDetails, type SecondarySection,
} from '../lib/invoiceExtras'
import { eurFull } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Invoice | null
  nextNumber?: string
}

interface LineItem {
  id?: string
  name: string
  description: string
  quantity: number
  unit_price: number
}

/** Each optional section in the editor has a "show" toggle + a collapsible
 *  body.  The toggles default to off so a simple invoice stays simple. */
interface OptionalSectionState {
  shipTo: boolean
  references: boolean
  bank: boolean
  qr: boolean
  legal: boolean
  signatures: boolean
  secondary: boolean
}

export function InvoiceEditor({ open, onClose, onSaved, editing, nextNumber }: Props) {
  const { push } = useToast()
  const isEdit = !!editing

  // --- Core invoice fields (existing schema) ---
  const [number, setNumber] = useState('')
  const [billedTo, setBilledTo] = useState('')
  const [billedAddress, setBilledAddress] = useState('')
  const [billedEmail, setBilledEmail] = useState('')
  const [billedVat, setBilledVat] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<InvoiceStatus>('draft')
  const [vatIncluded, setVatIncluded] = useState(false)
  const [vatPct, setVatPct] = useState('0')
  const [freeformNotes, setFreeformNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [saving, setSaving] = useState(false)

  // --- Optional extras (stored in notes as JSON) ---
  const [extras, setExtras] = useState<InvoiceExtras>({ ...DEFAULT_EXTRAS })
  const [showSection, setShowSection] = useState<OptionalSectionState>({
    shipTo: false, references: false, bank: false, qr: false,
    legal: false, signatures: false, secondary: false,
  })
  // Issuer identity (loaded from invoice_settings once on mount) —
  // used to prefill new invoices with the admin's saved templates.
  const [issuerSettings, setIssuerSettings] = useState<InvoiceSettings | null>(null)
  useEffect(() => {
    db.getInvoiceSettings().then(setIssuerSettings).catch(() => {})
  }, [])

  // Helper to build the default QR payload from settings
  function buildQrPayload(inv?: Invoice): string {
    if (inv) return `${issuerSettings?.qr_verify_base_url ?? 'https://calistaconcept.eu/invoice/verify'}/${inv.id}`
    return issuerSettings?.qr_verify_base_url ?? 'https://calistaconcept.eu/invoice/verify'
  }

  useEffect(() => {
    if (!open) return
    if (editing) {
      setNumber(editing.number)
      setBilledTo(editing.billed_to)
      setBilledAddress(editing.billed_address)
      setBilledEmail(editing.billed_email)
      setBilledVat(editing.billed_vat)
      setIssueDate(editing.issue_date)
      setDueDate(editing.due_date ?? '')
      setStatus(editing.status)
      setVatIncluded(editing.vat_included)
      setVatPct(String(editing.vat_pct))
      // Parse notes → freeform + extras
      const { freeform, extras: parsed } = parseInvoiceNotes(editing.notes)
      setFreeformNotes(freeform)
      setExtras({ ...DEFAULT_EXTRAS, ...parsed })
      // Auto-open any section that has data so the admin sees it
      setShowSection({
        shipTo: parsed.ship_to !== null,
        references: parsed.references !== null,
        bank: parsed.bank !== null,
        qr: parsed.qr_enabled,
        legal: parsed.legal_notes.trim() !== '',
        signatures: parsed.signature_issued_by.trim() !== '',
        secondary: parsed.secondary_section !== null,
      })
      db.listInvoiceServices(editing.id).then((svcs) => {
        setItems(svcs.map((s) => ({
          id: s.id, name: s.name, description: s.description,
          quantity: Number(s.quantity), unit_price: Number(s.unit_price),
        })))
      }).catch((e) => push({ tone: 'error', title: 'Could not load services', desc: e?.message }))
    } else {
      setNumber(nextNumber ?? '')
      setBilledTo(''); setBilledAddress(''); setBilledEmail(''); setBilledVat('')
      setIssueDate(new Date().toISOString().slice(0, 10))
      setDueDate('')
      setStatus('draft')
      setVatIncluded(false); setVatPct('0')
      setFreeformNotes('')
      setItems([{ name: '', description: '', quantity: 1, unit_price: 0 }])
      // Prefill optional sections from the saved invoice settings so
      // the admin doesn't retype bank/legal/signature on every invoice.
      const prefilledExtras: InvoiceExtras = { ...DEFAULT_EXTRAS }
      if (issuerSettings) {
        if (issuerSettings.default_bank) prefilledExtras.bank = issuerSettings.default_bank
        if (issuerSettings.default_legal_notes) prefilledExtras.legal_notes = issuerSettings.default_legal_notes
        if (issuerSettings.default_signature_name) prefilledExtras.signature_issued_by = issuerSettings.default_signature_name
        if (issuerSettings.default_payment_terms) prefilledExtras.payment_terms = issuerSettings.default_payment_terms
      }
      setExtras(prefilledExtras)
      // Auto-open the prefilled sections so the admin sees what's been
      // carried over from the settings.
      setShowSection({
        shipTo: false,
        references: false,
        bank: !!prefilledExtras.bank,
        qr: false,  // admin opts in per invoice
        legal: !!prefilledExtras.legal_notes,
        signatures: !!prefilledExtras.signature_issued_by,
        secondary: false,
      })
    }
  }, [open, editing, nextNumber, issuerSettings])

  const subtotal = useMemo(
    () => items.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0),
    [items],
  )
  const vatAmount = vatIncluded ? 0 : subtotal * (Number(vatPct || 0) / 100)
  const total = vatIncluded ? subtotal : subtotal + vatAmount

  function addItem() {
    setItems((cur) => [...cur, { name: '', description: '', quantity: 1, unit_price: 0 }])
  }
  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx))
  }

  function patchExtras(patch: Partial<InvoiceExtras>) {
    setExtras((cur) => ({ ...cur, ...patch }))
  }

  async function save() {
    if (!billedTo.trim()) { push({ tone: 'error', title: 'Bill-to name is required' }); return }
    if (!number.trim()) { push({ tone: 'error', title: 'Invoice number is required' }); return }
    if (items.length === 0) { push({ tone: 'error', title: 'Add at least one service' }); return }
    if (items.some((it) => !it.name.trim())) { push({ tone: 'error', title: 'Every line needs a service name' }); return }
    setSaving(true)
    try {
      const cleanItems = items
        .filter((it) => it.name.trim())
        .map((it) => ({
          name: it.name.trim(), description: it.description.trim(),
          quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0,
        }))

      // Drop empty optional objects so we don't persist a ship_to with
      // all-blank fields, etc.
      const cleanExtras: InvoiceExtras = { ...extras }
      if (cleanExtras.ship_to && !hasAnyText(cleanExtras.ship_to)) cleanExtras.ship_to = null
      if (cleanExtras.references && !hasAnyText(cleanExtras.references)) cleanExtras.references = null
      if (cleanExtras.bank && !hasAnyText(cleanExtras.bank)) cleanExtras.bank = null
      if (cleanExtras.secondary_section && !cleanExtras.secondary_section.content.trim() && !cleanExtras.secondary_section.type.trim()) cleanExtras.secondary_section = null
      if (cleanExtras.qr_enabled && !cleanExtras.qr_payload.trim()) {
        // Auto-fill with the default verification URL when QR is on but
        // the admin didn't customise the payload.
        cleanExtras.qr_payload = editing ? buildQrPayload(editing) : ''
      }
      const notes = serializeInvoiceNotes(freeformNotes.trim(), cleanExtras)

      if (editing) {
        await db.updateInvoice(editing.id, {
          number, billed_to: billedTo.trim(), billed_address: billedAddress.trim(),
          billed_email: billedEmail.trim(), billed_vat: billedVat.trim(),
          issue_date: issueDate, due_date: dueDate || null,
          status, vat_included: vatIncluded, vat_pct: Number(vatPct) || 0,
          notes,
        })
        await db.setInvoiceServices(editing.id, cleanItems)
        push({ tone: 'success', title: 'Invoice updated' })
      } else {
        const inv = await db.createInvoice({
          number, billed_to: billedTo.trim(), billed_address: billedAddress.trim(),
          billed_email: billedEmail.trim(), billed_vat: billedVat.trim(),
          issue_date: issueDate, due_date: dueDate || null,
          status, vat_included: vatIncluded, vat_pct: Number(vatPct) || 0,
          notes,
        })
        await db.setInvoiceServices(inv.id, cleanItems)
        push({ tone: 'success', title: 'Invoice created', desc: inv.number })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit invoice ${editing?.number ?? ''}` : 'New invoice'}
      desc={isEdit ? 'Update invoice details, services, prices.' : 'Generate a new invoice. All optional sections are off by default — enable the ones you need.'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={<Save size={15} strokeWidth={1.75} />} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Generate invoice'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Meta row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Invoice number" required>
            <div className="flex gap-1.5">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono text-sm" />
              {!isEdit && nextNumber && (
                <button
                  type="button"
                  onClick={() => setNumber(nextNumber)}
                  title="Use next sequential number"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-ink-50 text-ink-500 hover:bg-ink-100"
                >
                  <Copy size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </Field>
          <Field label="Issue date" required>
            <DateTimePicker value={issueDate} onChange={(v) => setIssueDate(v)} outputIso={false} dateOnly />
          </Field>
          <Field label="Due date" hint="Optional">
            <DateTimePicker value={dueDate} onChange={(v) => setDueDate(v)} outputIso={false} dateOnly />
          </Field>
        </div>

        {/* Bill to */}
        <div className="rounded-xl border border-line p-4">
          <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">Bill to</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Business / customer name" required>
              <Input value={billedTo} onChange={(e) => setBilledTo(e.target.value)} placeholder="Acme S.r.l." />
            </Field>
            <Field label="VAT number" hint="Customer's VAT (optional)">
              <Input value={billedVat} onChange={(e) => setBilledVat(e.target.value)} placeholder="IT12345678901" />
            </Field>
            <Field label="Address">
              <Input value={billedAddress} onChange={(e) => setBilledAddress(e.target.value)} placeholder="Via Roma 12, Milano" />
            </Field>
            <Field label="Email">
              <Input type="email" value={billedEmail} onChange={(e) => setBilledEmail(e.target.value)} placeholder="accounts@acme.com" />
            </Field>
          </div>
        </div>

        {/* Services */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Services</p>
            <Button size="sm" variant="secondary" icon={<Plus size={13} strokeWidth={1.75} />} onClick={addItem}>Add line</Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-line bg-ink-50/40 p-3">
                <div className="flex items-start gap-2">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-2xs font-bold text-ink-600">{idx + 1}</div>
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_70px_110px_110px]">
                      <ServiceCombobox value={it.name} onChange={(v) => updateItem(idx, { name: v })} options={INVOICE_SERVICE_CATALOG} placeholder="Service name" />
                      <Input type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} placeholder="Qty" />
                      <Input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} placeholder="Unit €" />
                      <div className="flex items-center justify-end">
                        <span className="num text-sm font-semibold">{eurFull(Number(it.quantity) * Number(it.unit_price))}</span>
                      </div>
                    </div>
                    <Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Optional description / structure for this service" className="text-2xs" />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-negBg hover:text-neg" title="Remove line">
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-400">No services yet. Click <strong>Add line</strong>.</p>
            )}
          </div>
        </div>

        {/* VAT + totals */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">VAT</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} className="h-4 w-4 rounded border-line" />
                VAT included in line prices
              </label>
              <Field label="VAT percentage">
                <Input type="number" min="0" max="100" step="0.01" value={vatPct} onChange={(e) => setVatPct(e.target.value)} disabled={vatIncluded} className="w-28" />
              </Field>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-ink-50/40 p-4">
            <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">Totals</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="num">{eurFull(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">VAT ({Number(vatPct) || 0}%){vatIncluded ? ' · included' : ''}</span><span className="num">{vatIncluded ? 'incl.' : eurFull(vatAmount)}</span></div>
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold"><span>Total</span><span className="num">{eurFull(total)}</span></div>
            </div>
          </div>
        </div>

        {/* Status + freeform notes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_META[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Notes / payment terms" hint="Optional — printed on the invoice">
            <Textarea value={freeformNotes} onChange={(e) => setFreeformNotes(e.target.value)} rows={2} placeholder="Payment due within 30 days by bank transfer." />
          </Field>
        </div>

        {/* ============================================================ */}
        {/* OPTIONAL SECTIONS — all off by default, toggled by the admin   */}
        {/* ============================================================ */}
        <div className="rounded-xl border border-line bg-ink-50/30 p-3">
          <p className="mb-3 text-2xs font-medium uppercase tracking-wider text-ink-400">Optional sections</p>
          <div className="space-y-2">
            {/* Document type */}
            <Field label="Document type" hint="Printed at the very top of the invoice">
              <Select value={extras.document_type} onChange={(e) => patchExtras({ document_type: e.target.value })} className="max-w-xs">
                {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>

            {/* Ship to */}
            <OptionalSection
              icon={<Truck size={14} strokeWidth={1.75} />}
              label="Ship to (delivery)"
              enabled={showSection.shipTo}
              onToggle={(v) => {
                setShowSection((s) => ({ ...s, shipTo: v }))
                if (v && !extras.ship_to) patchExtras({ ship_to: { name: '', company: '', address: '', city: '', country: '', phone: '', delivery_method: '' } })
              }}
            >
              {extras.ship_to && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input placeholder="Recipient name" value={extras.ship_to.name} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, name: e.target.value } })} />
                  <Input placeholder="Company" value={extras.ship_to.company} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, company: e.target.value } })} />
                  <Input placeholder="Address" value={extras.ship_to.address} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, address: e.target.value } })} />
                  <Input placeholder="City" value={extras.ship_to.city} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, city: e.target.value } })} />
                  <Input placeholder="Country" value={extras.ship_to.country} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, country: e.target.value } })} />
                  <Input placeholder="Phone" value={extras.ship_to.phone} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, phone: e.target.value } })} />
                  <Input placeholder="Delivery method (e.g. courier, hand)" value={extras.ship_to.delivery_method} onChange={(e) => patchExtras({ ship_to: { ...extras.ship_to!, delivery_method: e.target.value } })} />
                </div>
              )}
            </OptionalSection>

            {/* Additional references */}
            <OptionalSection
              icon={<FileText size={14} strokeWidth={1.75} />}
              label="Additional references"
              enabled={showSection.references}
              onToggle={(v) => {
                setShowSection((s) => ({ ...s, references: v }))
                if (v && !extras.references) patchExtras({ references: { order_no: '', customer_no: '', po_number: '', delivery_note: '', salesperson: '', project: '', vehicle_reg: '', vin: '', job_card: '', service_date: '' } })
              }}
            >
              {extras.references && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input placeholder="Order no." value={extras.references.order_no} onChange={(e) => patchExtras({ references: { ...extras.references!, order_no: e.target.value } })} />
                  <Input placeholder="Customer no." value={extras.references.customer_no} onChange={(e) => patchExtras({ references: { ...extras.references!, customer_no: e.target.value } })} />
                  <Input placeholder="PO number" value={extras.references.po_number} onChange={(e) => patchExtras({ references: { ...extras.references!, po_number: e.target.value } })} />
                  <Input placeholder="Delivery note" value={extras.references.delivery_note} onChange={(e) => patchExtras({ references: { ...extras.references!, delivery_note: e.target.value } })} />
                  <Input placeholder="Salesperson" value={extras.references.salesperson} onChange={(e) => patchExtras({ references: { ...extras.references!, salesperson: e.target.value } })} />
                  <Input placeholder="Project" value={extras.references.project} onChange={(e) => patchExtras({ references: { ...extras.references!, project: e.target.value } })} />
                  <Input placeholder="Vehicle reg." value={extras.references.vehicle_reg} onChange={(e) => patchExtras({ references: { ...extras.references!, vehicle_reg: e.target.value } })} />
                  <Input placeholder="VIN" value={extras.references.vin} onChange={(e) => patchExtras({ references: { ...extras.references!, vin: e.target.value } })} />
                  <Input placeholder="Job card" value={extras.references.job_card} onChange={(e) => patchExtras({ references: { ...extras.references!, job_card: e.target.value } })} />
                  <Input type="date" placeholder="Service date" value={extras.references.service_date} onChange={(e) => patchExtras({ references: { ...extras.references!, service_date: e.target.value } })} />
                </div>
              )}
            </OptionalSection>

            {/* Bank details */}
            <OptionalSection
              icon={<Building size={14} strokeWidth={1.75} />}
              label="Bank / payment details"
              enabled={showSection.bank}
              onToggle={(v) => {
                setShowSection((s) => ({ ...s, bank: v }))
                if (v && !extras.bank) patchExtras({ bank: { bank: '', iban: '', bic: '', account: '' } })
              }}
            >
              {extras.bank && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input placeholder="Bank name" value={extras.bank.bank} onChange={(e) => patchExtras({ bank: { ...extras.bank!, bank: e.target.value } })} />
                  <Input placeholder="IBAN" value={extras.bank.iban} onChange={(e) => patchExtras({ bank: { ...extras.bank!, iban: e.target.value } })} className="font-mono text-sm" />
                  <Input placeholder="BIC / SWIFT" value={extras.bank.bic} onChange={(e) => patchExtras({ bank: { ...extras.bank!, bic: e.target.value } })} className="font-mono text-sm" />
                  <Input placeholder="Account number (optional)" value={extras.bank.account} onChange={(e) => patchExtras({ bank: { ...extras.bank!, account: e.target.value } })} />
                </div>
              )}
            </OptionalSection>

            {/* QR code */}
            <OptionalSection
              icon={<QrCode size={14} strokeWidth={1.75} />}
              label="QR code (top-right of invoice)"
              enabled={showSection.qr}
              onToggle={(v) => {
                setShowSection((s) => ({ ...s, qr: v }))
                patchExtras({ qr_enabled: v })
                if (v && !extras.qr_payload && editing) patchExtras({ qr_payload: buildQrPayload(editing) })
              }}
            >
              <Field label="QR payload" hint="What the QR code encodes. Defaults to your verification URL + invoice ID.">
                <Input
                  value={extras.qr_payload}
                  onChange={(e) => patchExtras({ qr_payload: e.target.value })}
                  placeholder={editing ? buildQrPayload(editing) : `${issuerSettings?.qr_verify_base_url ?? 'https://calistaconcept.eu/invoice/verify'}/{id}`}
                  className="font-mono text-sm"
                />
              </Field>
            </OptionalSection>

            {/* Legal notes */}
            <OptionalSection
              icon={<Scale size={14} strokeWidth={1.75} />}
              label="Legal / tax footnote"
              enabled={showSection.legal}
              onToggle={(v) => setShowSection((s) => ({ ...s, legal: v }))}
            >
              <Textarea
                value={extras.legal_notes}
                onChange={(e) => patchExtras({ legal_notes: e.target.value })}
                rows={2}
                placeholder="VAT payable by recipient under reverse charge mechanism. · This invoice was generated electronically and is valid without signature."
              />
            </OptionalSection>

            {/* Signatures */}
            <OptionalSection
              icon={<PenLine size={14} strokeWidth={1.75} />}
              label="Signature — issued by name"
              enabled={showSection.signatures}
              onToggle={(v) => setShowSection((s) => ({ ...s, signatures: v }))}
            >
              <Input
                value={extras.signature_issued_by}
                onChange={(e) => patchExtras({ signature_issued_by: e.target.value })}
                placeholder="Name of the person issuing this invoice"
              />
            </OptionalSection>

            {/* Secondary section */}
            <OptionalSection
              icon={<Layers size={14} strokeWidth={1.75} />}
              label="Secondary section (delivery note / receipt / job card)"
              enabled={showSection.secondary}
              onToggle={(v) => {
                setShowSection((s) => ({ ...s, secondary: v }))
                if (v && !extras.secondary_section) patchExtras({ secondary_section: { type: 'Delivery Note', content: '' } })
              }}
            >
              {extras.secondary_section && (
                <div className="space-y-2">
                  <Select value={extras.secondary_section.type} onChange={(e) => patchExtras({ secondary_section: { ...extras.secondary_section!, type: e.target.value } })} className="max-w-xs">
                    {SECONDARY_SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <Textarea
                    value={extras.secondary_section.content}
                    onChange={(e) => patchExtras({ secondary_section: { ...extras.secondary_section!, content: e.target.value } })}
                    rows={3}
                    placeholder="Content for this section (printed at the very bottom of the invoice)."
                  />
                </div>
              )}
            </OptionalSection>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Collapsible optional section — toggle + body                       */
/* ------------------------------------------------------------------ */
function OptionalSection({
  icon, label, enabled, onToggle, children,
}: {
  icon: React.ReactNode
  label: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border ${enabled ? 'border-ink-200 bg-surface' : 'border-line bg-ink-50/40'} overflow-hidden`}>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink-600 hover:bg-ink-50 transition-colors"
      >
        <span className={enabled ? 'text-ink-600' : 'text-ink-400'}>{icon}</span>
        <span className="flex-1">{label}</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-ink' : 'bg-ink-200'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
      </button>
      {enabled && (
        <div className="border-t border-line p-3">{children}</div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function hasAnyText(obj: Record<string, any>): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '')
}
