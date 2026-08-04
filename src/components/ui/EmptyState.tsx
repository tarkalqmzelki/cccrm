import type { ReactNode } from 'react'

export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-50 text-ink-400">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {desc && <p className="mt-1 max-w-xs text-sm text-ink-400">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
