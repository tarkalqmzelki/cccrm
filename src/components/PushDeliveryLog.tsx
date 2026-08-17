import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Skeleton } from './ui/Skeleton'
import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'
import type { PushLogEntry } from '../lib/types'

const STATUS_META: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  sent:    { icon: CheckCircle2, color: 'text-pos',    label: 'Delivered' },
  skipped: { icon: MinusCircle,  color: 'text-ink-400', label: 'Skipped' },
  error:   { icon: AlertTriangle, color: 'text-neg',   label: 'Error' },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

interface Props {
  /** Filter by status — 'sent' for the delivery log, 'error' for the
   *  error log, 'all' to see everything (default). */
  status?: 'sent' | 'skipped' | 'error' | 'all'
  limit?: number
}

/**
 * Push delivery log — admin-only.  Reads from `push_log` (written by
 * the send-push Edge Function).  Use `status="sent"` for the delivery
 * view, `status="error"` for the errors view.
 */
export function PushDeliveryLog({ status = 'all', limit = 25 }: Props) {
  const { data, loading, reload } = useAsync(async () => db.listPushLog({ status, limit }), [status, limit])

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
        <p className="text-sm text-ink-400">No entries yet.</p>
        <p className="mt-1 text-2xs text-ink-400">
          {status === 'sent'
            ? 'Successful pushes will appear here.'
            : status === 'error'
              ? 'Push failures (VAPID auth, network, expired subscriptions) will appear here.'
              : 'Send a test notification from your profile — log entries will appear here.'}
        </p>
        <button onClick={reload} className="mt-3 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink">
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
              <p className="text-2xs text-ink-400 break-words">{r.detail}</p>
            </div>
            <span className="shrink-0 text-2xs text-ink-300">{timeAgo(r.created_at)}</span>
          </div>
        )
      })}
      <button onClick={reload} className="mt-1 text-2xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink">
        Refresh
      </button>
    </div>
  )
}
