import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Contract, ContractTemplate, InvoiceSettings } from '../lib/types'
import { CONTRACT_PLACEHOLDERS } from '../lib/types'
import { parseContractNotes } from '../lib/contractExtras'
import { dateLong, dateShort } from '../lib/format'

const LOGO_URL = 'https://kappa.lol/FAHnNi'

interface Props {
  contract: Contract
  template: ContractTemplate | null
  settings: InvoiceSettings
}

/**
 * Formal A4 contract document — corporate / official style.
 *
 * Rendered via createPortal to document.body and shown only during
 * print (the index.css @media print rule hides #root and shows
 * .print-document).
 *
 * Design language (per user spec):
 *   - Arial throughout, NO gray bars (unlike invoices)
 *   - Logo on the FIRST page only (top-left, small)
 *   - Barcode on EVERY page (top-right) — the contract number
 *   - Corporate / official feel — clean black text on white, thin
 *     hairline rules only, no decorative elements
 *   - Template body is markdown with {placeholders} → filled with
 *     counterparty + issuer data
 *   - Multi-page: content flows naturally; the barcode is in a
 *     `position: fixed` header that repeats on every printed page
 */
export function FormalContractDocument({ contract, template, settings }: Props) {
  const barcodeBars = buildBarcodeBars(contract.number)

  // Fill template placeholders with real data
  const filledBody = template
    ? fillPlaceholders(template.body, contract, settings)
    : ''

  return createPortal(
    <div
      className="print-document print-only"
      style={{
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        color: '#000',
        width: '100%',
        padding: 0,
        fontSize: '11pt',
        lineHeight: 1.55,
        boxSizing: 'border-box',
        background: '#fff',
      }}
    >
      {/* ============================================================ */}
      {/* LETTERHEAD — logo + barcode.  Part of the NORMAL flow (not    */}
      {/* position: fixed — that was causing overlaps in every browser  */}
      {/* because print engines position fixed elements differently).  */}
      {/* Sits at the top of page 1, content flows after it.             */}
      {/* ============================================================ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '0.5pt solid #000',
        paddingBottom: '3mm',
        marginBottom: '6mm',
      }}>
        {/* Left: logo + company name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3mm' }}>
          <img src={LOGO_URL} alt={settings.company_name} style={{ height: '10mm', width: 'auto' }} />
          <div style={{ fontSize: '8pt', lineHeight: 1.3 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '10pt' }}>{settings.company_name}</p>
            <p style={{ margin: 0, fontSize: '7.5pt', color: '#555' }}>{settings.company_subname}</p>
          </div>
        </div>
        {/* Right: barcode */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', height: '6mm', padding: '0.5mm 1mm', border: '0.25pt solid #000' }}>
            {barcodeBars.map((w, i) => (
              <div key={i} style={{ width: `${w * 0.7}pt`, height: '100%', background: i % 2 === 0 ? '#000' : 'transparent' }} />
            ))}
          </div>
          <p style={{ margin: '0.5mm 0 0', fontFamily: '"Courier New", Courier, monospace', fontSize: '6.5pt', letterSpacing: '0.1em' }}>
            {contract.number}
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONTENT — title, parties, template body, signatures           */}
      {/* ============================================================ */}
      <div>
        {/* ========================================================== */}
        {/* TITLE BLOCK — first page only                               */}
        {/* ========================================================== */}
        <div style={{ textAlign: 'center', marginBottom: '8mm', paddingBottom: '4mm', borderBottom: '0.5pt solid #000' }}>
          <p style={{ margin: '0 0 1mm', fontSize: '8pt', letterSpacing: '0.2em', color: '#444', textTransform: 'uppercase' }}>
            {template?.name || 'CONTRACT'}
          </p>
          <h1 style={{ margin: 0, fontSize: '14pt', fontWeight: 700, letterSpacing: '0.04em' }}>
            {template?.name || 'AGREEMENT'}
          </h1>
          <p style={{ margin: '2mm 0 0', fontSize: '9pt', color: '#555', fontVariantNumeric: 'tabular-nums' }}>
            Contract No. {contract.number} · Issued {dateLong(contract.issue_date)}
          </p>
        </div>

        {/* ========================================================== */}
        {/* PARTIES BLOCK                                               */}
        {/* ========================================================== */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '8mm' }}>
          <div style={{ flex: 1, paddingRight: '5mm', borderRight: '0.25pt solid #000' }}>
            <p style={{ margin: '0 0 2mm', fontSize: '8pt', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#333' }}>Between — Issuer</p>
            <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 1pt', fontWeight: 700 }}>{settings.company_name}</p>
              <p style={{ margin: '0 0 1pt', color: '#444', fontSize: '9pt' }}>{settings.company_subname}</p>
              {settings.company_address && <p style={{ margin: '0 0 1pt', color: '#444' }}>{settings.company_address}</p>}
              {settings.company_email && <p style={{ margin: '0 0 1pt', color: '#444' }}>{settings.company_email}</p>}
              {settings.company_phone && <p style={{ margin: '0 0 1pt', color: '#444' }}>Tel: {settings.company_phone}</p>}
              {settings.company_vat && <p style={{ margin: '0 0 1pt', color: '#444' }}>VAT: {settings.company_vat}</p>}
              {settings.company_id && <p style={{ margin: '0', color: '#444' }}>Reg. No: {settings.company_id}</p>}
            </div>
          </div>
          <div style={{ flex: 1, paddingLeft: '5mm' }}>
            <p style={{ margin: '0 0 2mm', fontSize: '8pt', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#333' }}>And — Counterparty</p>
            <div style={{ fontSize: '10pt', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 1pt', fontWeight: 700 }}>{contract.counterparty_name}</p>
              {contract.counterparty_company && <p style={{ margin: '0 0 1pt', color: '#444' }}>{contract.counterparty_company}</p>}
              {contract.counterparty_address && <p style={{ margin: '0 0 1pt', color: '#444' }}>{contract.counterparty_address}</p>}
              {contract.counterparty_phone && <p style={{ margin: '0 0 1pt', color: '#444' }}>Tel: {contract.counterparty_phone}</p>}
              {contract.counterparty_email && <p style={{ margin: '0 0 1pt', color: '#444' }}>{contract.counterparty_email}</p>}
              {contract.counterparty_vat && <p style={{ margin: '0', color: '#444' }}>VAT: {contract.counterparty_vat}</p>}
            </div>
          </div>
        </div>

        {/* ========================================================== */}
        {/* DATE TERMS                                                 */}
        {/* ========================================================== */}
        <div style={{ marginBottom: '8mm', fontSize: '9.5pt' }}>
          {contract.start_date && (
            <p style={{ margin: '0 0 1pt' }}>
              <strong>Effective from:</strong> {dateLong(contract.start_date)}
              {contract.end_date ? ` through ${dateLong(contract.end_date)}` : ' until terminated'}
            </p>
          )}
          {!contract.start_date && (
            <p style={{ margin: '0 0 1pt' }}>
              <strong>Date of agreement:</strong> {dateLong(contract.issue_date)}
            </p>
          )}
        </div>

        {/* ========================================================== */}
        {/* TEMPLATE BODY — markdown with placeholders filled in          */}
        {/* ========================================================== */}
        {filledBody ? (
          <div className="md" style={{ fontSize: '10.5pt', lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{filledBody}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ fontSize: '10pt', color: '#666', fontStyle: 'italic', padding: '10mm 0', textAlign: 'center' }}>
            No template selected for this contract. Add a template in Settings → Contract Templates.
          </div>
        )}

        {/* ========================================================== */}
        {/* SIGNATURE BLOCK                                            */}
        {/* ========================================================== */}
        <div style={{ marginTop: '14mm', paddingTop: '4mm', borderTop: '0.5pt solid #000', display: 'flex', justifyContent: 'space-between', gap: '10mm', pageBreakInside: 'avoid' }}>
          <SignBlock
            label={`For ${settings.company_name || 'the Issuer'}`}
            name=""
            date={dateShort(contract.issue_date)}
          />
          <SignBlock
            label={'For ' + (contract.counterparty_company || contract.counterparty_name || 'the Counterparty')}
            name={contract.counterparty_name}
            date=""
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* FOOTER — normal flow (bottom of the document).  No position:   */}
      {/* fixed — that was causing the overlap.  Sits after the          */}
      {/* signature block.                                              */}
      {/* ============================================================ */}
      <div style={{
        marginTop: '10mm',
        borderTop: '0.5pt solid #000',
        paddingTop: '2mm',
        fontSize: '7.5pt',
        color: '#555',
        lineHeight: 1.4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>© {new Date().getFullYear()} {settings.company_name}. All rights reserved.</span>
          <span>Document {contract.number} · Printed using CCContractEngine v1.0</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5pt' }}>
          <span>{settings.company_email}{settings.company_phone ? ` · ${settings.company_phone}` : ''}</span>
          <span>{settings.company_vat ? `VAT: ${settings.company_vat}` : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */
function SignBlock({ label, name, date }: { label: string; name: string; date: string }) {
  return (
    <div style={{ width: '46%' }}>
      <p style={{ margin: '0 0 1pt', fontSize: '8pt', fontWeight: 700, color: '#333' }}>{label}</p>
      {name && <p style={{ margin: '0 0 12mm', fontSize: '9.5pt', fontWeight: 600 }}>{name}</p>}
      {!name && <p style={{ margin: '0 0 12mm', fontSize: '9pt', color: '#888' }}>________________________</p>}
      <div style={{ borderTop: '0.25pt solid #000', paddingTop: '1mm', fontSize: '8.5pt', display: 'flex', justifyContent: 'space-between' }}>
        <span>Signature</span>
        <span>{date || <span style={{ color: '#888' }}>Date: ____________</span>}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Fill all {placeholders} in the template body with real contract
 *  + issuer data + per-contract custom field values.  Unknown
 *  placeholders are left as-is so the admin sees them and can fix
 *  the template. */
function fillPlaceholders(body: string, c: Contract, s: InvoiceSettings): string {
  // Parse custom fields from the contract's notes JSON
  const { custom_fields } = parseContractNotes(c.notes)

  // Build the standard placeholder map
  const map: Record<string, string> = {
    contract_number: c.number,
    issue_date: dateLong(c.issue_date),
    start_date: c.start_date ? dateLong(c.start_date) : '',
    end_date: c.end_date ? dateLong(c.end_date) : '',
    counterparty_name: c.counterparty_name,
    counterparty_company: c.counterparty_company,
    counterparty_address: c.counterparty_address,
    counterparty_phone: c.counterparty_phone,
    counterparty_email: c.counterparty_email,
    counterparty_vat: c.counterparty_vat,
    company_name: s.company_name,
    company_subname: s.company_subname,
    company_address: s.company_address,
    company_email: s.company_email,
    company_phone: s.company_phone,
    company_website: s.company_website,
    company_vat: s.company_vat,
    company_id: s.company_id,
    current_date: dateLong(new Date().toISOString()),
  }

  // Merge in custom field values — these override nothing in the
  // standard map (they're different keys) but they fill any
  // {custom_key} the admin defined on the template.
  for (const [k, v] of Object.entries(custom_fields)) {
    if (v && v.trim()) map[k] = v.trim()
  }

  return body.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? `{${k}}`)
}

/** Deterministic Code-128-style bar pattern. */
function buildBarcodeBars(s: string): number[] {
  const bars: number[] = []
  bars.push(2, 1, 1, 2)
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    bars.push(
      1 + (code % 3),
      1 + ((code >> 2) % 3),
      1 + ((code >> 4) % 3),
      1 + ((code >> 6) % 3),
    )
  }
  bars.push(2, 1, 2, 1)
  return bars
}
