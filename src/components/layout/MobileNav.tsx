import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'
import type { NavItem } from './nav'
import { loadNavSlots } from './navSlots'
import { useAuth } from '../../context/AuthContext'
import { useSidebarBadges } from '../../lib/hooks/useSidebarBadges'

/** Tracks the app's own `.dark` class on <html> (in-app toggle). */
function useAppDarkTheme(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/**
 * Floating bottom nav (mobile) — Instagram style: a slim solid pill,
 * icon-only items (strokes preserved — never filled), and a soft
 * capsule behind the active icon. Theme-aware: dark charcoal in dark
 * mode, clean white in light mode. Red dots mark pending badges.
 */
export function MobileNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const badges = useSidebarBadges(user)
  const isDark = useAppDarkTheme()

  const [slots, setSlots] = useState<string[]>(() => {
    if (!user) return []
    return loadNavSlots(NAV.filter((n) => !n.roles || n.roles.includes(user.role)))
  })

  useEffect(() => {
    if (!user) {
      setSlots([])
      return
    }
    setSlots(loadNavSlots(NAV.filter((n) => !n.roles || n.roles.includes(user.role))))
  }, [user?.id, user?.role])

  if (!user) return null
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const itemMap: Record<string, NavItem> = {}
  items.forEach((n) => (itemMap[n.to] = n))
  const visible = slots.map((to) => itemMap[to]).filter(Boolean) as NavItem[]

  const badgeFor = (to: string): number => {
    if (to === '/inbox') return badges.inbox
    if (to === '/deals') return badges.deals
    if (to === '/leads') return badges.leads
    if (to === '/payouts') return badges.payouts
    return 0
  }

  return (
    <nav
      className="lg:hidden fixed inset-x-0 z-40 flex justify-center px-3"
      style={{ bottom: 'calc(12px + var(--safe-bottom))' }}
    >
      <div
        className={`flex items-center gap-0.5 rounded-full border p-1.5 ${
          isDark
            ? 'border-white/10 bg-[#0f0f12] shadow-[0_18px_44px_-12px_rgba(0,0,0,0.55)]'
            : 'border-black/[0.08] bg-white shadow-[0_18px_44px_-16px_rgba(0,0,0,0.28)]'
        }`}
      >
        {visible.map((n) => {
          const count = badgeFor(n.to)
          const isActive = (() => {
            const p = window.location.pathname
            if (n.to === '/') return p === '/'
            return p.startsWith(n.to)
          })()
          return (
            <button
              key={n.to}
              type="button"
              onClick={() => navigate(n.to)}
              aria-label={n.label}
              title={n.label}
              className={`relative flex h-11 min-w-[62px] items-center justify-center rounded-full px-4 transition-colors duration-200 ${
                isActive
                  ? isDark ? 'text-white' : 'text-black'
                  : isDark ? 'text-white/60 hover:text-white' : 'text-black/50 hover:text-black'
              }`}
            >
              {/* Active capsule — the gray Instagram-style pill */}
              {isActive && (
                <motion.span
                  layoutId="nav-active-pill"
                  transition={{ type: 'spring', stiffness: 430, damping: 36 }}
                  className={`absolute inset-0 rounded-full ${isDark ? 'bg-[#3c3c42]' : 'bg-black/[0.08]'}`}
                />
              )}
              <span className="relative">
                {/* Strokes stay strokes — no fill, so glyphs never blob out */}
                <n.icon size={24} strokeWidth={2} />
                {/* Instagram-style red dot for pending badges */}
                {count > 0 && (
                  <span
                    className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#ff3040]"
                    style={{ boxShadow: isDark ? '0 0 0 2px #0f0f12' : '0 0 0 2px #ffffff' }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
