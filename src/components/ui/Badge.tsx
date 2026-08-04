import type { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'pos' | 'neg' | 'warn' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-50 text-ink-600 border-line',
  pos: 'bg-posBg text-pos border-pos/20',
  neg: 'bg-negBg text-neg border-neg/20',
  warn: 'bg-warnBg text-warn border-warn/20',
  info: 'bg-infoBg text-info border-info/20',
}

export function Badge({ tone = 'neutral', className = '', children, dot, ...rest }: { tone?: Tone; dot?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
