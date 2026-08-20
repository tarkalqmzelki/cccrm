import { createPortal } from 'react-dom'
import type { Invoice, InvoiceService } from '../lib/types'
import { eurFull, dateLong, dateShort } from '../lib/format'
import { parseInvoiceNotes } from '../lib/invoiceExtras'
import { makeT } from '../lib/translations'

const LOGO_URL = 'https://kappa.lol/FAHnNi'

interface Props {
  invoice: Invoice
  services: InvoiceService[]
  companyName?: string
  companySubname?: string
  companyAddress?: string
  companyEmail?: string
  companyVat?: string
  companyId?: string
  companyPhone?: string
  companyWebsite?: string
  /** Translation map for the selected language (null = English). */
  translations?: Record<string, string> | null
}

/**
 * Formal A4 tax-invoice document — ERP / accounting-system style.
 *
 * Rendered via createPortal to document.body and shown only during
 * print (the index.css @media print rule hides #root and shows
 * .print-document).  The on-screen preview lives in the
 * InvoicePreviewModal (a normal Modal); the PDF that comes out of
 * `window.print()` is this formal document.
 *
 * Design language (per spec — black/white/light-gray, Arial, small
 * type, hairline rules, gray title bars, dense info blocks, no
 * decorative elements, no big type, fixed A4 dimensions):
 *
 *   1.  Top document indicator (centered uppercase — Original / Copy / …)
 *   2.  Gray title bar — "TAX INVOICE" (or document type)
 *   3.  Invoice identification row (number / date / due / currency) +
 *       optional QR code (top-right)
 *   4.  Seller / Customer two-column block
 *   5.  Optional Ship-to block
 *   6.  Optional additional references row
 *   7.  Main items table (# / Description / Qty / Unit price / Amount)
 *   8.  Tax summary (right-aligned: subtotal, VAT, total)
 *   9.  Grand total + amount in words
 *  10.  Optional payment / bank details block
 *  11.  Optional legal / tax footnote
 *  12.  Signature areas (Issued by / Received by)
 *  13.  Optional secondary section (delivery note / receipt / job card)
 *  14.  Footer (company legal info + page number + CCInvoiceEngine)
 *
 * Multi-page: the browser's print handles page breaks; the footer is
 * `position: fixed; bottom: 0` so it repeats on every printed page.
 * Table rows have `page-break-inside: avoid` so they don't split.
 */
export function FormalInvoiceDocument({
  invoice, services, companyName = 'Calista Concept',
  companySubname = 'Legendary Design Ltd.',
  companyAddress = '', companyEmail = 'ops@calistaconcept.eu',
  companyVat = '', companyId = '', companyPhone = '', companyWebsite = '',
  translations = null,
}: Props) {
  const { freeform, extras } = parseInvoiceNotes(invoice.notes)
  const t = makeT(translations)
  const subtotal = services.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price), 0)
  const vatAmount = invoice.vat_included ? 0 : subtotal * (Number(invoice.vat_pct) / 100)
  const total = invoice.vat_included ? subtotal : subtotal + vatAmount
  const barcodeBars = buildBarcodeBars(invoice.number)
  const totalWords = numberToWords(total)

  // Document type label at the very top.
  const docIndicator =
    extras.document_type === 'Original' ? t('doc.original')
    : extras.document_type === 'Copy' ? t('doc.copy')
    : extras.document_type === 'Duplicate' ? t('doc.duplicate')
    : extras.document_type === 'Proforma' ? t('doc.proforma')
    : extras.document_type === 'Credit Note' ? t('doc.credit_note')
    : extras.document_type === 'Receipt' ? t('doc.receipt')
    : extras.document_type.toUpperCase()

  // Title-bar text — "COMMERCIAL INVOICE" for invoices, translated per
  // the selected language.
  const titleBar =
    extras.document_type === 'Credit Note' ? t('doc.credit_note')
    : extras.document_type === 'Receipt' ? t('doc.receipt')
    : extras.document_type === 'Proforma' ? t('doc.proforma_invoice')
    : t('doc.commercial_invoice')

  // QR code (optional)
  const qrUrl = extras.qr_enabled && extras.qr_payload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(extras.qr_payload)}`
    : null

  return createPortal(
    <div
      className="print-document print-only"
      style={{
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        color: '#111',
        // width: 100% fills the @page printable area (196mm with 7mm
        // side margins).  No fixed height — content flows naturally
        // across pages so a long invoice (many services, long legal
        // notes) never overlaps the footer.
        width: '100%',
        // No padding — the @page margins (8mm top, 7mm sides, 14mm
        // bottom) provide the page margins.  The fixed footer lives
        // in the 14mm bottom margin and repeats on every page.
        padding: 0,
        fontSize: '10pt',
        lineHeight: 1.4,
        boxSizing: 'border-box',
        background: '#fff',
        position: 'relative',
      }}
    >
      {/* ============================================================ */}
      {/* 1. DOCUMENT INDICATOR — top centered uppercase                */}
      {/* ============================================================ */}
      <div style={{ textAlign: 'center', fontSize: '8.5pt', letterSpacing: '0.18em', color: '#444', textTransform: 'uppercase', padding: '0.5mm 0 1mm' }}>
        {docIndicator}
      </div>

      {/* ============================================================ */}
      {/* 2. TITLE BAR — full-width light-gray bar, LEFT-aligned         */}
      {/*      (was centered — user wants it fixed to the left)          */}
      {/* ============================================================ */}
      <div style={{ background: '#D3D3D3', color: '#000', fontWeight: 700, fontSize: '11pt', letterSpacing: '0.12em', textAlign: 'left', padding: '2mm 3mm', margin: '0 0 3mm' }}>
        {titleBar}
      </div>

      {/* ============================================================ */}
      {/* 3. INVOICE IDENTIFICATION — logo + name left, meta + QR right  */}
      {/*      Top row: logo + trading name + legal-entity sub-name on   */}
      {/*      the left, QR code on the right.  Below that, a meta row    */}
      {/*      with invoice number / date / due / currency / status.     */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '0.5pt solid #000', paddingBottom: '2.5mm', marginBottom: '3mm' }}>
        {/* Left: small logo + trading name + legal entity underneath */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3mm' }}>
          <img
            src={LOGO_URL}
            alt={companyName}
            style={{ height: '14mm', width: 'auto' }}
          />
          <div style={{ fontSize: '9pt', lineHeight: 1.3 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '12pt', color: '#000' }}>{companyName}</p>
            <p style={{ margin: '1pt 0 0', fontSize: '8.5pt', color: '#555', letterSpacing: '0.04em' }}>{companySubname}</p>
          </div>
        </div>
        {qrUrl && (
          <div style={{ flexShrink: 0, marginLeft: '6mm', textAlign: 'center' }}>
            <img src={qrUrl} alt="Invoice QR code" style={{ width: '24mm', height: '24mm', display: 'block' }} />
            <p style={{ margin: '1mm 0 0', fontSize: '7pt', color: '#555' }}>{t('doc.scan_to_verify')}</p>
          </div>
        )}
      </div>

      {/* Meta row — invoice number / date / due / currency / status */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm 8mm', fontSize: '8.5pt', marginBottom: '3mm', paddingBottom: '2.5mm', borderBottom: '0.25pt solid #000' }}>
        <MetaRow label={t('inv.invoice_no')} value={invoice.number} />
        <MetaRow label={t('inv.invoice_date')} value={dateLong(invoice.issue_date)} />
        {invoice.due_date && <MetaRow label={t('inv.due_date')} value={dateLong(invoice.due_date)} />}
        <MetaRow label={t('inv.currency')} value={invoice.currency} />
        <MetaRow label={t('inv.status')} value={invoice.status.toUpperCase()} />
        {extras.payment_terms && <MetaRow label={t('inv.payment_terms')} value={extras.payment_terms} />}
      </div>

      {/* ============================================================ */}
      {/* 4. SELLER / CUSTOMER — two-column block                       */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '3mm' }}>
        <div style={{ flex: 1, paddingRight: '4mm', borderRight: '0.25pt solid #000' }}>
          <SectionHeader>{t('party.seller')}</SectionHeader>
          <div style={{ fontSize: '9.5pt', lineHeight: 1.45 }}>
            <p style={{ margin: '0 0 1pt', fontWeight: 700 }}>{companyName}</p>
            {companySubname && <p style={{ margin: '0 0 1pt', color: '#333', fontSize: '8.5pt' }}>{companySubname}</p>}
            {companyAddress && <p style={{ margin: '0 0 1pt', color: '#333' }}>{companyAddress}</p>}
            {companyPhone && <p style={{ margin: '0 0 1pt', color: '#333' }}>{t('party.tel')} {companyPhone}</p>}
            {companyEmail && <p style={{ margin: '0 0 1pt', color: '#333' }}>{companyEmail}</p>}
            {companyWebsite && <p style={{ margin: '0 0 1pt', color: '#333' }}>{companyWebsite}</p>}
            {companyVat && <p style={{ margin: '0 0 1pt', color: '#333' }}>{t('party.vat_id')}: {companyVat}</p>}
            {companyId && <p style={{ margin: '0', color: '#333' }}>{t('party.company_id')}: {companyId}</p>}
          </div>
        </div>
        <div style={{ flex: 1, paddingLeft: '4mm' }}>
          <SectionHeader>{t('party.customer')}</SectionHeader>
          <div style={{ fontSize: '9.5pt', lineHeight: 1.45 }}>
            <p style={{ margin: '0 0 1pt', fontWeight: 700 }}>{invoice.billed_to}</p>
            {invoice.billed_address && <p style={{ margin: '0 0 1pt', color: '#333' }}>{invoice.billed_address}</p>}
            {invoice.billed_email && <p style={{ margin: '0 0 1pt', color: '#333' }}>{invoice.billed_email}</p>}
            {invoice.billed_vat && <p style={{ margin: '0', color: '#333' }}>{t('party.vat_id')}: {invoice.billed_vat}</p>}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. SHIP TO — optional, only when present                      */}
      {/* ============================================================ */}
      {extras.ship_to && hasAnyText(extras.ship_to) && (
        <div style={{ marginBottom: '3mm', borderTop: '0.25pt solid #000', borderBottom: '0.25pt solid #000', padding: '2mm 0' }}>
          <SectionHeader>{t('party.ship_to')}</SectionHeader>
          <div style={{ fontSize: '9.5pt', lineHeight: 1.45, display: 'flex', gap: '6mm' }}>
            <div style={{ flex: 1 }}>
              {extras.ship_to.name && <p style={{ margin: '0 0 1pt', fontWeight: 600 }}>{extras.ship_to.name}</p>}
              {extras.ship_to.company && <p style={{ margin: '0 0 1pt', color: '#333' }}>{extras.ship_to.company}</p>}
              {extras.ship_to.address && <p style={{ margin: '0 0 1pt', color: '#333' }}>{extras.ship_to.address}</p>}
              {(extras.ship_to.city || extras.ship_to.country) && (
                <p style={{ margin: '0 0 1pt', color: '#333' }}>{[extras.ship_to.city, extras.ship_to.country].filter(Boolean).join(', ')}</p>
              )}
              {extras.ship_to.phone && <p style={{ margin: '0', color: '#333' }}>{t('party.tel')} {extras.ship_to.phone}</p>}
            </div>
            {extras.ship_to.delivery_method && (
              <div style={{ flex: '0 0 auto', fontSize: '8.5pt' }}>
                <p style={{ margin: '0 0 1pt', fontSize: '7.5pt', letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>{t('party.delivery_method')}</p>
                <p style={{ margin: '0', fontWeight: 600 }}>{extras.ship_to.delivery_method}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. ADDITIONAL REFERENCES — optional compact row               */}
      {/* ============================================================ */}
      {extras.references && hasAnyText(extras.references) && (
        <div style={{ marginBottom: '3mm', fontSize: '8.5pt' }}>
          <SectionHeader>{t('ref.additional')}</SectionHeader>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm 10mm', borderTop: '0.25pt solid #000', paddingTop: '1.5mm' }}>
            <RefField label={t('ref.order_no')} value={extras.references.order_no} />
            <RefField label={t('ref.customer_no')} value={extras.references.customer_no} />
            <RefField label={t('ref.po_number')} value={extras.references.po_number} />
            <RefField label={t('ref.delivery_note')} value={extras.references.delivery_note} />
            <RefField label={t('ref.salesperson')} value={extras.references.salesperson} />
            <RefField label={t('ref.project')} value={extras.references.project} />
            <RefField label={t('ref.vehicle_reg')} value={extras.references.vehicle_reg} />
            <RefField label={t('ref.vin')} value={extras.references.vin} />
            <RefField label={t('ref.job_card')} value={extras.references.job_card} />
            <RefField label={t('ref.service_date')} value={extras.references.service_date} />
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. MAIN ITEMS TABLE                                           */}
      {/* ============================================================ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt', marginTop: '1mm' }}>
        <thead>
          <tr style={{ background: '#D3D3D3', color: '#000', fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <th style={{ border: '0.25pt solid #000', padding: '1.5mm 1.5mm', width: '6%', textAlign: 'center' }}>#</th>
            <th style={{ border: '0.25pt solid #000', padding: '1.5mm 1.5mm', width: '52%', textAlign: 'left' }}>{t('table.description')}</th>
            <th style={{ border: '0.25pt solid #000', padding: '1.5mm 1.5mm', width: '10%', textAlign: 'right' }}>{t('table.qty')}</th>
            <th style={{ border: '0.25pt solid #000', padding: '1.5mm 1.5mm', width: '15%', textAlign: 'right' }}>{t('table.unit_price')}</th>
            <th style={{ border: '0.25pt solid #000', padding: '1.5mm 1.5mm', width: '17%', textAlign: 'right' }}>{t('table.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {services.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ border: '0.25pt solid #000', padding: '4mm', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                {t('table.no_items')}
              </td>
            </tr>
          ) : services.map((s, i) => (
            <tr key={s.id} style={{ pageBreakInside: 'avoid' }}>
              <td style={{ border: '0.25pt solid #000', padding: '1.5mm', textAlign: 'center', color: '#555', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
              <td style={{ border: '0.25pt solid #000', padding: '1.5mm' }}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                {s.description && <span style={{ display: 'block', color: '#444', fontSize: '8.5pt', marginTop: '0.5pt' }}>{s.description}</span>}
              </td>
              <td style={{ border: '0.25pt solid #000', padding: '1.5mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(s.quantity)}</td>
              <td style={{ border: '0.25pt solid #000', padding: '1.5mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eurFull(Number(s.unit_price))}</td>
              <td style={{ border: '0.25pt solid #000', padding: '1.5mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{eurFull(Number(s.quantity) * Number(s.unit_price))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ============================================================ */}
      {/* 8. TAX SUMMARY — right-aligned compact block                  */}
      {/*     page-break-inside: avoid so the totals never split        */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2.5mm', pageBreakInside: 'avoid' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '9.5pt', width: '55%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '1mm 3mm 1mm 0', color: '#333', textAlign: 'right', borderBottom: '0.25pt solid #ccc' }}>{t('totals.subtotal')}</td>
              <td style={{ padding: '1mm 3mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '0.25pt solid #ccc', fontWeight: 600 }}>{eurFull(subtotal)}</td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 3mm 1mm 0', color: '#333', textAlign: 'right', borderBottom: '0.25pt solid #ccc' }}>
                {t('totals.vat')} ({Number(invoice.vat_pct)}%){invoice.vat_included ? ` ${t('totals.vat_included')}` : ''}
              </td>
              <td style={{ padding: '1mm 3mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '0.25pt solid #ccc' }}>
                {invoice.vat_included ? t('totals.vat_included').replace('· ', '') : eurFull(vatAmount)}
              </td>
            </tr>
            <tr style={{ background: '#D3D3D3' }}>
              <td style={{ padding: '2mm 3mm', fontWeight: 700, fontSize: '11pt', textAlign: 'right', borderTop: '0.75pt solid #000', borderBottom: '0.75pt solid #000' }}>{t('totals.total_due')}</td>
              <td style={{ padding: '2mm 3mm', fontWeight: 700, fontSize: '12pt', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '0.75pt solid #000', borderBottom: '0.75pt solid #000' }}>{eurFull(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <p style={{ margin: '1.5mm 0 0', textAlign: 'right', fontSize: '8.5pt', color: '#333', fontStyle: 'italic' }}>
        {t('totals.amount_in_words')} {totalWords} {invoice.currency} {t('totals.only')}
      </p>

      {/* ============================================================ */}
      {/* 9. BARCODE — reference fingerprint                             */}
      {/* ============================================================ */}
      <div style={{ marginTop: '3mm', display: 'flex', alignItems: 'center', gap: '4mm', borderTop: '0.25pt solid #000', borderBottom: '0.25pt solid #000', padding: '1.5mm 0', pageBreakInside: 'avoid' }}>
        <div style={{ flex: '0 0 auto' }}>
          <p style={{ margin: '0', fontSize: '7.5pt', letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', fontWeight: 700 }}>{t('misc.reference_barcode')}</p>
          <p style={{ margin: '0.5pt 0 0', fontSize: '7pt', color: '#666' }}>{t('misc.cross_reference')}</p>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3mm' }}>
          <div style={{ display: 'flex', height: '8mm', padding: '0.5mm 1mm', border: '0.25pt solid #000' }}>
            {barcodeBars.map((w, i) => (
              <div key={i} style={{ width: `${w * 0.8}pt`, height: '100%', background: i % 2 === 0 ? '#000' : 'transparent' }} />
            ))}
          </div>
          <span style={{ fontFamily: '"Courier New", Courier, monospace', fontSize: '8.5pt', letterSpacing: '0.12em' }}>{invoice.number}</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 10. PAYMENT / BANK DETAILS — optional                          */}
      {/*     page-break-inside: avoid so the block stays together       */}
      {/* ============================================================ */}
      {extras.bank && hasAnyText(extras.bank) && (
        <div style={{ marginTop: '3mm', pageBreakInside: 'avoid' }}>
          <SectionHeader>{t('pay.payment_info')}</SectionHeader>
          <div style={{ display: 'flex', gap: '6mm', borderTop: '0.25pt solid #000', paddingTop: '1.5mm', fontSize: '9.5pt' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 1mm', fontSize: '7.5pt', letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', fontWeight: 700 }}>{t('pay.bank_details')}</p>
              <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.bank')}</Label> {extras.bank.bank || '—'}</p>
              <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.iban')}</Label> <span style={{ fontFamily: 'Courier New, monospace' }}>{extras.bank.iban || '—'}</span></p>
              <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.bic')}</Label> <span style={{ fontFamily: 'Courier New, monospace' }}>{extras.bank.bic || '—'}</span></p>
              {extras.bank.account && <p style={{ margin: '0' }}><Label>{t('pay.account')}</Label> {extras.bank.account}</p>}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 1mm', fontSize: '7.5pt', letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', fontWeight: 700 }}>{t('pay.payment_details')}</p>
              <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.method')}</Label> {t('pay.method_value')}</p>
              {extras.payment_terms && <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.terms')}</Label> {extras.payment_terms}</p>}
              <p style={{ margin: '0 0 1pt' }}><Label>{t('pay.due')}</Label> {invoice.due_date ? dateShort(invoice.due_date) : t('pay.on_receipt')}</p>
              <p style={{ margin: '0' }}><Label>{t('pay.reference')}</Label> {invoice.number}</p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 11. LEGAL / TAX FOOTNOTE — optional                            */}
      {/* ============================================================ */}
      {(extras.legal_notes || freeform) && (
        <div style={{ marginTop: '2.5mm', fontSize: '8.5pt', color: '#333', lineHeight: 1.45 }}>
          {extras.legal_notes && <p style={{ margin: '0 0 1pt' }}>{extras.legal_notes}</p>}
          {freeform && <p style={{ margin: '0 0 1pt', fontStyle: 'italic' }}>{t('misc.notes')} {freeform}</p>}
          <p style={{ margin: '0', fontSize: '7.5pt', color: '#666' }}>
            {t('misc.printed_using_inv')}
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/* 12. SIGNATURE AREAS                                           */}
      {/*     page-break-inside: avoid so the signature block stays       */}
      {/*     together on one page                                       */}
      {/* ============================================================ */}
      <div style={{ marginTop: '4mm', display: 'flex', justifyContent: 'space-between', gap: '8mm', pageBreakInside: 'avoid' }}>
        <SignBlock role={t('misc.issued_by')} name={extras.signature_issued_by} date={dateShort(invoice.issue_date)} t={t} />
        <SignBlock role={t('misc.received_by')} name="" date="" t={t} />
      </div>

      {/* ============================================================ */}
      {/* 13. SECONDARY SECTION — optional                               */}
      {/*     page-break-inside: avoid so the block stays together       */}
      {/* ============================================================ */}
      {extras.secondary_section && extras.secondary_section.content.trim() && (
        <div style={{ marginTop: '4mm', borderTop: '0.5pt solid #000', paddingTop: '2mm', pageBreakInside: 'avoid' }}>
          <div style={{ background: '#E7E7E7', fontSize: '8.5pt', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '1mm 2mm', marginBottom: '1.5mm' }}>
            {extras.secondary_section.type}
          </div>
          <p style={{ margin: '0', fontSize: '8.5pt', color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {extras.secondary_section.content}
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/* 14. FOOTER — repeats on every printed page (position: fixed)   */}
      {/*      Aligned with the 7mm @page side margins. The 14mm bottom  */}
      {/*      @page margin reserves space so content never overlaps.    */}
      {/* ============================================================ */}
      <div style={{
        position: 'fixed',
        bottom: '2mm',
        left: '7mm',
        right: '7mm',
        borderTop: '0.5pt solid #000',
        paddingTop: '1.5mm',
        fontSize: '7.5pt',
        color: '#555',
        lineHeight: 1.4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('misc.copyright', { year: String(new Date().getFullYear()), company: companyName })}</span>
          <span>{companyVat ? `${t('party.vat_id')}: ${companyVat}` : ''}{companyId ? `${companyVat ? ' · ' : ''}${t('party.company_id')}: ${companyId}` : ''}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5pt' }}>
          <span>{t('misc.document')} {invoice.number} · {t('misc.printed_using_inv')}</span>
          <span>{companyEmail}{companyPhone ? ` · ${companyPhone}` : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: '0 0 1.5mm',
      fontSize: '8.5pt',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#000',
      fontWeight: 700,
      // Keep the header with the content that follows — don't let a
      // header sit alone at the bottom of a page with its content
      // pushed to the next page.
      pageBreakAfter: 'avoid',
    }}>
      {children}
    </p>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', marginBottom: '0.6mm' }}>
      <span style={{ width: '32mm', fontWeight: 700, color: '#333', flexShrink: 0 }}>{label}:</span>
      <span style={{ flex: 1, color: '#111' }}>{value}</span>
    </div>
  )
}

function RefField({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: '1.5mm' }}>
      <span style={{ fontWeight: 700, color: '#444', fontSize: '7.5pt', letterSpacing: '0.04em' }}>{label}:</span>
      <span style={{ color: '#111' }}>{value}</span>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 700, color: '#333' }}>{children}</span>
}

function SignBlock({ role, name, date, t }: { role: string; name: string; date: string; t: (k: string) => string }) {
  return (
    <div style={{ width: '46%' }}>
      <p style={{ margin: '0 0 1pt', fontSize: '7.5pt', letterSpacing: '0.1em', color: '#444', textTransform: 'uppercase', fontWeight: 700 }}>
        {role}
      </p>
      {name && <p style={{ margin: '0 0 6mm', fontSize: '9pt', fontWeight: 600 }}>{name}</p>}
      {!name && <p style={{ margin: '0 0 6mm', fontSize: '8.5pt', color: '#888' }}>__________________</p>}
      <div style={{ borderTop: '0.25pt solid #000', paddingTop: '1mm', fontSize: '8.5pt', display: 'flex', justifyContent: 'space-between' }}>
        <span>{t('misc.signature')}</span>
        <span>{date || <span style={{ color: '#888' }}>{t('misc.date')} __________</span>}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function hasAnyText(obj: Record<string, any>): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '')
}

/** Deterministic Code-128-style bar pattern derived from a string.
 *  Not a real Code-128 — it's a unique visual fingerprint that matches
 *  the human-readable text.  For a true scannable Code-128 you'd swap
 *  this for a barcode font + the Code-128 encoder. */
function buildBarcodeBars(s: string): number[] {
  const bars: number[] = []
  bars.push(2, 1, 1, 2)  // quiet zone
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    bars.push(
      1 + (code % 3),
      1 + ((code >> 2) % 3),
      1 + ((code >> 4) % 3),
      1 + ((code >> 6) % 3),
    )
  }
  bars.push(2, 1, 2, 1)  // stop
  return bars
}

/** Convert a number to English words for the "amount in words" line. */
function numberToWords(n: number): string {
  if (n === 0) return 'zero'
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const scales = ['', 'thousand', 'million', 'billion']

  function threeDigit(n: number): string {
    const parts: string[] = []
    const h = Math.floor(n / 100)
    const r = n % 100
    if (h > 0) parts.push(ones[h] + ' hundred')
    if (r > 0) {
      if (r < 10) parts.push(ones[r])
      else if (r < 20) parts.push(teens[r - 10])
      else parts.push(tens[Math.floor(r / 10)] + (r % 10 ? '-' + ones[r % 10] : ''))
    }
    return parts.join(' ')
  }

  const int = Math.floor(n)
  const cents = Math.round((n - int) * 100)
  const groups: number[] = []
  let rest = int
  while (rest > 0) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }
  const words = groups
    .map((g, i) => (g === 0 ? '' : threeDigit(g) + (scales[i] ? ' ' + scales[i] : '')))
    .filter(Boolean)
    .reverse()
    .join(' ')

  const centsStr = cents > 0 ? ` and ${cents}/100` : ''
  return (words || 'zero') + centsStr
}
