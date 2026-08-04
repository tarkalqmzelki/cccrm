import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { NAV } from './nav'
import { useAuth } from '../../context/AuthContext'

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)))
  const active = items.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))
  const title = active?.label || 'Overview'

  return (
    <header
      className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md lg:pl-8"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <button onClick={onMenu} className="lg:hidden -ml-1 p-2 text-ink hover:bg-ink-50 rounded-lg transition-colors">
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
    </header>
  )
}
