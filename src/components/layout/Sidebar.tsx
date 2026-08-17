import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, UserCog, ChevronDown, Inbox, KeyRound, Activity } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { NAV } from './nav'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ProfileModal } from '../ProfileModal'
import { SystemStatusModal } from '../SystemStatusModal'
import { ChangeLogPill, ChangeLogModal } from '../ChangeLogModal'
import { useSidebarBadges } from '../../lib/hooks/useSidebarBadges'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { SystemStatus } from '../../lib/types'

const BADGE = 'Live'

export function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const badges = useSidebarBadges(user)
  if (!user) return null

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const badgeFor = (to: string): number => {
    if (to === '/inbox') return badges.inbox
    if (to === '/deals') return badges.deals
    if (to === '/leads') return badges.leads
    if (to === '/payouts') return badges.payouts
    return 0
  }

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-line bg-surface px-3 py-5 z-30">
        <Brand />
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto pr-1 -mr-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink-50 hover:text-ink'
                }`
              }
            >
              <n.icon size={18} strokeWidth={1.75} />
              {n.label}
              <NavBadge count={badgeFor(n.to)} light={false} />
            </NavLink>
          ))}
        </nav>
        <ChangeLogPill onClick={() => setChangelogOpen(true)} />
        <SystemStatusPill onClick={() => setStatusOpen(true)} />
        <UserCard
          onProfile={() => setProfileOpen(true)}
          onLogout={() => setConfirmLogout(true)}
          unread={badges.inbox}
        />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-[140]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-900/30" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0 w-72 glass-strong flex flex-col px-3 py-5"
            >
              <Brand />
              <nav className="mt-6 flex-1 space-y-0.5" onClick={() => setMobileOpen(false)}>
                {items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink-50 hover:text-ink'
                      }`
                    }
                  >
                    <n.icon size={18} strokeWidth={1.75} />
                    {n.label}
                    <NavBadge count={badgeFor(n.to)} light={false} />
                  </NavLink>
                ))}
              </nav>
              <ChangeLogPill onClick={() => { setMobileOpen(false); setChangelogOpen(true) }} />
              <SystemStatusPill onClick={() => { setMobileOpen(false); setStatusOpen(true) }} />
              <UserCard
                onProfile={() => { setMobileOpen(false); setProfileOpen(true) }}
                onLogout={() => { setMobileOpen(false); setConfirmLogout(true) }}
                unread={badges.inbox}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Sign out?"
        desc="You'll need to sign in again to continue."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { setConfirmLogout(false); await signOut(); navigate('/') }}>Sign out</Button>
          </>
        }
      >
        <p className="text-sm text-ink-500">Confirm you want to end this session.</p>
      </Modal>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SystemStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} />
      <ChangeLogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </>
  )
}

function NavBadge({ count, light }: { count: number; light: boolean }) {
  if (count <= 0) return null
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`absolute right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold ${
        light ? 'bg-neg text-white' : 'bg-neg text-white'
      }`}
    >
      {count > 9 ? '9+' : count}
    </motion.span>
  )
}

function SystemStatusPill({ onClick }: { onClick: () => void }) {
  const { data, reload } = useAsync(async () => db.listSystemStatuses(), [])
  const systems: SystemStatus[] = data || []
  const anyDown = systems.some((s) => s.status === 'down')
  const anyMaint = systems.some((s) => s.status === 'maintenance')
  const dotColor = anyDown ? '#ef4444' : anyMaint ? '#f59e0b' : '#22c55e'
  const label = !systems.length ? 'Status' : anyDown ? 'Partial outage' : anyMaint ? 'Degraded' : 'All systems operational'

  return (
    <button
      onClick={() => { reload(); onClick() }}
      className="mb-2 flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left hover:bg-ink-50 transition-colors"
      title="Open system status"
    >
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
        {systems.length > 0 && (
          <span className="absolute inset-0 rounded-full status-ring" style={{ background: dotColor, opacity: 0.3 }} />
        )}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: dotColor, margin: 'auto' }} />
      </span>
      <span className="flex-1 truncate text-2xs font-medium text-ink-600">{label}</span>
      <Activity size={13} strokeWidth={1.75} className="text-ink-400" />
    </button>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="https://kappa.lol/FAHnNi" alt="Calista" className="h-8 w-auto" />
      <div className="leading-tight">
        <p className="text-sm font-semibold">Calista Concept</p>
        <p className="text-2xs text-ink-400">Referrals & Revenue</p>
      </div>
      <span className="ml-auto rounded-full border border-line bg-ink-50 px-2 py-0.5 text-2xs font-medium text-ink-500">{BADGE}</span>
    </div>
  )
}

function UserCard({ onProfile, onLogout, unread }: { onProfile: () => void; onLogout: () => void; unread: number }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <div className="mt-2">
      <Dropdown
        align="left"
        width={220}
        dropUp
        trigger={
          <div className="flex w-full items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 hover:bg-ink-50 transition-colors">
            <div className="relative">
              <Avatar name={user.full_name} color={user.avatar_color} url={user.avatar_url} size={32} />
              {unread > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 text-2xs font-bold text-white"
                >
                  {unread > 9 ? '9+' : unread}
                </motion.span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="truncate text-2xs text-ink-400 capitalize">{user.role}</p>
            </div>
            <ChevronDown size={15} strokeWidth={1.75} className="text-ink-400" />
          </div>
        }
        items={[
          { label: 'Profile settings', icon: <UserCog size={15} strokeWidth={1.75} />, onClick: onProfile },
          { label: unread > 0 ? `Inbox (${unread})` : 'Inbox', icon: <Inbox size={15} strokeWidth={1.75} />, onClick: () => navigate('/inbox') },
          { label: 'Given Access', icon: <KeyRound size={15} strokeWidth={1.75} />, onClick: () => navigate('/given-access') },
          { divider: true },
          { label: 'Sign out', icon: <LogOut size={15} strokeWidth={1.75} />, onClick: onLogout, danger: true },
        ]}
      />
    </div>
  )
}
