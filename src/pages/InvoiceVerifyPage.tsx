import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, ShieldCheck, Loader2 } from 'lucide-react'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { DEFAULT_INVOICE_SETTINGS } from '../lib/types'
import type { Invoice, InvoiceService, InvoiceSettings } from '../lib/types'
import { eurFull, dateLong } from '../lib/format'

/**
 * Public invoice verification page — what someone lands on when they
 * scan the QR code printed on a Calista Concept invoice.
 *
 * Reads the invoice ID from the URL (the QR payload is
 * `{base URL}/{id}`), fetches the invoice + its services + the
 * public issuer identity, and shows either "this invoice is valid" or
 * "not found".
 *
 * No auth required — the underlying tables have public SELECT RLS on
 * the issuer identity columns (see schema51.sql `invset_public_read`).
 * Invoices themselves are admin-only, but Supabase allows us to read
 * a single row via the service role — here we use the anon key, which
 * means the row is only visible if the admin RLS policy permits it.
 * For the verify page we don't need auth-gated reads; we only need
 * to confirm the invoice EXISTS, so we use a `.select()` with no
 * filters — if RLS hides it, we treat that as "not publicly
 * verifiable" and show a softer message.
 *
 * In practice: the admin's RLS policy on `invoices` is admin-only,
 * so a public anon read returns null.  We therefore need a public
 * read policy on invoices for the verify page to work.  That's added
 * in schema51.sql as `inv_public_read_status` — exposes ONLY the
 * fields needed for verification (number, status, issue_date,
 * billed_to, total), not the financial detail.
 */
export default function InvoiceVerifyPage() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<'loading' | 'valid' | 'not-found'>('loading')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [services, setServices] = useState<InvoiceService[]>([])
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS)

  useEffect(() => {
    if (!id || !supabase) {
      setState('not-found')
      return
    }
    let active = true
    ;(async () => {
      try {
        // Try the public read of the invoice row.  The verify policy
        // in schema51 exposes only the verification-safe fields.
        const { data: inv, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (!active) return
        if (error || !inv) {
          setState('not-found')
          return
        }
        setInvoice(inv as Invoice)
        // Try to read the services.  If the RLS on invoice_services
        // is admin-only, this returns empty — we still show the
        // invoice as valid (just without line items on the verify
        // page).
        try {
          const svcs = await db.listInvoiceServices(id)
          if (active) setServices(svcs)
        } catch { /* ignore — services are admin-only */ }
        // Read public issuer identity
        try {
          const s = await db.getPublicInvoiceSettings()
          if (active) setSettings(s)
        } catch { /* ignore — fall back to defaults */ }
        setState('valid')
      } catch {
        if (active) setState('not-found')
      }
    })()
    return () => { active = false }
  }, [id])

  const total = services.length > 0
    ? services.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0) * (invoice?.vat_included ? 1 : (1 + (Number(invoice?.vat_pct) || 0) / 100))
    : null

  return (
    <div className="min-h-dvh bg-canvas flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg"
      >
        {/* Brand header — small logo + trading name */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src="https://kappa.lol/FAHnNi" alt="Calista Concept" className="h-8 w-auto" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{settings.company_name}</p>
            <p className="text-2xs text-ink-400">{settings.company_subname}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface shadow-glass overflow-hidden">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={28} strokeWidth={1.75} className="animate-spin text-ink-400" />
              <p className="text-sm text-ink-500">Verifying invoice…</p>
            </div>
          )}

          {state === 'not-found' && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-negBg text-neg">
                <XCircle size={28} strokeWidth={1.75} />
              </div>
              <h1 className="text-lg font-semibold text-ink">Invoice not found</h1>
              <p className="text-sm text-ink-500 max-w-sm">
                We couldn't find an invoice with this reference. The invoice may have been voided,
                the link may be incorrect, or the issuer's records are unavailable.
              </p>
              <p className="mt-3 text-2xs text-ink-400 font-mono">Reference: {id ?? '—'}</p>
            </div>
          )}

          {state === 'valid' && invoice && (
            <div className="flex flex-col">
              {/* Hero strip */}
              <div className="flex items-center gap-3 bg-posBg/40 px-6 py-5 border-b border-line">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pos text-white">
                  <CheckCircle2 size={26} strokeWidth={1.75} />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-ink">This invoice is valid</h1>
                  <p className="text-2xs text-ink-500 flex items-center gap-1">
                    <ShieldCheck size={11} strokeWidth={1.75} />
                    Verified against the {settings.company_name} ledger
                  </p>
                </div>
              </div>

              {/* Invoice details */}
              <div className="px-6 py-5 space-y-3">
                <DetailRow label="Invoice number">
                  <span className="font-mono font-semibold">{invoice.number}</span>
                </DetailRow>
                <DetailRow label="Status">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${invoice.status === 'paid' ? 'bg-posBg text-pos' : invoice.status === 'void' ? 'bg-negBg text-neg' : 'bg-ink-100 text-ink-600'}`}>
                    {invoice.status.toUpperCase()}
                  </span>
                </DetailRow>
                <DetailRow label="Issued to">{invoice.billed_to}</DetailRow>
                <DetailRow label="Issue date">{dateLong(invoice.issue_date)}</DetailRow>
                {invoice.due_date && <DetailRow label="Due date">{dateLong(invoice.due_date)}</DetailRow>}
                {services.length > 0 && total !== null && (
                  <DetailRow label="Total amount">
                    <span className="num font-semibold">{eurFull(total)} {invoice.currency}</span>
                  </DetailRow>
                )}

                {/* Issuer footer */}
                <div className="mt-2 rounded-xl bg-ink-50 px-3 py-2.5 text-2xs text-ink-500">
                  <p className="font-medium text-ink-700">{settings.company_name}</p>
                  {settings.company_address && <p>{settings.company_address}</p>}
                  <p>{settings.company_email}</p>
                  {settings.company_vat && <p>VAT ID: {settings.company_vat}</p>}
                </div>
              </div>

              <div className="border-t border-line px-6 py-3 text-center">
                <p className="text-2xs text-ink-400">
                  Verification confirmed at {new Date().toLocaleString()} · CCInvoiceEngine v1.0
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-2xs text-ink-400">
          © {new Date().getFullYear()} {settings.company_name}. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-2xs uppercase tracking-wider text-ink-400 font-medium pt-0.5">{label}</span>
      <span className="text-sm text-ink-700 text-right min-w-0">{children}</span>
    </div>
  )
}
