import { useEffect, useMemo, useState } from 'react'
import { Save, Copy, RefreshCw, Braces } from 'lucide-react'
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
import type { Contract, ContractStatus, ContractTemplate, InvoiceSettings, CustomPlaceholderDef } from '../lib/types'
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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
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

  const selectedTemplate = templates.find((t) => t.id === templateId)

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
    </Modal>
  )
}
