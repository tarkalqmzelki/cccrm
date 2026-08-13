import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, Phone, Building2, UserCircle } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Avatar } from './ui/Avatar'
import type { Profile, Company } from '../lib/types'

export type PickerEntity =
  | { kind: 'profile'; id: string; label: string; sub: string; phone: string; avatar_color?: string; avatar_url?: string }
  | { kind: 'company'; id: string; label: string; sub: string; phone?: string; domain?: string; industry?: string }

interface Props {
  open: boolean
  onClose: () => void
  title: string
  desc?: string
  /** A list of selectable entities, plus a special "none" option (optional). */
  entities: PickerEntity[]
  /** Currently selected id, or '' for the "none" option. */
  selectedId: string
  onSelect: (id: string) => void
  /** Set to show a "— None —" option at the top. */
  allowNone?: boolean
  noneLabel?: string
}

export function EntityPickerModal({
  open, onClose, title, desc, entities, selectedId, onSelect, allowNone, noneLabel = '— None —',
}: Props) {
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return entities
    return entities.filter((e) =>
      e.label.toLowerCase().includes(query) ||
      (e.sub || '').toLowerCase().includes(query) ||
      (e.phone || '').toLowerCase().includes(query),
    )
  }, [entities, q])

  function choose(id: string) {
    onSelect(id)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      desc={desc}
      size="md"
      backdrop="strong"
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, role, or phone…"
            className="h-10 w-full rounded-xl border border-line bg-ink-50/60 pl-9 pr-9 text-sm text-ink placeholder:text-ink-300 focus:outline-none focus:border-ink"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink">
              <X size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1 -mr-1">
          {allowNone && (
            <button
              onClick={() => choose('')}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                selectedId === '' ? 'border-info bg-infoBg/40' : 'border-transparent hover:bg-ink-50'
              }`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-50 text-ink-400">
                <X size={15} strokeWidth={1.75} />
              </span>
              <span className="flex-1 text-ink-500">{noneLabel}</span>
              {selectedId === '' && <Check size={15} strokeWidth={2} className="text-info" />}
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Search size={22} strokeWidth={1.75} className="text-ink-300" />
              <p className="text-sm text-ink-400">No matches for "{q}"</p>
            </div>
          ) : (
            filtered.map((e) => {
              const active = e.id === selectedId
              return (
                <button
                  key={e.id}
                  onClick={() => choose(e.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active ? 'border-info bg-infoBg/40' : 'border-transparent hover:bg-ink-50'
                  }`}
                >
                  {e.kind === 'profile' ? (
                    <Avatar name={e.label} color={e.avatar_color} url={e.avatar_url} size={36} />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-50 text-ink-500">
                      <Building2 size={15} strokeWidth={1.75} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{e.label}</p>
                    <p className="truncate text-2xs text-ink-400">
                      {e.sub}
                      {e.phone && <span className="ml-1 inline-flex items-center gap-0.5"><Phone size={10} strokeWidth={1.75} /> {e.phone}</span>}
                    </p>
                  </div>
                  {active && <Check size={15} strokeWidth={2} className="text-info shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers to build picker entities from profiles / companies          */
/* ------------------------------------------------------------------ */
export function profileEntities(profiles: Profile[], excludeId?: string): PickerEntity[] {
  return profiles
    .filter((p) => p.id !== excludeId && p.active !== false)
    .map((p) => ({
      kind: 'profile' as const,
      id: p.id,
      label: p.full_name,
      sub: p.role,
      phone: p.phone || '',
      avatar_color: p.avatar_color,
      avatar_url: p.avatar_url,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function companyEntities(companies: Company[]): PickerEntity[] {
  return companies
    .map((c) => ({
      kind: 'company' as const,
      id: c.id,
      label: c.name,
      sub: c.industry || c.domain || '',
      phone: '',
      domain: c.domain,
      industry: c.industry,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
