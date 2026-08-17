import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Skeleton } from './ui/Skeleton'
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react'
import type { ErrorLogEntry } from '../lib/types'

const SEVERITY_META: Record<string, { icon: typeof Info; color: string; label: string }> = {
  info:  { icon: Info,          color: 'text-info',   label: 'Info' },
  warn:  { icon: AlertTriangle,  color: 'text-warn',   label: 'Warning' },
  error: { icon: AlertOctagon,  color: 'text-neg',    label: 'Error' },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/**
 * LogBook — admin-only view of every error/warning logged anywhere in
 * the platform (push failures, auth errors, sync issues, …).  Reads
 * from `error_logs` plus surfaces `push_log` errors so admins have a
 * single place to triage problems.
 */
export function LogBook() {
  const { data: errs, loading: errsLoading, reload: reloadErrs } = useAsync(async () => db.listErrorLogs(100), [])
  const { data: pushErrs, loading: pushLoading, reload: reloadPush } = useAsync(async () => db.listPushLog({ status: 'error', limit: 50 }), [])

  if (errsLoading || pushLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // Merge both sources, sort newest first.
  type Row = { id: string; created_at: string; source: string; severity: string; message: string; detail: string }
  const rows: Row[] = []
  for (const e of errs ?? []) {
    rows.push({ id: e.id, created_at: e.created_at, source: e.source || 'app', severity: e.severity, message: e.message, detail: e.detail })
  }
  for (const p of pushErrs ?? []) {
    rows.push({ id: p.id, created_at: p.created_at, source: 'push', severity: 'error', message: p.key ? `Push (${p.key})` : 'Push delivery failed', detail: p.detail })
  }
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center">
        <p className="text-sm text-ink-400">No errors recorded.</p>
        <p className="mt-1 text-2xs text-ink-400">All quiet on the platform.</p>
        <button onClick={() => { reloadErrs(); reloadPush() }} className="mt-3 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink">
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const meta = SEVERITY_META[r.severity] ?? SEVERITY_META.error
        return (
          <div key={`${r.source}-${r.id}`} className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
            <meta.icon size={14} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${meta.color}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {meta.label}
                <span className="ml-1.5 rounded bg-ink-100 px-1 py-0.5 font-normal text-2xs text-ink-500">{r.source}</span>
              </p>
              <p className="text-sm text-ink-700">{r.message}</p>
              {r.detail && <p className="mt-0.5 text-2xs text-ink-400 break-words">{r.detail}</p>}
            </div>
            <span className="shrink-0 text-2xs text-ink-300">{timeAgo(r.created_at)}</span>
          </div>
        )
      })}
      <button onClick={() => { reloadErrs(); reloadPush() }} className="mt-1 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink">
        Refresh
      </button>
    </div>
  )
}
