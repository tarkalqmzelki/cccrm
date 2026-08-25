import type { NavItem } from './nav'

/** localStorage key for the user's customised mobile bottom-nav slots.
 *  Stores an array of `to` paths (length 4).  Falls back to the first
 *  four NAV items for the user's role if missing or shorter than 4. */
export const SLOTS_KEY = 'mobile_nav_slots_v1'

export const MAX_SLOTS = 4

export function loadNavSlots(available: NavItem[]): string[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (!raw) return available.slice(0, MAX_SLOTS).map((n) => n.to)
    const arr = JSON.parse(raw) as string[]
    if (!Array.isArray(arr) || arr.length === 0) return available.slice(0, MAX_SLOTS).map((n) => n.to)
    // Filter to valid + available-for-role paths
    const valid = new Set(available.map((n) => n.to))
    const filtered = arr.filter((to) => valid.has(to))
    while (filtered.length < MAX_SLOTS) {
      const next = available.find((n) => !filtered.includes(n.to))
      if (!next) break
      filtered.push(next.to)
    }
    return filtered.slice(0, MAX_SLOTS)
  } catch {
    return available.slice(0, MAX_SLOTS).map((n) => n.to)
  }
}

export function saveNavSlots(slots: string[]) {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)) } catch {}
}
