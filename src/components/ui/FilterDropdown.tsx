import { useState, useRef, useEffect } from 'react'
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
 * filter controls.  The trigger matches the Input/Select platform
 * styling; the options menu is a custom popover with the same look.
 */
export function FilterDropdown({ value, onChange, options, placeholder = 'All', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const displayLabel = selected ? selected.label : placeholder

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

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
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-full rounded-xl border border-line bg-surface p-1 shadow-glass">
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
        </div>
      )}
    </div>
  )
}
