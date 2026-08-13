import {
  FINANCE_CATEGORY_META,
  FINANCE_REVENUE_CATEGORIES,
  FINANCE_COST_CATEGORIES,
} from '../lib/types'
import type { FinanceEntry, FinanceCategory, Deal } from '../lib/types'
import { eurFull, dateLong, dateShort } from '../lib/format'
import { createPortal } from 'react-dom'

const LOGO_URL = 'https://kappa.lol/FAHnNi'

interface Props {
  entries: FinanceEntry[]
  periodLabel: string
  fromDate: string
  toDate: string
  dealMap: Record<string, Deal>
}

/**
 * Formal SEC Form 10-K-style Statement of Operations.
 *
 * Rendered with the `print-document` + `print-only` classes — so it's
 * hidden on screen (the user sees the friendlier in-app modal preview)
 * and only becomes visible when the browser enters print mode. The
 * print CSS in index.css hides #root entirely and shows only this
 * element, so what comes out of the printer (or "Save as PDF") is a
 * clean, official-looking financial document.
 *
 * Document structure:
 *   - Cover page: logo, form ID, document title, period, prepared-by
 *   - Part I  — Revenue summary by category
 *   - Part II — Operating Expenses summary by category
 *   - Computed totals: Total Revenue, Total Expenses, Net Income, Margin
 *   - Schedule A — Detailed Revenue Ledger
 *   - Schedule B — Detailed Expense Ledger
 *   - Signature block + footer
 */
export function FormalBalanceSheetDocument({
  entries, periodLabel, fromDate, toDate, dealMap,
}: Props) {
  const rev = entries.filter((e) => e.kind === 'revenue')
  const cost = entries.filter((e) => e.kind === 'cost')

  /* Per-category sums */
  const revByCat = sumByCategory(rev)
  const costByCat = sumByCategory(cost)

  const totalRev = rev.reduce((s, e) => s + Number(e.amount), 0)
  const totalCost = cost.reduce((s, e) => s + Number(e.amount), 0)
  const net = totalRev - totalCost
  const margin = totalRev > 0 ? (net / totalRev) * 100 : 0

  /* Document reference number — stable, sortable, includes period */
  const docRef = `CCCRM-FIN-${new Date(fromDate).getFullYear()}-${periodRef(periodLabel)}`
  const generatedDate = new Date()
  const generatedLong = dateLong(generatedDate.toISOString())
  const year = new Date(fromDate).getFullYear()

  /* Header/footer signature lines use today's date by default */
  const today = dateLong(new Date().toISOString())

  /* Render through a portal to document.body so the formal document
     is a SIBLING of #root, not a descendant. The print CSS hides #root
     entirely — if this element were inside #root it would be hidden
     too. Portaling it to <body> keeps it visible during print. */
  return createPortal(
    <div
      className="print-document print-only"
      style={{
        fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        color: '#000',
        maxWidth: '210mm',
        margin: '0 auto',
        padding: '8mm 0',
        fontSize: '11pt',
        lineHeight: 1.45,
      }}
    >
      {/* ============================================================ */}
      {/* COVER PAGE                                                   */}
      {/* ============================================================ */}
      <section style={{ minHeight: '230mm', display: 'flex', flexDirection: 'column' }}>
        {/* Top rule + form identifier */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '6pt', marginBottom: '18pt' }}>
          <span style={{ fontSize: '9pt', letterSpacing: '0.15em' }}>FORM CCCRM-FIN</span>
          <span style={{ fontSize: '9pt', letterSpacing: '0.15em' }}>{docRef}</span>
        </div>

        {/* Logo + company name */}
        <div style={{ textAlign: 'center', marginTop: '40pt' }}>
          <img
            src={LOGO_URL}
            alt="Calista Concept"
            style={{ height: '64pt', width: 'auto', marginBottom: '20pt' }}
          />
          <h1 style={{ fontSize: '26pt', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>
            CALISTA CONCEPT
          </h1>
          <p style={{ fontSize: '11pt', letterSpacing: '0.25em', marginTop: '4pt', marginBottom: '32pt' }}>
            REFERRALS &amp; REVENUE PLATFORM
          </p>
        </div>

        {/* Document title */}
        <div style={{ textAlign: 'center', marginTop: '24pt' }}>
          <p style={{ fontSize: '10pt', letterSpacing: '0.3em', margin: 0 }}>ANNUAL FINANCIAL REPORT</p>
          <h2 style={{ fontSize: '20pt', fontWeight: 700, margin: '6pt 0 14pt' }}>Statement of Operations</h2>
          <div style={{ height: '1px', background: '#000', width: '60%', margin: '0 auto 16pt' }} />
          <p style={{ fontSize: '13pt', margin: 0 }}>{periodLabel}</p>
          <p style={{ fontSize: '10pt', marginTop: '4pt' }}>
            For the period {dateLong(fromDate)} through {dateLong(toDate)}
          </p>
        </div>

        {/* Cover-page facts table */}
        <div style={{ marginTop: 'auto', paddingTop: '24pt' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
            <tbody>
              <CoverRow label="Exact period start" value={dateLong(fromDate)} />
              <CoverRow label="Exact period end" value={dateLong(toDate)} />
              <CoverRow label="Total revenue" value={eurFull(totalRev)} />
              <CoverRow label="Total operating expenses" value={eurFull(totalCost)} />
              <CoverRow label="Net result" value={`${net >= 0 ? '' : '('}${eurFull(Math.abs(net))}${net >= 0 ? '' : ')'}`} bold />
              <CoverRow label="Profit margin" value={`${margin.toFixed(2)}%`} />
              <CoverRow label="Document reference" value={docRef} />
              <CoverRow label="Date prepared" value={today} />
              <CoverRow label="Filing standard" value="CCCRM Internal Accounting Standard" last />
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: '8pt', marginTop: '14pt', fontStyle: 'italic', textAlign: 'center', color: '#444' }}>
          This document is generated from the CCCRM Finances ledger and represents the unaudited
          financial position of the platform for the stated period.
        </p>
      </section>

      {/* ============================================================ */}
      {/* PAGE 2 — SUMMARY                                             */}
      {/* ============================================================ */}
      <section className="print-page" style={{ marginTop: '12pt' }}>
        <DocHeader docRef={docRef} title="Consolidated Summary" />

        <h3 style={{ fontSize: '12pt', fontWeight: 700, margin: '20pt 0 8pt', borderBottom: '1px solid #000', paddingBottom: '3pt' }}>
          PART I — REVENUE
        </h3>
        <MoneyTable
          rows={FINANCE_REVENUE_CATEGORIES.map((c) => ({
            label: FINANCE_CATEGORY_META[c].label,
            amount: revByCat[c] || 0,
            count: rev.filter((e) => e.category === c).length,
          }))}
          totalLabel="TOTAL REVENUE"
          total={totalRev}
        />

        <h3 style={{ fontSize: '12pt', fontWeight: 700, margin: '24pt 0 8pt', borderBottom: '1px solid #000', paddingBottom: '3pt' }}>
          PART II — OPERATING EXPENSES
        </h3>
        <MoneyTable
          rows={FINANCE_COST_CATEGORIES.map((c) => ({
            label: FINANCE_CATEGORY_META[c].label,
            amount: costByCat[c] || 0,
            count: cost.filter((e) => e.category === c).length,
          }))}
          totalLabel="TOTAL OPERATING EXPENSES"
          total={totalCost}
        />

        {/* Net result block */}
        <div style={{ marginTop: '26pt', border: '2px solid #000', padding: '12pt 14pt' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt', fontWeight: 700 }}>
            <span>NET INCOME {net < 0 ? '(LOSS)' : ''}</span>
            <span>{net >= 0 ? eurFull(net) : `(${eurFull(Math.abs(net))})`}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', marginTop: '6pt', borderTop: '1px solid #000', paddingTop: '6pt' }}>
            <span>Profit margin on revenue</span>
            <span>{margin.toFixed(2)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', marginTop: '4pt' }}>
            <span>Period covered</span>
            <span>{dateShort(fromDate)} – {dateShort(toDate)}</span>
          </div>
        </div>

        <p style={{ fontSize: '9pt', marginTop: '18pt', fontStyle: 'italic', color: '#333' }}>
          The accompanying notes and detailed ledgers (Schedules A &amp; B) are an integral part of
          this statement.
        </p>
      </section>

      {/* ============================================================ */}
      {/* SCHEDULE A — DETAILED REVENUE LEDGER                         */}
      {/* ============================================================ */}
      <section className="print-page" style={{ marginTop: '12pt' }}>
        <DocHeader docRef={docRef} title="Schedule A — Detailed Revenue Ledger" />

        <LedgerTable
          entries={rev}
          dealMap={dealMap}
          total={totalRev}
          totalLabel="TOTAL REVENUE"
          emptyText="No revenue entries recorded in this period."
        />
      </section>

      {/* ============================================================ */}
      {/* SCHEDULE B — DETAILED EXPENSE LEDGER                         */}
      {/* ============================================================ */}
      <section className="print-page" style={{ marginTop: '12pt' }}>
        <DocHeader docRef={docRef} title="Schedule B — Detailed Expense Ledger" />

        <LedgerTable
          entries={cost}
          dealMap={dealMap}
          total={totalCost}
          totalLabel="TOTAL OPERATING EXPENSES"
          emptyText="No expense entries recorded in this period."
        />
      </section>

      {/* ============================================================ */}
      {/* SIGNATURE PAGE                                               */}
      {/* ============================================================ */}
      <section className="print-page" style={{ marginTop: '12pt' }}>
        <DocHeader docRef={docRef} title="Certification" />

        <p style={{ fontSize: '11pt', marginTop: '20pt', lineHeight: 1.6 }}>
          The undersigned hereby certifies that, to the best of their knowledge and belief,
          the foregoing Statement of Operations and accompanying Schedules A and B present
          fairly, in all material respects, the financial position of Calista Concept CRM
          for the period {dateLong(fromDate)} through {dateLong(toDate)}, and that the
          entries comprising {rev.length} revenue items and {cost.length} expense items
          were transacted in the ordinary course of platform operations and have been
          faithfully recorded in the CCCRM Finances ledger.
        </p>

        <div style={{ marginTop: '50pt' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40pt' }}>
            <SignBlock role="Prepared by" date={today} />
            <SignBlock role="Reviewed by" date="" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <SignBlock role="Approved by" date="" />
            <SignBlock role="Date certified" date={today} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: '40pt', borderTop: '1px solid #000', fontSize: '8.5pt', color: '#444', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>Calista Concept CRM · Referrals &amp; Revenue Platform</p>
          <p style={{ margin: '2pt 0 0' }}>Document {docRef} · Generated {generatedLong} · Page 5 of 5 · CCCRM Internal Accounting Standard</p>
          <p style={{ margin: '6pt 0 0', fontStyle: 'italic' }}>
            This is a computer-generated document. No signature is valid unless hand-signed.
          </p>
        </div>
      </section>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */
function CoverRow({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <tr style={{ borderBottom: last ? 'none' : '1px solid #ccc' }}>
      <td style={{ padding: '6pt 0', color: '#444', fontSize: '9pt', letterSpacing: '0.05em', textTransform: 'uppercase', width: '40%' }}>{label}</td>
      <td style={{ padding: '6pt 0', fontWeight: bold ? 700 : 400, fontSize: bold ? '11pt' : '10pt' }}>{value}</td>
    </tr>
  )
}

function DocHeader({ docRef, title }: { docRef: string; title: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '4pt' }}>
      <div>
        <p style={{ margin: 0, fontSize: '8.5pt', letterSpacing: '0.15em', color: '#444' }}>CALISTA CONCEPT · STATEMENT OF OPERATIONS</p>
        <h3 style={{ margin: '4pt 0 0', fontSize: '13pt', fontWeight: 700 }}>{title}</h3>
      </div>
      <span style={{ fontSize: '8.5pt', letterSpacing: '0.15em', color: '#444' }}>{docRef}</span>
    </div>
  )
}

interface MoneyRow {
  label: string
  amount: number
  count: number
}

function MoneyTable({ rows, totalLabel, total }: { rows: MoneyRow[]; totalLabel: string; total: number }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #000', fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444' }}>
          <th style={{ textAlign: 'left', padding: '4pt 0', width: '60%' }}>Category</th>
          <th style={{ textAlign: 'right', padding: '4pt 0', width: '12%' }}>Entries</th>
          <th style={{ textAlign: 'right', padding: '4pt 0', width: '28%' }}>Amount (EUR)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} style={{ borderBottom: '1px solid #ddd' }}>
            <td style={{ padding: '5pt 0' }}>{r.label}</td>
            <td style={{ padding: '5pt 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#444' }}>{r.count || '—'}</td>
            <td style={{ padding: '5pt 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {r.amount > 0 ? eurFull(r.amount) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ borderTop: '2px solid #000', fontWeight: 700 }}>
          <td style={{ padding: '6pt 0' }}>{totalLabel}</td>
          <td />
          <td style={{ padding: '6pt 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eurFull(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function LedgerTable({
  entries, dealMap, total, totalLabel, emptyText,
}: {
  entries: FinanceEntry[]
  dealMap: Record<string, Deal>
  total: number
  totalLabel: string
  emptyText: string
}) {
  if (entries.length === 0) {
    return <p style={{ fontSize: '10pt', fontStyle: 'italic', color: '#444', padding: '20pt 0', textAlign: 'center' }}>{emptyText}</p>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt', marginTop: '8pt' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #000', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444' }}>
          <th style={{ textAlign: 'left', padding: '4pt 6pt 4pt 0', width: '10%' }}>Date</th>
          <th style={{ textAlign: 'left', padding: '4pt 6pt', width: '24%' }}>Title</th>
          <th style={{ textAlign: 'left', padding: '4pt 6pt', width: '16%' }}>Category</th>
          <th style={{ textAlign: 'left', padding: '4pt 6pt', width: '30%' }}>Description</th>
          <th style={{ textAlign: 'right', padding: '4pt 0 4pt 6pt', width: '20%' }}>Amount (EUR)</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const linked = e.deal_id ? dealMap[e.deal_id] : null
          const desc = [e.description, linked ? `Linked deal: ${linked.company}` : ''].filter(Boolean).join(' · ') || '—'
          return (
            <tr key={e.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '4pt 6pt 4pt 0', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{dateShort(e.entry_date)}</td>
              <td style={{ padding: '4pt 6pt', fontWeight: 600 }}>{e.title || FINANCE_CATEGORY_META[e.category as FinanceCategory].label}</td>
              <td style={{ padding: '4pt 6pt', color: '#333' }}>{FINANCE_CATEGORY_META[e.category as FinanceCategory].label}</td>
              <td style={{ padding: '4pt 6pt', color: '#444', fontSize: '9pt' }}>{desc}</td>
              <td style={{ padding: '4pt 0 4pt 6pt', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eurFull(Number(e.amount))}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ borderTop: '2px solid #000', fontWeight: 700 }}>
          <td colSpan={4} style={{ padding: '6pt 0', textAlign: 'right' }}>{totalLabel}</td>
          <td style={{ padding: '6pt 0 6pt 6pt', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{eurFull(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function SignBlock({ role, date }: { role: string; date: string }) {
  return (
    <div style={{ width: '44%' }}>
      <p style={{ fontSize: '8.5pt', color: '#444', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{role}</p>
      <div style={{ marginTop: '36pt', borderTop: '1px solid #000', paddingTop: '4pt', fontSize: '9pt' }}>
        {date || <span style={{ color: '#888' }}>____________________</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function sumByCategory(entries: FinanceEntry[]): Record<string, number> {
  const m: Record<string, number> = {}
  entries.forEach((e) => { m[e.category] = (m[e.category] || 0) + Number(e.amount) })
  return m
}

function periodRef(periodLabel: string): string {
  // Turn "Q3 2025" → "Q3-2025", "August 2025" → "M08-2025", "2025" → "Y-2025", "All time" → "ALL"
  const q = periodLabel.match(/^Q(\d)\s+(\d{4})$/)
  if (q) return `Q${q[1]}-${q[2]}`
  const y = periodLabel.match(/^(\d{4})$/)
  if (y) return `Y-${y[1]}`
  if (periodLabel.toLowerCase().includes('all')) return 'ALL'
  const m = periodLabel.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const monthIdx = new Date(Date.parse(`${m[1]} 1, ${m[2]}`)).getMonth() + 1
    return `M${String(monthIdx).padStart(2, '0')}-${m[2]}`
  }
  // custom range — use first 8 chars of label
  return periodLabel.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12).toUpperCase() || 'CUSTOM'
}
