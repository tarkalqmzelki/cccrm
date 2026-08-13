import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { db } from '../lib/db'
import { Modal } from './ui/Modal'
import { Skeleton } from './ui/Skeleton'
import { Button } from './ui/Button'
import { useAsync } from '../lib/hooks/useAsync'
import type { SystemStatus, SystemStatusValue } from '../lib/types'
import { SYSTEM_STATUS_META } from '../lib/types'
import { dateLong } from '../lib/format'

const STATUS_ORDER: SystemStatusValue[] = ['operating', 'maintenance', 'down']

export function SystemStatusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, loading, reload } = useAsync(async () => db.listSystemStatuses(), [open])

  const systems: SystemStatus[] = data || []
  const anyDown = systems.some((s) => s.status === 'down')
  const anyMaint = systems.some((s) => s.status === 'maintenance')
  const anyPending = systems.some((s) => s.status === 'maintenance' || s.status === 'down')

  const headline = !systems.length
    ? 'Loading status…'
    : anyDown
      ? 'Partial outage'
      : anyMaint
        ? 'Some systems degraded'
        : 'All systems operational'

  const headlineTone = !systems.length
    ? 'text-ink-400'
    : anyDown
      ? 'text-neg'
      : anyMaint
        ? 'text-warn'
        : 'text-pos'

  const avgUptime = systems.length
    ? systems.reduce((s, x) => s + (x.uptime_pct || 0), 0) / systems.length
    : 99.99

  return (
    <Modal open={open} onClose={onClose} title="System status" desc="Live status of all Calista Concept services." size="md">
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-ink-50/40 p-4">
          <div className="flex items-center gap-3">
            <StatusPulse status={anyDown ? 'down' : anyMaint ? 'maintenance' : 'operating'} size={14} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${headlineTone}`}>{headline}</p>
              <p className="text-2xs text-ink-400">
                {systems.length} systems · updated {systems.length ? dateLong(systems.reduce((a, b) => a.updated_at > b.updated_at ? a : b).updated_at) : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xs text-ink-400">Uptime</p>
              <p className="num text-sm font-semibold">{avgUptime.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {loading && systems.length === 0 ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : systems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Activity size={20} strokeWidth={1.75} className="text-ink-300" />
              <p className="text-sm text-ink-400">No status information available.</p>
            </div>
          ) : (
            systems.map((s) => {
              const meta = SYSTEM_STATUS_META[s.status]
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3.5">
                  <StatusPulse status={s.status} size={10} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{s.system}</p>
                    <p className="truncate text-2xs text-ink-400">
                      {s.note || meta.label}
                      {s.note ? ` · ${meta.label}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs font-medium" style={{ color: meta.color }}>{meta.label}</p>
                    <p className="num text-2xs text-ink-400">{(s.uptime_pct || 0).toFixed(2)}% uptime</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <Legend />

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} strokeWidth={1.75} />} onClick={() => reload()}>
            Refresh
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function StatusPulse({ status, size = 10 }: { status: SystemStatusValue; size?: number }) {
  const meta = SYSTEM_STATUS_META[status]
  const ring = status === 'operating'
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size * 2.2, height: size * 2.2 }}>
      {ring && (
        <span
          className="absolute inset-0 rounded-full status-ring"
          style={{ background: meta.color, opacity: 0.25 }}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${status === 'operating' ? 'status-pulse' : ''}`}
        style={{ width: size, height: size, background: meta.color, margin: 'auto' }}
      />
    </span>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-50/60 px-3 py-2 text-2xs text-ink-400">
      {STATUS_ORDER.map((s) => {
        const meta = SYSTEM_STATUS_META[s]
        return (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}