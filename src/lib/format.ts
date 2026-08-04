export const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0)

export const eurFull = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n || 0)

export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

export const pct = (n: number, digits = 1) =>
  `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })

export const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' })

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export function delta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100
  return ((curr - prev) / prev) * 100
}
