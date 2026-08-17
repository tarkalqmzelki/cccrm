import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { LEAD_STATUS_META, LEAD_STATUSES } from '../lib/types'
import type { LeadStatus } from '../lib/types'

interface Props {
  status: LeadStatus
  canEdit: boolean
  onChange: (status: LeadStatus) => void
}

/**
 * Inline lead-status selector.  Shows a colored badge; clicking opens
 * a small dropdown to pick a new status.  Read-only when canEdit is
 * false (just shows the badge).
 */
export function LeadStatusPicker({ status, canEdit, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meta = LEAD_STATUS_META[status] ?? LEAD_STATUS_META.new

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!canEdit) {
    return <Badge tone={meta.tone}>{meta.label}</Badge>
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink-50"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[meta.tone]}`} />
        {meta.label}
        <ChevronDown size={13} strokeWidth={1.75} className="text-ink-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl border border-line bg-surface p-1 shadow-glass">
          {LEAD_STATUSES.map((s) => {
            const m = LEAD_STATUS_META[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  s === status ? 'bg-ink-50 font-medium text-ink' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[m.tone]}`} />
                {m.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const TONE_DOT: Record<string, string> = {
  neutral: 'bg-ink-400',
  info: 'bg-info',
  warn: 'bg-warn',
  pos: 'bg-pos',
  neg: 'bg-neg',
}

// Local Badge fallback (avoids importing the full Badge component,
// which has dot/wrapper variants). Keep it small and inline.
function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600',
    info: 'bg-infoBg text-info',
    warn: 'bg-warnBg text-warn',
    pos: 'bg-posBg text-pos',
    neg: 'bg-negBg text-neg',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${cls[tone] ?? cls.neutral}`}>{children}</span>
}
