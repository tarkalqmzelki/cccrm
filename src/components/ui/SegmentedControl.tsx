import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * A segmented control: a pill row where each option is a button with an
 * optional icon + label. Used to replace native `<select>` for things
 * like activity Type and Status.
 */
export interface SegOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  color?: string
  tone?: 'neutral' | 'pos' | 'neg' | 'warn' | 'info'
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  columns,
  size = 'md',
}: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
  columns?: number
  size?: 'sm' | 'md'
}) {
  const gridClass = columns
    ? columns === 2 ? 'grid-cols-2'
    : columns === 3 ? 'grid-cols-3'
    : columns === 4 ? 'grid-cols-2 sm:grid-cols-4'
    : columns === 5 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
    : columns === 6 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6'
    : 'grid-cols-' + columns
    : 'flex flex-wrap'
  const padClass = size === 'sm' ? 'px-2.5 py-1.5 text-2xs' : 'px-3 py-2 text-xs'
  return (
    <div className={`grid ${gridClass} gap-1.5 rounded-xl bg-ink-50 p-1`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`relative flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${padClass} ${
              active ? 'text-ink' : 'text-ink-400 hover:text-ink'
            } disabled:opacity-50 disabled:pointer-events-none`}
            style={active && opt.color ? { color: opt.color } : undefined}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((o) => o.value).join('-')}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm"
                style={{ border: `1px solid ${opt.color || '#e5e5e5'}` }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
