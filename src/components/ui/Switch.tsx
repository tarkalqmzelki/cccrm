import { type ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  'aria-label'?: string
  children?: ReactNode
}

export function Switch({ checked, onChange, disabled, 'aria-label': ariaLabel, children }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-pulse disabled:opacity-50 disabled:pointer-events-none ${
        checked ? 'bg-ink' : 'bg-ink-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ease-pulse ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
      {children}
    </button>
  )
}
