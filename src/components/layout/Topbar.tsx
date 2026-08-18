import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Search, Bell, Inbox, KeyRound, Briefcase, Check, X, MessageSquare, ShieldCheck, ArrowRight } from 'lucide-react'
import { NAV } from './nav'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../lib/db'
import { CommandPalette } from '../CommandPalette'
import { useAsync } from '../../lib/hooks/useAsync'
import type { InboxMessage, AccessRequest, Deal } from '../../lib/types'
import { dateShort } from '../../lib/format'

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)

  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)))
  const active = items.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))
  const title = active?.label || 'Overview'

  /* Cmd+K / Ctrl+K opens the palette */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header
        className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/80 px-4 backdrop-blur-md sm:gap-3 lg:pl-8"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <button onClick={onMenu} className="lg:hidden -ml-1 p-2 text-ink hover:bg-ink-50 rounded-lg transition-colors">
          <Menu size={20} strokeWidth={1.75} />
        </button>

        {/* Title — hidden on desktop once search takes the middle */}
        <h1 className="flex-1 truncate text-base font-semibold lg:hidden">{title}</h1>

        {/* Center search trigger — desktop only */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden lg:flex ml-auto mr-auto w-full max-w-md items-center gap-2.5 rounded-xl border border-line bg-ink-50/60 px-3 h-10 text-ink-400 hover:bg-ink-50 transition-colors"
        >
          <Search size={16} strokeWidth={1.75} />
          <span className="flex-1 text-left text-sm text-ink-400">Search leads, deals, people…</span>
          <kbd className="inline-flex h-5 items-center gap-0.5 rounded border border-line bg-surface px-1.5 text-2xs font-medium text-ink-400">
            ⌘K
          </kbd>
        </button>

        {/* Right cluster: mobile search + notifications bell.
            Both rendered as solid filled chips so they read as
            buttons against the sticky header's translucent backdrop. */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:ml-0">
          {/* Mobile search — opens the same CommandPalette as desktop */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-ink ring-1 ring-line shadow-sm transition-colors hover:bg-ink-50 hover:ring-ink-200 lg:hidden"
            title="Search"
            aria-label="Search"
          >
            <Search size={18} strokeWidth={1.75} />
          </button>

          <NotificationBell
            open={bellOpen}
            onToggle={() => setBellOpen((o) => !o)}
            onClose={() => setBellOpen(false)}
            onJump={(href) => { setBellOpen(false); navigate(href) }}
          />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Notification bell — inbox + access requests + deals pending         */
/* ------------------------------------------------------------------ */
function NotificationBell({
  open, onToggle, onClose, onJump,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  onJump: (href: string) => void
}) {
  const { user } = useAuth()
  const { data, reload } = useAsync(async () => {
    if (!user) return null
    const [inbox, requests, deals] = await Promise.all([
      db.listInbox(user.id),
      db.listAccessRequests(user.id),
      db.listDeals(),
    ])
    return {
      inbox: inbox as InboxMessage[],
      requests: requests as AccessRequest[],
      deals: deals as Deal[],
    }
  }, [user?.id])

  useEffect(() => {
    if (!open) return
    reload()
    const interval = setInterval(reload, 15000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const inbox = data?.inbox || []
  const unread = inbox.filter((m) => !m.read)
  const pendingIncomingReqs = (data?.requests || []).filter((r) => r.owner_id === user?.id && r.status === 'pending')
  const pendingOutgoingReqs = (data?.requests || []).filter((r) => r.requester_id === user?.id && r.status === 'pending')
  const pendingDeals = (data?.deals || []).filter((d) => d.status === 'pending_review')
  const totalBadge = unread.length + (user?.role === 'admin' ? pendingDeals.length : 0) + pendingIncomingReqs.length

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="relative grid h-10 w-10 place-items-center rounded-xl bg-surface text-ink ring-1 ring-line shadow-sm transition-colors hover:bg-ink-50 hover:ring-ink-200 lg:h-12 lg:w-12"
        title="Notifications"
      >
        <Bell size={18} strokeWidth={1.75} className="lg:h-[22px] lg:w-[22px]" />
        {totalBadge > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 text-2xs font-bold text-white ring-2 ring-surface"
          >
            {totalBadge > 9 ? '9+' : totalBadge}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside catcher */}
            <div className="fixed inset-0 z-[110]" onClick={onClose} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-full z-[120] mt-2 w-[min(92vw,380px)] glass-strong rounded-2xl shadow-glass overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                <span className="text-2xs text-ink-400">
                  {totalBadge > 0 ? `${totalBadge} new` : 'All caught up'}
                </span>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {/* Pending incoming access requests (people asking you) */}
                {pendingIncomingReqs.length > 0 && (
                  <Section label="Access requests" count={pendingIncomingReqs.length}>
                    {pendingIncomingReqs.slice(0, 3).map((r) => (
                      <NotifRow
                        key={r.id}
                        icon={<KeyRound size={13} strokeWidth={1.75} className="text-info" />}
                        title="New access request"
                        desc={r.message || 'Someone asked to see your lead'}
                        time={r.created_at}
                        onClick={() => onJump('/inbox')}
                      />
                    ))}
                  </Section>
                )}

                {/* Pending deals awaiting approval (admin only) */}
                {user?.role === 'admin' && pendingDeals.length > 0 && (
                  <Section label="Deals awaiting review" count={pendingDeals.length}>
                    {pendingDeals.slice(0, 3).map((d) => (
                      <NotifRow
                        key={d.id}
                        icon={<Briefcase size={13} strokeWidth={1.75} className="text-warn" />}
                        title={`Deal awaiting approval · ${d.company || 'Untitled'}`}
                        desc={d.contact_name || 'No contact'}
                        time={d.created_at}
                        onClick={() => onJump(`/deals/${d.id}`)}
                      />
                    ))}
                  </Section>
                )}

                {/* Outgoing pending access requests (you're waiting) */}
                {pendingOutgoingReqs.length > 0 && (
                  <Section label="Awaiting access" count={pendingOutgoingReqs.length}>
                    {pendingOutgoingReqs.slice(0, 2).map((r) => (
                      <NotifRow
                        key={r.id}
                        icon={<KeyRound size={13} strokeWidth={1.75} className="text-ink-400" />}
                        title="Waiting for access approval"
                        desc={r.message || 'Your request is being reviewed'}
                        time={r.created_at}
                        onClick={() => onJump('/inbox')}
                      />
                    ))}
                  </Section>
                )}

                {/* Inbox messages */}
                <Section label="Inbox" count={unread.length}>
                  {inbox.length === 0 ? (
                    <div className="px-4 py-3 text-2xs text-ink-400">No messages yet.</div>
                  ) : (
                    (unread.length > 0 ? unread : inbox).slice(0, 5).map((m) => <InboxRow key={m.id} m={m} onClick={() => onJump(m.action_url || '/inbox')} />)
                  )}
                </Section>
              </div>

              <button
                onClick={() => onJump('/inbox')}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-sm font-medium text-ink hover:bg-ink-50 transition-colors"
              >
                View all in inbox
                <ArrowRight size={13} strokeWidth={1.75} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-2xs font-medium uppercase tracking-wide text-ink-400 flex items-center gap-1.5">
        {label}
        {count > 0 && <span className="rounded-full bg-neg/10 px-1.5 py-0.5 text-ink-500 font-semibold text-2xs text-neg">{count}</span>}
      </p>
      {children}
    </div>
  )
}

function NotifRow({ icon, title, desc, time, onClick }: { icon: React.ReactNode; title: string; desc: string; time: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-ink-50 transition-colors">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ink-50">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="truncate text-2xs text-ink-400">{desc}</p>
      </div>
      <span className="text-2xs text-ink-400 shrink-0">{dateShort(time)}</span>
    </button>
  )
}

function InboxRow({ m, onClick }: { m: InboxMessage; onClick: () => void }) {
  const icon = useMemo(() => {
    switch (m.type) {
      case 'access_request': return <MessageSquare size={13} strokeWidth={1.75} className="text-info" />
      case 'access_approved': return <Check size={13} strokeWidth={1.75} className="text-pos" />
      case 'access_rejected': return <X size={13} strokeWidth={1.75} className="text-neg" />
      case 'direct_message': return <Inbox size={13} strokeWidth={1.75} className="text-info" />
      case 'admin_grant': return <ShieldCheck size={13} strokeWidth={1.75} className="text-ink" />
      default: return <Bell size={13} strokeWidth={1.75} className="text-ink-400" />
    }
  }, [m.type])
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-ink-50 transition-colors">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-ink-50">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{m.title}</p>
        <p className="truncate text-2xs text-ink-400">{m.body}</p>
      </div>
      {!m.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neg" />}
      <span className="text-2xs text-ink-400 shrink-0">{dateShort(m.created_at)}</span>
    </button>
  )
}