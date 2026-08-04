import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest} />
}

export function CardHeader({ title, desc, action }: { title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
        {desc && <p className="mt-1 text-sm text-ink-400">{desc}</p>}
      </div>
      {action}
    </div>
  )
}
