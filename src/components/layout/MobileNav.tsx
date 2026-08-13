import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'
import { useAuth } from '../../context/AuthContext'
import { useSidebarBadges } from '../../lib/hooks/useSidebarBadges'

export function MobileNav() {
  const { user } = useAuth()
  const badges = useSidebarBadges(user)
  if (!user) return null
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const visible = items.slice(0, 5)

  const badgeFor = (to: string): number => {
    if (to === '/inbox') return badges.inbox
    if (to === '/deals') return badges.deals
    if (to === '/leads') return badges.leads
    if (to === '/payouts') return badges.payouts
    return 0
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-line"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex items-stretch justify-between px-2 pt-1.5 pb-1.5">
        {visible.map((n) => {
          const count = badgeFor(n.to)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-2xs font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-ink-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="mobile-nav-pill"
                      className="absolute -top-0.5 h-0.5 w-8 rounded-full bg-ink"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <span className="relative">
                    <n.icon size={20} strokeWidth={1.75} />
                    {count > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-neg px-1 text-2xs font-bold text-white">
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </span>
                  <span>{n.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
