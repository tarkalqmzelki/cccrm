import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
}

/**
 * Platform-styled filter dropdown — replaces native `<select>` for
 * filter controls.
 *
 * The options menu is rendered via `createPortal` to `document.body`
 * with `position: fixed` so it escapes any ancestor that has
 * `overflow: hidden` / `overflow-x: auto` (those clip an
 * `absolute`-positioned menu and on mobile Safari the dropdown ends
 * up hidden behind / under the table cards).  The menu's position is
 * computed from the trigger's bounding rect on every open.
 */
export function FilterDropdown({ value, onChange, options, placeholder = 'All', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const displayLabel = selected ? selected.label : placeholder

  // Click-outside + scroll/resize close
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      // Don't close when clicking inside the trigger or the menu
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onScrollOrResize() {
      // Recompute position on viewport changes; close on scroll of an
      // ancestor (so the menu doesn't get detached from the trigger).
      if (!ref.current) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onScrollOrResize)
    // Use capture so we catch scroll events on any ancestor (incl. the
    // overflow-x-auto strip on the Leads page).
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open])

  // Compute the menu position from the trigger's rect whenever it opens.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    // Default: drop straight down, left-aligned with the trigger.
    const menuWidth = Math.max(r.width, 220)
    const viewport = window.innerWidth
    // If the menu would overflow the right edge, shift it left so it
    // stays inside the viewport.
    let left = r.left
    if (left + menuWidth > viewport - 8) left = viewport - menuWidth - 8
    if (left < 8) left = 8
    // Try to fit the menu below the trigger; if it would overflow
    // the bottom of the viewport, flip it to open upward.
    const menuHeight = Math.min(options.length * 40 + 16, 320)
    let top = r.bottom + 4
    if (top + menuHeight > window.innerHeight - 8) {
      top = r.top - menuHeight - 4
    }
    setCoords({ top, left, width: menuWidth })
  }, [open, options.length])

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
      >
        <span className={`truncate ${!selected ? 'text-ink-400' : ''}`}>{displayLabel}</span>
        <ChevronDown size={14} strokeWidth={1.75} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 200 }}
          className="rounded-xl border border-line bg-surface p-1 shadow-glass"
        >
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active ? 'bg-ink-50 font-medium text-ink' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={14} strokeWidth={2} className="shrink-0 text-ink" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
