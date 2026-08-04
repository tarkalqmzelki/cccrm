import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  block?: boolean
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-[10px]',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-800 active:bg-ink-900 disabled:bg-ink-200',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-200 active:bg-ink-50 disabled:text-ink-300',
  ghost: 'text-ink hover:bg-ink-50 active:bg-ink-100',
  subtle: 'bg-ink-50 text-ink hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-neg text-white hover:opacity-90 active:opacity-100',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, block, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-medium transition-colors duration-150 ease-pulse select-none disabled:opacity-60 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
})
