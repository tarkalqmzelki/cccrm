import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NAV } from './nav'
import { useAuth } from '../../context/AuthContext'

export function MobileNav() {
  const { user } = useAuth()
  if (!user) return null
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role))
  const visible = items.slice(0, 5)

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-line"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex items-stretch justify-between px-2 pt-1.5 pb-1.5">
        {visible.map((n) => (
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
                <n.icon size={20} strokeWidth={1.75} />
                <span>{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
