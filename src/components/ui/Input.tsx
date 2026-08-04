import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react'

const fieldBase =
  'w-full h-11 px-3 text-sm bg-surface border border-line rounded-xl text-ink placeholder:text-ink-300 transition-colors duration-150 focus:outline-none focus:border-ink disabled:bg-ink-50 disabled:text-ink-400'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${fieldBase} ${className}`} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={`${fieldBase} h-auto py-2.5 leading-relaxed resize-y ${className}`} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${fieldBase} appearance-none pr-9 cursor-pointer ${className}`} {...rest}>
        {children}
      </select>
    )
  },
)

export function Field({ label, hint, required, error, children }: { label: string; hint?: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-ink-700">
        {label}
        {required && <span className="text-neg">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-2xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-2xs text-neg">{error}</span>}
    </label>
  )
}
