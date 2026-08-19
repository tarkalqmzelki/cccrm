import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Plus, Search } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Catalog options to pick from. */
  options: string[]
  placeholder?: string
  className?: string
}

/**
 * Platform-styled combobox for picking OR creating a value.
 *
 * - Click the trigger → portal-rendered dropdown (escapes any
 *   `overflow: auto` ancestor — same trick as FilterDropdown).
 * - Type to filter the catalog.
 * - Pick an existing option, OR click "Create '<query>'" to add a
 *   brand-new custom value (the caller gets the new string back via
 *   onChange — no separate API; the new value is just used as-is).
 * - Closes on outside click, scroll, resize, or Escape.
 */
export function ServiceCombobox({
  value, onChange, options, placeholder = 'Select…', className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onScrollOrResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Position the menu under the trigger on every open.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const menuWidth = Math.max(r.width, 280)
    const viewport = window.innerWidth
    let left = r.left
    if (left + menuWidth > viewport - 8) left = viewport - menuWidth - 8
    if (left < 8) left = 8
    // Estimate menu height to flip upward if needed.
    const estHeight = Math.min(320, 56 + 8 * 36)
    let top = r.bottom + 4
    if (top + estHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - estHeight - 4)
    }
    setCoords({ top, left, width: menuWidth })
    // Focus the search input on open.
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  // Reset the query whenever the dropdown re-opens.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, q])

  const isCustom = q.length > 0 && !options.some((o) => o.toLowerCase() === q)

  function choose(v: string) {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink-200 focus:outline-none focus:border-ink"
      >
        <span className={`truncate ${value ? '' : 'text-ink-400'}`}>{value || placeholder}</span>
        <ChevronDown size={14} strokeWidth={1.75} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 200 }}
          className="rounded-xl border border-line bg-surface p-2 shadow-glass"
        >
          {/* Search */}
          <div className="relative mb-1.5">
            <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type a new one…"
              className="h-9 w-full rounded-lg border border-line bg-ink-50/60 pl-8 pr-3 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto pr-0.5">
            {filtered.length === 0 && !isCustom && (
              <p className="px-2.5 py-4 text-center text-2xs text-ink-400">
                No matches. Type above to create a new one.
              </p>
            )}

            {filtered.map((o) => {
              const active = o === value
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => choose(o)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active ? 'bg-ink-50 font-medium text-ink' : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <span className="truncate">{o}</span>
                  {active && <Check size={14} strokeWidth={2} className="shrink-0 text-ink" />}
                </button>
              )
            })}

            {/* Create new — only when the query doesn't match an
                existing option. */}
            {isCustom && (
              <>
                {filtered.length > 0 && <div className="my-1.5 h-px bg-line" />}
                <button
                  type="button"
                  onClick={() => choose(q)}
                  className="flex w-full items-center gap-2 rounded-lg border border-info/30 bg-infoBg/40 px-2.5 py-2 text-sm text-info transition-colors hover:bg-infoBg"
                >
                  <Plus size={14} strokeWidth={2} className="shrink-0" />
                  <span>
                    Create <strong>&ldquo;{q}&rdquo;</strong> as a new service
                  </span>
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
