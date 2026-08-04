import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Skeleton } from './Skeleton'
import type { ReactNode } from 'react'

export function StatDelta({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-2xs font-medium ${up ? 'text-pos' : 'text-neg'}`}
    >
      {up ? <ArrowUpRight size={12} strokeWidth={2} /> : <ArrowDownRight size={12} strokeWidth={2} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  loading,
}: {
  label: string
  value: string
  delta?: number
  deltaLabel?: string
  icon?: ReactNode
  loading?: boolean
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="mt-3 num text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      )}
      {(delta !== undefined || deltaLabel) && (
        <div className="mt-3 flex items-center gap-2">
          {delta !== undefined && <StatDelta value={delta} />}
          {deltaLabel && <span className="text-2xs text-ink-400">{deltaLabel}</span>}
        </div>
      )}
    </div>
  )
}
