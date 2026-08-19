import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Printer, Trash2, Eye, FileText, Check } from 'lucide-react'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Skeleton } from './ui/Skeleton'
import { Badge } from './ui/Badge'
import { useToast } from '../context/ToastContext'
import { InvoiceEditor } from './InvoiceEditor'
import { FormalInvoiceDocument } from './FormalInvoiceDocument'
import { INVOICE_STATUS_META } from '../lib/types'
import type { Invoice, InvoiceService, InvoiceStatus } from '../lib/types'
import { eurFull, dateShort } from '../lib/format'

interface Props {
  /** Bumped by the parent whenever a finance entry changes (so we
   *  re-sync the linked finance_entry_id when an invoice is marked
   *  paid from elsewhere, etc.). */
  refreshKey?: number
  onInvoicesChanged?: () => void
}

/**
 * Invoices sub-tab — list of invoices with create / edit / print /
 * mark-paid / delete actions.  Storage is in DB rows only (no PDF
 * blobs); the printable PDF is generated on demand via the
 * FormalInvoiceDocument portal — same pattern as the balance sheet.
 */
export function InvoicesTab({ refreshKey, onInvoicesChanged }: Props) {
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => {
    const invs = await db.listInvoices()
    // Load services per invoice in parallel (small N — admins only).
    const servicesByInvoice: Record<string, InvoiceService[]> = {}
    await Promise.all(
      invs.slice(0, 50).map(async (inv) => {
        servicesByInvoice[inv.id] = await db.listInvoiceServices(inv.id)
      }),
    )
    return { invoices: invs, servicesByInvoice }
  }, [refreshKey])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const [previewServices, setPreviewServices] = useState<InvoiceService[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [nextNumber, setNextNumber] = useState('')

  // Pre-fetch the next sequential number whenever the editor opens for
  // a new invoice (not on edit — we keep the existing number).
  useEffect(() => {
    if (editorOpen && !editing) {
      db.nextInvoiceNumber().then(setNextNumber).catch(() => setNextNumber(''))
    }
  }, [editorOpen, editing])

  const invoices = data?.invoices || []

  // Stats
  const stats = useMemo(() => {
    const total = invoices.length
    const draft = invoices.filter((i) => i.status === 'draft').length
    const sent = invoices.filter((i) => i.status === 'sent').length
    const paid = invoices.filter((i) => i.status === 'paid').length
    const paidTotal = invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, inv) => {
        const svcs = data?.servicesByInvoice[inv.id] || []
        const sub = svcs.reduce((x, s) => x + Number(s.quantity) * Number(s.unit_price), 0)
        const vat = inv.vat_included ? 0 : sub * (Number(inv.vat_pct) / 100)
        return s + (inv.vat_included ? sub : sub + vat)
      }, 0)
    const outstanding = invoices
      .filter((i) => i.status === 'sent' || i.status === 'draft')
      .reduce((s, inv) => {
        const svcs = data?.servicesByInvoice[inv.id] || []
        const sub = svcs.reduce((x, s) => x + Number(s.quantity) * Number(s.unit_price), 0)
        const vat = inv.vat_included ? 0 : sub * (Number(inv.vat_pct) / 100)
        return s + (inv.vat_included ? sub : sub + vat)
      }, 0)
    return { total, draft, sent, paid, paidTotal, outstanding }
  }, [invoices, data?.servicesByInvoice])

  function startNew() {
    setEditing(null)
    setEditorOpen(true)
  }
  function startEdit(inv: Invoice) {
    setEditing(inv)
    setEditorOpen(true)
  }

  async function openPreview(inv: Invoice) {
    try {
      const svcs = await db.listInvoiceServices(inv.id)
      setPreviewServices(svcs)
      setPreview(inv)
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not load invoice', desc: e?.message })
    }
  }

  async function markPaid(inv: Invoice) {
    try {
      // Sync to finance_entries: when the invoice is now paid, create
      // (or update) a revenue row so it shows in the Finance tab.
      const svcs = await db.listInvoiceServices(inv.id)
      const sub = svcs.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0)
      const vat = inv.vat_included ? 0 : sub * (Number(inv.vat_pct) / 100)
      const total = inv.vat_included ? sub : sub + vat

      const newStatus: InvoiceStatus = inv.status === 'paid' ? 'sent' : 'paid'
      if (newStatus === 'paid') {
        // Create / update the revenue row
        if (inv.finance_entry_id) {
          await db.updateFinanceEntry(inv.finance_entry_id, {
            kind: 'revenue',
            category: 'service_sale',
            title: `Invoice ${inv.number} — ${inv.billed_to}`,
            description: inv.notes || `Issued ${dateShort(inv.issue_date)}`,
            amount: total,
            entry_date: inv.issue_date,
          })
        } else {
          const entryId = await db.createFinanceEntry({
            kind: 'revenue',
            category: 'service_sale',
            title: `Invoice ${inv.number} — ${inv.billed_to}`,
            description: inv.notes || `Issued ${dateShort(inv.issue_date)}`,
            amount: total,
            entry_date: inv.issue_date,
          })
          await db.updateInvoice(inv.id, { finance_entry_id: entryId, status: newStatus })
        }
      } else {
        // Marking unpaid — remove the finance entry so it stops
        // appearing in the Finance tab.  The invoice itself stays.
        if (inv.finance_entry_id) {
          await db.deleteFinanceEntry(inv.finance_entry_id)
          await db.updateInvoice(inv.id, { finance_entry_id: null, status: newStatus })
        } else {
          await db.updateInvoice(inv.id, { status: newStatus })
        }
      }
      push({
        tone: 'success',
        title: newStatus === 'paid' ? 'Invoice marked paid' : 'Invoice marked unpaid',
        desc: newStatus === 'paid' ? `${inv.number} added to Finances as revenue.` : `${inv.number} removed from Finances.`,
      })
      reload()
      onInvoicesChanged?.()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function remove(inv: Invoice) {
    try {
      // Also drop the linked finance entry so historical revenue
      // doesn't get double-counted with a deleted invoice.
      if (inv.finance_entry_id) {
        await db.deleteFinanceEntry(inv.finance_entry_id).catch(() => {})
      }
      await db.deleteInvoice(inv.id)
      push({ tone: 'info', title: 'Invoice deleted' })
      setDeleteTarget(null)
      reload()
      onInvoicesChanged?.()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Invoices</h2>
          <p className="mt-1 text-sm text-ink-400">
            Generate, edit, print and track invoices. Marking an invoice <strong>paid</strong> adds it to the Finance tab as revenue.
          </p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={startNew}>New invoice</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Total" value={String(stats.total)} />
        <StatBox label="Draft" value={String(stats.draft)} tone="neutral" />
        <StatBox label="Sent" value={String(stats.sent)} tone="info" />
        <StatBox label="Paid" value={String(stats.paid)} tone="pos" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatBox label="Outstanding (draft + sent)" value={eurFull(stats.outstanding)} tone="warn" />
        <StatBox label="Paid revenue" value={eurFull(stats.paidTotal)} tone="pos" />
      </div>

      {/* List */}
      <Card>
        <CardHeader title="All invoices" desc={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`} />
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <FileText size={22} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">No invoices yet — click <strong>New invoice</strong> to generate your first one.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {invoices.map((inv) => {
              const svcs = data?.servicesByInvoice[inv.id] || []
              const sub = svcs.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0)
              const vat = inv.vat_included ? 0 : sub * (Number(inv.vat_pct) / 100)
              const total = inv.vat_included ? sub : sub + vat
              const meta = INVOICE_STATUS_META[inv.status]
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink">
                    <FileText size={16} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold font-mono">{inv.number}</p>
                      <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    </div>
                    <p className="truncate text-2xs text-ink-400">
                      {inv.billed_to} · {dateShort(inv.issue_date)}{inv.due_date ? ` · due ${dateShort(inv.due_date)}` : ''}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold">{eurFull(total)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openPreview(inv)} title="Preview" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                      <Eye size={14} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => markPaid(inv)} title={inv.status === 'paid' ? 'Mark unpaid' : 'Mark paid'} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-posBg hover:text-pos">
                      <Check size={14} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => startEdit(inv)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button onClick={() => setDeleteTarget(inv)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-negBg hover:text-neg">
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Editor */}
      <InvoiceEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditing(null) }}
        onSaved={() => { reload(); onInvoicesChanged?.() }}
        editing={editing}
        nextNumber={nextNumber}
      />

      {/* On-screen preview modal — actual print uses the formal portal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Invoice ${preview.number}` : ''}
        desc="On-screen preview. Click Print to produce the formal PDF document."
        size="lg"
        className="no-print"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
            <Button icon={<Printer size={14} strokeWidth={1.75} />} onClick={() => window.print()}>Print invoice</Button>
          </>
        }
      >
        {preview && (
          <div className="rounded-xl border border-line p-5">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <p className="text-base font-semibold">Calista Concept</p>
                <p className="text-2xs text-ink-400">ops@calistaconcept.eu</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tracking-wide">INVOICE</p>
                <p className="font-mono text-2xs text-ink-500">{preview.number}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-2xs uppercase tracking-wider text-ink-400">Bill to</p>
                <p className="font-medium">{preview.billed_to}</p>
                {preview.billed_address && <p className="text-ink-500">{preview.billed_address}</p>}
                {preview.billed_email && <p className="text-ink-500">{preview.billed_email}</p>}
                {preview.billed_vat && <p className="text-ink-500">VAT: {preview.billed_vat}</p>}
              </div>
              <div className="text-right">
                <p className="text-2xs uppercase tracking-wider text-ink-400">Issue date</p>
                <p className="font-medium">{dateShort(preview.issue_date)}</p>
                {preview.due_date && (<><p className="mt-1 text-2xs uppercase tracking-wider text-ink-400">Due</p><p className="font-medium">{dateShort(preview.due_date)}</p></>)}
              </div>
            </div>
            <table className="mt-4 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-2xs uppercase text-ink-400">
                  <th className="py-1.5 text-left">Service</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Unit</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {previewServices.map((s) => (
                  <tr key={s.id} className="border-b border-line">
                    <td className="py-2">
                      <p className="font-medium">{s.name}</p>
                      {s.description && <p className="text-2xs text-ink-400">{s.description}</p>}
                    </td>
                    <td className="py-2 text-right num">{Number(s.quantity)}</td>
                    <td className="py-2 text-right num">{eurFull(Number(s.unit_price))}</td>
                    <td className="py-2 text-right num font-medium">{eurFull(Number(s.quantity) * Number(s.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end text-xs">
              <table className="border-collapse">
                <tbody>
                  <tr><td className="px-3 py-1 text-right text-ink-500">Subtotal</td><td className="px-3 py-1 text-right num">{eurFull(previewServices.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0))}</td></tr>
                  <tr><td className="px-3 py-1 text-right text-ink-500">VAT ({Number(preview.vat_pct)}%){preview.vat_included ? ' · included' : ''}</td><td className="px-3 py-1 text-right num">{preview.vat_included ? 'incl.' : eurFull(previewServices.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0) * (Number(preview.vat_pct) / 100))}</td></tr>
                  <tr className="border-t border-line"><td className="px-3 py-1.5 text-right font-bold">Total</td><td className="px-3 py-1.5 text-right num font-bold">{eurFull(preview.vat_included ? previewServices.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0) : previewServices.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0) * (1 + Number(preview.vat_pct) / 100))}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Formal printable document — hidden on screen, only renders to PDF */}
      {preview && (
        <FormalInvoiceDocument
          invoice={preview}
          services={previewServices}
          companyAddress="Referrals & Revenue Platform"
          companyVat="BGXXXXXXXXX"
        />
      )}

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete invoice?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.75} />} onClick={() => deleteTarget && remove(deleteTarget)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">
          Delete <strong>{deleteTarget?.number}</strong>? The linked finance entry will also be removed. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

function StatBox({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }) {
  const toneClass = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-ink'
  return (
    <div className="card">
      <p className="text-sm text-ink-400">{label}</p>
      <p className={`mt-2 num text-xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  )
}
