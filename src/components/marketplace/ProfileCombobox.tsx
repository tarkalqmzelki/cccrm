import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { Profile } from '../../lib/types'
import { Avatar } from '../ui/Avatar'

/**
 * Searchable member picker — custom combobox UI (no native select) so
 * allocation works beautifully on mobile too. The results panel renders
 * in a portal with fixed positioning so it can never be clipped by
 * scrolling containers (modals, cards, etc.).
 */
export function ProfileCombobox({
  profiles,
  value,
  onChange,
  placeholder = 'Search members…',
  allowClear = true,
}: {
  profiles: Profile[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null)

  const selected = profiles.find((p) => p.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return profiles
    return profiles.filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  }, [profiles, query])

  function positionPanel() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < 280 && r.top > 300
    setRect({
      top: openUp ? Math.max(8, r.top - 8) : r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - r.width - 8),
      width: r.width,
      openUp,
    })
  }

  useLayoutEffect(() => {
    if (open) positionPanel()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => positionPanel()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const panelMaxHeight = 264

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-left text-sm shadow-sm transition-colors ${open ? 'border-ink' : 'border-line hover:border-ink-200'}`}
      >
        {selected ? (
          <>
            <Avatar name={selected.full_name} color={selected.avatar_color} url={selected.avatar_url} size={26} />
            <span className="min-w-0 flex-1 truncate font-medium">{selected.full_name}</span>
          </>
        ) : (
          <span className="flex-1 text-ink-400">Open to everyone — pick a member</span>
        )}
        <ChevronDown size={16} strokeWidth={1.75} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-[290]" onClick={() => setOpen(false)} />
          <AnimatePresence>
            {rect && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: rect.openUp ? 6 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[300] overflow-hidden rounded-xl border border-line bg-surface shadow-glass"
                style={{
                  top: rect.openUp ? undefined : rect.top,
                  bottom: rect.openUp ? window.innerHeight - rect.top : undefined,
                  left: rect.left,
                  width: Math.max(rect.width, 240),
                  maxHeight: panelMaxHeight,
                }}
              >
                <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                  <Search size={14} strokeWidth={1.75} className="shrink-0 text-ink-300" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-ink-300"
                  />
                </div>
                <ul className="max-h-[212px] overflow-y-auto p-1">
                  {allowClear && (
                    <li>
                      <button
                        type="button"
                        onClick={() => { onChange(null); setOpen(false); setQuery('') }}
                        className="flex w-full items-center rounded-lg px-2.5 py-2 text-sm text-ink-400 transition-colors hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]"
                      >
                        Clear selection — open to everyone
                      </button>
                    </li>
                  )}
                  {filtered.length === 0 && (
                    <li className="px-3 py-4 text-center text-xs text-ink-300">No members match "{query}"</li>
                  )}
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => { onChange(p.id); setOpen(false); setQuery('') }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          p.id === value ? 'bg-infoBg' : 'hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]'
                        }`}
                      >
                        <Avatar name={p.full_name} color={p.avatar_color} url={p.avatar_url} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.full_name}</span>
                          <span className="block truncate text-2xs capitalize text-ink-400">{p.role}</span>
                        </span>
                        {p.id === value && <Check size={14} strokeWidth={2} className="text-info" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </div>
  )
}
