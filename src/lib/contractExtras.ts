import type { Contract } from './types'

/** A custom placeholder defined by the admin on a contract template.
 *  `key` is what goes in the template body (e.g. `payable` → `{payable}`).
 *  `label` is shown in the contract editor next to the input.
 *  `type` controls the input rendered in the editor. */
export interface CustomPlaceholder {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'textarea'
}

/** Values the admin fills in per-contract for the template's custom
 *  placeholders.  Keyed by the placeholder key. */
export type CustomFields = Record<string, string>

export interface ContractExtras {
  freeform: string
  custom_fields: CustomFields
}

export const DEFAULT_CONTRACT_EXTRAS: ContractExtras = {
  freeform: '',
  custom_fields: {},
}

/** Parse the `notes` field of a contract into freeform text + extras.
 *  Backwards-compatible: if `notes` isn't our JSON envelope, treat
 *  the whole string as freeform notes. */
export function parseContractNotes(notes: string): ContractExtras {
  if (!notes) return { ...DEFAULT_CONTRACT_EXTRAS }
  const trimmed = notes.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      const knownKeys = ['freeform', 'custom_fields']
      if (!knownKeys.some((k) => k in parsed)) {
        return { freeform: notes, custom_fields: {} }
      }
      return {
        freeform: parsed.freeform ?? '',
        custom_fields: parsed.custom_fields ?? {},
      }
    } catch {
      return { freeform: notes, custom_fields: {} }
    }
  }
  return { freeform: notes, custom_fields: {} }
}

/** Serialize freeform notes + custom fields back into the `notes` column.
 *  If no custom fields are set, save as plain freeform text. */
export function serializeContractNotes(freeform: string, customFields: CustomFields): string {
  const hasCustom = Object.values(customFields).some((v) => v && v.trim() !== '')
  if (!hasCustom) return freeform
  return JSON.stringify({ freeform, custom_fields: customFields })
}

/** Convenience: read extras off a Contract object. */
export function readContractExtras(c: Contract): ContractExtras {
  return parseContractNotes(c.notes)
}
