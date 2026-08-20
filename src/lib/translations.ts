import type { InvoiceSettings } from './types'

/** One language's translations — key → translated string. */
export interface LanguageTranslations {
  id: string
  language: string
  language_label: string
  translations: Record<string, string>
  created_at: string
  updated_at: string
}

/**
 * Canonical translation keys for every FIXED label on printed
 * invoices + contracts.  English defaults live here; admins override
 * per language in Settings → Language Settings.
 *
 * Grouped by document + section so the settings editor can render
 * them in logical blocks.
 */
export interface TranslationKeyDef {
  key: string
  label: string
  group: string
}

export const TRANSLATION_KEYS: TranslationKeyDef[] = [
  // --- Document indicators ---
  { key: 'doc.original',            label: 'ORIGINAL FOR CUSTOMER',  group: 'Document indicators' },
  { key: 'doc.copy',                label: 'COPY',                   group: 'Document indicators' },
  { key: 'doc.duplicate',           label: 'DUPLICATE',              group: 'Document indicators' },
  { key: 'doc.proforma',            label: 'PROFORMA',               group: 'Document indicators' },
  { key: 'doc.credit_note',         label: 'CREDIT NOTE',            group: 'Document indicators' },
  { key: 'doc.receipt',             label: 'RECEIPT',                group: 'Document indicators' },
  { key: 'doc.commercial_invoice',  label: 'COMMERCIAL INVOICE',     group: 'Document indicators' },
  { key: 'doc.tax_invoice_credit',  label: 'TAX INVOICE / CREDIT NOTE', group: 'Document indicators' },
  { key: 'doc.proforma_invoice',    label: 'PROFORMA INVOICE',       group: 'Document indicators' },
  { key: 'doc.contract',            label: 'CONTRACT',               group: 'Document indicators' },
  { key: 'doc.scan_to_verify',      label: 'Scan to verify',         group: 'Document indicators' },

  // --- Invoice meta ---
  { key: 'inv.invoice_no',          label: 'Invoice No.',            group: 'Invoice metadata' },
  { key: 'inv.invoice_date',        label: 'Invoice Date',           group: 'Invoice metadata' },
  { key: 'inv.due_date',            label: 'Due Date',               group: 'Invoice metadata' },
  { key: 'inv.currency',            label: 'Currency',               group: 'Invoice metadata' },
  { key: 'inv.status',              label: 'Status',                 group: 'Invoice metadata' },
  { key: 'inv.payment_terms',       label: 'Payment Terms',          group: 'Invoice metadata' },

  // --- Parties ---
  { key: 'party.seller',            label: 'SELLER',                 group: 'Parties' },
  { key: 'party.customer',          label: 'CUSTOMER / BILL TO',     group: 'Parties' },
  { key: 'party.vat_id',            label: 'VAT ID',                 group: 'Parties' },
  { key: 'party.company_id',        label: 'Company ID',             group: 'Parties' },
  { key: 'party.tel',               label: 'Tel',                    group: 'Parties' },
  { key: 'party.ship_to',           label: 'SHIP TO — DELIVERY INFORMATION', group: 'Parties' },
  { key: 'party.delivery_method',   label: 'Delivery method',        group: 'Parties' },
  { key: 'party.issuer',            label: 'Between — Issuer',       group: 'Parties' },
  { key: 'party.counterparty',      label: 'And — Counterparty',     group: 'Parties' },

  // --- References ---
  { key: 'ref.additional',          label: 'ADDITIONAL REFERENCES',  group: 'References' },
  { key: 'ref.order_no',            label: 'Order No.',              group: 'References' },
  { key: 'ref.customer_no',         label: 'Customer No.',           group: 'References' },
  { key: 'ref.po_number',           label: 'PO Number',              group: 'References' },
  { key: 'ref.delivery_note',       label: 'Delivery Note',          group: 'References' },
  { key: 'ref.salesperson',         label: 'Salesperson',            group: 'References' },
  { key: 'ref.project',             label: 'Project',                group: 'References' },
  { key: 'ref.vehicle_reg',         label: 'Vehicle Reg.',           group: 'References' },
  { key: 'ref.vin',                 label: 'VIN',                    group: 'References' },
  { key: 'ref.job_card',            label: 'Job Card',               group: 'References' },
  { key: 'ref.service_date',        label: 'Service Date',           group: 'References' },

  // --- Invoice table + totals ---
  { key: 'table.description',       label: 'Description',            group: 'Items table' },
  { key: 'table.qty',               label: 'Qty',                    group: 'Items table' },
  { key: 'table.unit_price',        label: 'Unit Price',             group: 'Items table' },
  { key: 'table.amount',            label: 'Amount',                 group: 'Items table' },
  { key: 'table.services_rendered', label: 'Services rendered — line items', group: 'Items table' },
  { key: 'table.no_items',          label: 'No services on this invoice.', group: 'Items table' },
  { key: 'totals.subtotal',         label: 'Subtotal',               group: 'Totals' },
  { key: 'totals.vat',              label: 'VAT',                    group: 'Totals' },
  { key: 'totals.vat_included',     label: '· included',             group: 'Totals' },
  { key: 'totals.total_due',        label: 'TOTAL DUE',              group: 'Totals' },
  { key: 'totals.amount_in_words',  label: 'Amount in words:',       group: 'Totals' },
  { key: 'totals.only',             label: 'only.',                  group: 'Totals' },

  // --- Payment info ---
  { key: 'pay.payment_info',        label: 'PAYMENT INFORMATION',    group: 'Payment' },
  { key: 'pay.bank_details',        label: 'Bank details',           group: 'Payment' },
  { key: 'pay.payment_details',     label: 'Payment details',        group: 'Payment' },
  { key: 'pay.bank',                label: 'Bank:',                  group: 'Payment' },
  { key: 'pay.iban',                label: 'IBAN:',                  group: 'Payment' },
  { key: 'pay.bic',                 label: 'BIC/SWIFT:',             group: 'Payment' },
  { key: 'pay.account',             label: 'Account:',               group: 'Payment' },
  { key: 'pay.method',              label: 'Method:',                group: 'Payment' },
  { key: 'pay.method_value',        label: 'Bank Transfer',          group: 'Payment' },
  { key: 'pay.terms',               label: 'Terms:',                 group: 'Payment' },
  { key: 'pay.due',                 label: 'Due:',                   group: 'Payment' },
  { key: 'pay.on_receipt',          label: 'On receipt',             group: 'Payment' },
  { key: 'pay.reference',           label: 'Reference:',             group: 'Payment' },

  // --- Contract ---
  { key: 'ctr.effective_from',      label: 'Effective from:',        group: 'Contract' },
  { key: 'ctr.until_terminated',    label: 'until terminated',       group: 'Contract' },
  { key: 'ctr.through',             label: 'through',                group: 'Contract' },
  { key: 'ctr.date_of_agreement',   label: 'Date of agreement:',     group: 'Contract' },
  { key: 'ctr.no_template',         label: 'No template selected for this contract.', group: 'Contract' },
  { key: 'ctr.contract_no',         label: 'Contract No.',           group: 'Contract' },
  { key: 'ctr.issued',              label: 'Issued',                 group: 'Contract' },

  // --- Barcode / signatures / footer ---
  { key: 'misc.reference_barcode',  label: 'Reference barcode',      group: 'Barcode / signatures / footer' },
  { key: 'misc.cross_reference',    label: 'Cross-reference for the digital ledger', group: 'Barcode / signatures / footer' },
  { key: 'misc.issued_by',          label: 'Issued by',              group: 'Barcode / signatures / footer' },
  { key: 'misc.received_by',        label: 'Received by',            group: 'Barcode / signatures / footer' },
  { key: 'misc.signature',          label: 'Signature',              group: 'Barcode / signatures / footer' },
  { key: 'misc.date',               label: 'Date:',                  group: 'Barcode / signatures / footer' },
  { key: 'misc.copyright',          label: '© {year} {company}. All rights reserved.', group: 'Barcode / signatures / footer' },
  { key: 'misc.printed_using_inv',  label: 'Printed using CCInvoiceEngine v1.0', group: 'Barcode / signatures / footer' },
  { key: 'misc.printed_using_ctr',  label: 'Printed using CCContractEngine v1.0', group: 'Barcode / signatures / footer' },
  { key: 'misc.document',           label: 'Document',               group: 'Barcode / signatures / footer' },
  { key: 'misc.notes',              label: 'Notes:',                 group: 'Barcode / signatures / footer' },
]

/** Build the English defaults map from the key definitions above. */
export const ENGLISH_TRANSLATIONS: Record<string, string> = Object.fromEntries(
  TRANSLATION_KEYS.map((k) => [k.key, k.label]),
)

/**
 * Translation resolver.  Looks up `key` in the selected language's
 * map, falls back to the English default when the key is missing or
 * empty.  Supports `{placeholders}` inside the translated string.
 */
export function makeT(langMap: Record<string, string> | null | undefined) {
  return function t(key: string, vars?: Record<string, string>): string {
    let value = langMap?.[key] ?? ENGLISH_TRANSLATIONS[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
      }
    }
    return value
  }
}

export type TFn = ReturnType<typeof makeT>
