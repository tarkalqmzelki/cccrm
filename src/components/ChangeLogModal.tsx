import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { CHANGELOG_LABEL_META, CHANGELOG_LABELS } from '../lib/types'
import type { ChangelogEntry, ChangelogLabel } from '../lib/types'
import { dateShort } from '../lib/format'

/**
 * Pill shown in the sidebar above SystemStatusPill.  Shows the count of
 * unread changelog entries since the user's last visit.  Click opens
 * the ChangeLogModal.
 */
export function ChangeLogPill({ onClick }: { onClick: () => void }) {
  const { data } = useAsync(async () => db.listChangelog(false), [])
  const entries = data ?? []

  // "Unread" = newer than the user's last dismissed timestamp (stored
  // in localStorage — fine for a per-device badge).
  const lastSeen = typeof window !== 'undefined' ? Number(localStorage.getItem('cl_seen') || 0) : 0
  const unread = entries.filter((e) => new Date(e.created_at).getTime() > lastSeen).length

  return (
    <button
      onClick={onClick}
      className="mb-2 flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left hover:bg-ink-50 transition-colors"
      title="What's new"
    >
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ink" />
      </span>
      <span className="flex-1 truncate text-2xs font-medium text-ink-600">
        What's new
        {unread > 0 && <span className="ml-1 text-ink-400">· {unread > 9 ? '9+' : unread} new</span>}
      </span>
      <Sparkles size={13} strokeWidth={1.75} className="text-ink-400" />
    </button>
  )
}

/**
 * Modal listing all published changelog entries.  Visible to every
 * authenticated user.  Sets a "last seen" timestamp in localStorage so
 * the pill's unread badge goes away.
 */
export function ChangeLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, loading } = useAsync(async () => db.listChangelog(false), [])

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      localStorage.setItem('cl_seen', String(Date.now()))
    }
  }, [open])

  return createPortal(
    <div className={`fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6 ${open ? '' : 'pointer-events-none'}`}>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 backdrop-normal"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg glass-strong rounded-t-2xl sm:rounded-2xl shadow-glass max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold leading-tight">What's new</h2>
                <p className="mt-1 text-sm text-ink-400">Recent updates and improvements to Calista Concept.</p>
              </div>
              <button onClick={onClose} className="text-ink-300 hover:text-ink-600 transition-colors -mr-1 -mt-1 p-1">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 flex-1 space-y-3">
              {loading && <p className="text-sm text-ink-400">Loading…</p>}
              {!loading && (data ?? []).length === 0 && (
                <p className="text-sm text-ink-400">No updates to show yet.</p>
              )}
              {!loading && (data ?? []).map((e: ChangelogEntry) => {
                const meta = CHANGELOG_LABEL_META[e.label as ChangelogLabel] ?? CHANGELOG_LABEL_META.NEW
                return (
                  <div key={e.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-2xs font-medium text-white"
                        style={{ background: meta.color }}
                      >
                        {meta.label}
                      </span>
                      {e.version && (
                        <span className="text-2xs text-ink-400">v{e.version}</span>
                      )}
                      <span className="ml-auto text-2xs text-ink-300">{dateShort(e.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink">{e.title}</p>
                    {e.body && <p className="mt-1 text-sm text-ink-600 leading-relaxed">{e.body}</p>}
                  </div>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </div>,
    document.body,
  )
}
