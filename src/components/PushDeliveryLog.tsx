import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Skeleton } from './ui/Skeleton'
import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'
import type { PushLogEntry } from '../lib/types'

const STATUS_META: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  sent:    { icon: CheckCircle2, color: 'text-pos', label: 'Delivered' },
  skipped: { icon: MinusCircle,  color: 'text-ink-400', label: 'Skipped' },
  error:   { icon: AlertTriangle, color: 'text-neg', label: 'Error' },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/**
 * Admin-only panel showing the most recent push delivery attempts
 * (written by the send-push Edge Function).  Makes silent pipeline
 * failures visible: empty log after a test = trigger → function call
 * is failing (check edge_url / edge_bearer in app_secrets).
 */
export function PushDeliveryLog() {
  const { data, loading, reload } = useAsync(async () => db.listPushLog(15), [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const rows = data ?? []

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center">
        <p className="text-sm text-ink-400">No pushes attempted yet.</p>
        <p className="mt-1 text-2xs text-ink-400">
          Send a test notification from your profile. If the log stays empty, the database trigger can’t reach the
          Edge Function — check <code className="rounded bg-ink-100 px-1">edge_url</code> /{' '}
          <code className="rounded bg-ink-100 px-1">edge_bearer</code> in <code className="rounded bg-ink-100 px-1">app_secrets</code>.
        </p>
        <button
          onClick={reload}
          className="mt-3 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink"
        >
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r: PushLogEntry) => {
        const meta = STATUS_META[r.status] ?? STATUS_META.error
        return (
          <div key={r.id} className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
            <meta.icon size={14} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${meta.color}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {meta.label}
                {r.key && <span className="ml-1.5 font-normal text-ink-400">{r.key}</span>}
              </p>
              <p className="text-2xs text-ink-400">{r.detail}</p>
            </div>
            <span className="shrink-0 text-2xs text-ink-300">{timeAgo(r.created_at)}</span>
          </div>
        )
      })}
      <button
        onClick={reload}
        className="mt-1 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink"
      >
        Refresh
      </button>
    </div>
  )
}
