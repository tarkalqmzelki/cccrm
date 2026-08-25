import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'
import type { NavItem } from './nav'
import { loadNavSlots } from './navSlots'
import { LiquidGlassFilter, supportsLensFilter } from './LiquidGlassFilter'
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
 * Floating liquid-glass bottom nav (mobile) — liquid-glass-studio-style
 * rim refraction: on Chromium the live page bends through an SVG
 * displacement lens at the pill's edges; other engines get the layered
 * blur/saturation material. Customisation lives in Profile ▸
 * "Edit navigation".
 */
export function MobileNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const badges = useSidebarBadges(user)
  const isDark = useAppDarkTheme()
  const [lens, setLens] = useState(false)

  useEffect(() => {
    setLens(supportsLensFilter())
  }, [])

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
      {/* SVG displacement-lens defs — rendered only when supported */}
      {lens && <LiquidGlassFilter />}

      <div className={`glass-refract w-full max-w-md px-2 py-2.5 ${isDark ? '' : 'light'}${lens ? ' lens' : ''}`}>
        <div className="relative z-[2] flex items-stretch">
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
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[24px] py-2 text-[10px] font-bold transition-colors duration-200 ${
                  isActive ? 'text-ink dark:text-white' : 'text-ink-400 dark:text-white/50'
                }`}
              >
                {/* Active capsule — floats above the glass */}
                {isActive && (
                  <motion.span
                    layoutId="liquid-capsule"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="liquid-capsule rounded-[24px]"
                    style={{ inset: '-2px' }}
                  />
                )}
                <span className="relative">
                  <n.icon size={21} strokeWidth={2.25} style={{ fill: isActive ? 'currentColor' : 'none' }} />
                  {count > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white/70 dark:ring-black/50">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </span>
                <span className="relative max-w-full truncate px-0.5">{n.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
