import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X, Check, ArrowLeftRight, Settings2 } from 'lucide-react'
import { NAV } from './nav'
import type { NavItem } from './nav'
import { useAuth } from '../../context/AuthContext'
import { useSidebarBadges } from '../../lib/hooks/useSidebarBadges'

/** localStorage key for the user's customised mobile bottom-nav slots.
 *  Stores an array of `to` paths (length 5).  Falls back to the first
 *  five NAV items for the user's role if missing or shorter than 5. */
const SLOTS_KEY = 'mobile_nav_slots_v1'

const MAX_SLOTS = 5

function loadSlots(available: NavItem[]): string[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (!raw) return available.slice(0, MAX_SLOTS).map((n) => n.to)
    const arr = JSON.parse(raw) as string[]
    if (!Array.isArray(arr) || arr.length === 0) return available.slice(0, MAX_SLOTS).map((n) => n.to)
    // Filter to valid + available-for-role paths
    const valid = new Set(available.map((n) => n.to))
    const filtered = arr.filter((to) => valid.has(to))
    // Pad if too short
    while (filtered.length < MAX_SLOTS) {
      const next = available.find((n) => !filtered.includes(n.to))
      if (!next) break
      filtered.push(next.to)
    }
    // Truncate to MAX_SLOTS
    return filtered.slice(0, MAX_SLOTS)
  } catch {
    return available.slice(0, MAX_SLOTS).map((n) => n.to)
  }
}

function saveSlots(slots: string[]) {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)) } catch {}
}

export function MobileNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const badges = useSidebarBadges(user)
  const [slots, setSlots] = useState<string[]>(() => {
    if (!user) return []
    const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
    return loadSlots(items)
  })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Re-load when the user changes (sign-in / role change)
  useEffect(() => {
    if (!user) {
      setSlots([])
      return
    }
    const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
    setSlots(loadSlots(items))
  }, [user?.id, user?.role])

  if (!user) return null
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const itemMap: Record<string, NavItem> = useMemo(() => {
    const m: Record<string, NavItem> = {}
    items.forEach((n) => (m[n.to] = n))
    return m
  }, [items.join('|')])

  const visible = slots
    .map((to) => itemMap[to])
    .filter(Boolean) as NavItem[]

  const badgeFor = (to: string): number => {
    if (to === '/inbox') return badges.inbox
    if (to === '/deals') return badges.deals
    if (to === '/leads') return badges.leads
    if (to === '/payouts') return badges.payouts
    return 0
  }

  function commit(newSlots: string[]) {
    setSlots(newSlots)
    saveSlots(newSlots)
  }

  function swapSlot(index: number, newTo: string) {
    const next = [...slots]
    // If the chosen item is already in another slot, swap them
    const existingIdx = next.indexOf(newTo)
    if (existingIdx >= 0 && existingIdx !== index) {
      next[existingIdx] = next[index]
    }
    next[index] = newTo
    commit(next)
    setEditingIndex(null)
  }

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-line"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-stretch justify-between px-2 pt-1.5 pb-1.5">
          {visible.map((n, i) => {
            const count = badgeFor(n.to)
            // Path check for active styling (NavLink would do this
            // for us, but using <button> avoids the iOS long-press
            // link-preview sheet that was eating our long-press).
            const isActive = (() => {
              const p = window.location.pathname
              if (n.to === '/') return p === '/'
              return p.startsWith(n.to)
            })()
            return (
              <button
                key={n.to}
                type="button"
                onClick={() => navigate(n.to)}
                onContextMenu={(e) => {
                  // Right-click / long-press fallback (Android + desktop
                  // testing).  Buttons don't trigger iOS's link preview.
                  e.preventDefault()
                  setEditingIndex(i)
                }}
                onTouchStart={(e) => {
                  // Track a touch start so we can detect a long press.
                  // The button doesn't trigger iOS's link-preview sheet
                  // (that's only for <a> tags), so we own the long-press
                  // gesture here.
                  const touch = e.touches[0]
                  const target = e.currentTarget
                  ;(target as any)._lp = {
                    x: touch.clientX,
                    y: touch.clientY,
                    t: Date.now(),
                    timer: setTimeout(() => {
                      // Long-press fired while still touching — pop the
                      // slot editor.  We don't navigate because the
                      // click event won't fire after a long-press.
                      setEditingIndex(i)
                      // Light haptic-like feedback (CSS vibration not
                      // available cross-browser; visual feedback only).
                      target.classList.add('scale-95')
                      setTimeout(() => target.classList.remove('scale-95'), 150)
                    }, 500),
                  }
                }}
                onTouchMove={(e) => {
                  // Cancel the long-press if the finger moves more than
                  // a few pixels (scrolling / dragging).
                  const target = e.currentTarget as any
                  const lp = target._lp
                  if (!lp) return
                  const touch = e.touches[0]
                  const dx = Math.abs(touch.clientX - lp.x)
                  const dy = Math.abs(touch.clientY - lp.y)
                  if (dx > 10 || dy > 10) {
                    clearTimeout(lp.timer)
                    delete target._lp
                  }
                }}
                onTouchEnd={(e) => {
                  // Tap (short press) — let the normal onClick navigate.
                  // Long-press already fired via the timer in
                  // onTouchStart; cancel any pending timer here in case
                  // the user lifted before 500ms (we don't want a
                  // late pop of the slot editor after navigation).
                  const target = e.currentTarget as any
                  const lp = target._lp
                  if (lp) {
                    clearTimeout(lp.timer)
                    delete target._lp
                  }
                }}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-2xs font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-ink-400'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    className="absolute -top-0.5 h-0.5 w-8 rounded-full bg-ink"
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative">
                  <n.icon size={20} strokeWidth={1.75} />
                  {count > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-neg px-1 text-2xs font-bold text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </span>
                <span>{n.label}</span>
              </button>
            )
          })}

          {/* Customize handle — a tiny entry point that always opens
              the slot editor for slot #0.  Useful when the user can't
              long-press (e.g. accessibility, or just discoverability)
              and as a fallback if a future OS update interferes with
              touch-based long-press detection. */}
          <button
            type="button"
            onClick={() => setEditingIndex(0)}
            className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-2xs font-medium text-ink-300 hover:text-ink-500 transition-colors"
            title="Customize quick actions"
            aria-label="Customize quick actions"
          >
            <Settings2 size={18} strokeWidth={1.75} />
            <span className="hidden">Edit</span>
          </button>
        </div>
      </nav>

      {editingIndex !== null && (
        <SlotEditor
          index={editingIndex}
          slots={slots}
          items={items}
          onPick={(to) => swapSlot(editingIndex, to)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Slot editor — modal that pops on long-press.  Lets the user pick   */
/* any nav item for the chosen slot.  Already-occupied slots are     */
/* shown as "swapped" so the user understands the side-effect.       */
/* ------------------------------------------------------------------ */
function SlotEditor({
  index, slots, items, onPick, onClose,
}: {
  index: number
  slots: string[]
  items: NavItem[]
  onPick: (to: string) => void
  onClose: () => void
}) {
  const current = slots[index]
  const currentMeta = items.find((n) => n.to === current)
  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.99 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md glass-strong rounded-t-3xl sm:rounded-3xl shadow-glass overflow-hidden"
        >
          <div className="h-1.5 bg-gradient-to-r from-ink-700 via-ink to-ink-700" />

          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface/80 text-ink-400 hover:text-ink-600 hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>

          <div className="px-5 pt-5 pb-2">
            <div className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-[0.22em] text-ink-400">
              <ArrowLeftRight size={12} strokeWidth={1.75} />
              Customize quick action
            </div>
            <p className="text-sm text-ink-600">
              Pick what shows in slot {index + 1}
              {currentMeta ? <> · currently <strong>{currentMeta.label}</strong></> : null}.
              Tapping a different slot's item swaps the two.
            </p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-3 pb-5">
            <div className="grid grid-cols-3 gap-2 pt-2">
              {items.map((n) => {
                const selected = n.to === current
                const inSlotIdx = slots.indexOf(n.to)
                const inAnotherSlot = inSlotIdx >= 0 && inSlotIdx !== index
                return (
                  <button
                    key={n.to}
                    onClick={() => onPick(n.to)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors ${
                      selected
                        ? 'border-info bg-infoBg/50 text-ink'
                        : inAnotherSlot
                          ? 'border-warn/30 bg-warnBg/30 text-ink-600'
                          : 'border-line bg-surface text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    <n.icon size={22} strokeWidth={1.75} />
                    <span className="text-2xs font-medium">{n.label}</span>
                    {selected && <Check size={12} strokeWidth={2.5} className="text-info" />}
                    {inAnotherSlot && (
                      <span className="text-2xs text-warn">in slot {inSlotIdx + 1}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
