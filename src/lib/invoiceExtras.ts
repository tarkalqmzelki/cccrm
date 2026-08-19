import type { Invoice } from './types'

/** Optional extra fields for an invoice, stored as a JSON envelope in
 *  the existing `notes` text column (no DB migration needed).  All
 *  fields are optional — the editor exposes them as collapsible
 *  "optional sections"; the renderer only shows a section when it has
 *  data.  This keeps simple invoices simple (plain-text notes) while
 *  letting the admin produce a full ERP-style document when needed. */

export interface ShipTo {
  name: string
  company: string
  address: string
  city: string
  country: string
  phone: string
  delivery_method: string
}

export interface InvoiceReferences {
  order_no: string
  customer_no: string
  po_number: string
  delivery_note: string
  salesperson: string
  project: string
  vehicle_reg: string
  vin: string
  job_card: string
  service_date: string
}

export interface BankDetails {
  bank: string
  iban: string
  bic: string
  account: string
}

export interface SecondarySection {
  type: string // 'Delivery Note' | 'Receipt' | 'Job Card' | 'Payment Record' | custom
  content: string
}

export interface InvoiceExtras {
  document_type: string // 'Original' | 'Copy' | 'Duplicate' | 'Proforma' | 'Credit Note' | 'Receipt'
  payment_terms: string
  ship_to: ShipTo | null
  references: InvoiceReferences | null
  bank: BankDetails | null
  legal_notes: string
  qr_enabled: boolean
  qr_payload: string
  signature_issued_by: string
  secondary_section: SecondarySection | null
}

export const DEFAULT_EXTRAS: InvoiceExtras = {
  document_type: 'Original',
  payment_terms: '',
  ship_to: null,
  references: null,
  bank: null,
  legal_notes: '',
  qr_enabled: false,
  qr_payload: '',
  signature_issued_by: '',
  secondary_section: null,
}

export const DOCUMENT_TYPES = ['Original', 'Copy', 'Duplicate', 'Proforma', 'Credit Note', 'Receipt']
export const SECONDARY_SECTION_TYPES = ['Delivery Note', 'Receipt', 'Job Card', 'Payment Record']

/** Parse the `notes` field of an invoice into freeform text + extras.
 *  Backwards-compatible: if `notes` doesn't look like our JSON envelope,
 *  treat the whole string as freeform notes (existing invoices keep
 *  working unchanged). */
export function parseInvoiceNotes(notes: string): { freeform: string; extras: InvoiceExtras } {
  if (!notes) return { freeform: '', extras: { ...DEFAULT_EXTRAS } }
  const trimmed = notes.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      // Only treat as our envelope if it has at least one known extras
      // key; otherwise it's some other JSON the user pasted as notes.
      const knownKeys = ['document_type', 'payment_terms', 'ship_to', 'references', 'bank', 'legal_notes', 'qr_enabled', 'qr_payload', 'signature_issued_by', 'secondary_section', 'freeform']
      const hasAny = knownKeys.some((k) => k in parsed)
      if (!hasAny) return { freeform: notes, extras: { ...DEFAULT_EXTRAS } }
      return {
        freeform: parsed.freeform ?? '',
        extras: {
          ...DEFAULT_EXTRAS,
          document_type: parsed.document_type ?? 'Original',
          payment_terms: parsed.payment_terms ?? '',
          ship_to: parsed.ship_to ?? null,
          references: parsed.references ?? null,
          bank: parsed.bank ?? null,
          legal_notes: parsed.legal_notes ?? '',
          qr_enabled: parsed.qr_enabled ?? false,
          qr_payload: parsed.qr_payload ?? '',
          signature_issued_by: parsed.signature_issued_by ?? '',
          secondary_section: parsed.secondary_section ?? null,
        },
      }
    } catch {
      return { freeform: notes, extras: { ...DEFAULT_EXTRAS } }
    }
  }
  return { freeform: notes, extras: { ...DEFAULT_EXTRAS } }
}

/** Serialize freeform notes + extras back into the `notes` column.
 *  If no extras are set (all defaults), save as plain freeform text for
 *  backwards compatibility with simple invoices. */
export function serializeInvoiceNotes(freeform: string, extras: InvoiceExtras): string {
  const hasExtras =
    extras.document_type !== 'Original' ||
    extras.payment_terms.trim() !== '' ||
    extras.ship_to !== null ||
    extras.references !== null ||
    extras.bank !== null ||
    extras.legal_notes.trim() !== '' ||
    extras.qr_enabled ||
    extras.signature_issued_by.trim() !== '' ||
    extras.secondary_section !== null
  if (!hasExtras) return freeform
  return JSON.stringify({ freeform, ...extras })
}

/** Convenience: read extras off an Invoice object. */
export function readInvoiceExtras(inv: Invoice): { freeform: string; extras: InvoiceExtras } {
  return parseInvoiceNotes(inv.notes)
}

/** Build the default QR payload for an invoice — a verification URL.
 *  The admin can override this in the editor. */
export function defaultQrPayload(inv: Invoice): string {
  return `https://calistaconcept.eu/invoice/verify/${inv.id}`
}
