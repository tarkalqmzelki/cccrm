import { LayoutDashboard, Briefcase, Trophy, Network, Wallet, UsersRound, Settings, UserPlus, Building2, Inbox, Coins, KanbanSquare, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../../lib/types'

export interface NavItem {
  to: string
  label: string
  /** Key into the platform locale strings table (used by `t()`). */
  labelKey: string
  icon: LucideIcon
  roles?: Role[]
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', icon: Inbox },
  { to: '/kanban', label: 'Kanban', labelKey: 'nav.kanban', icon: KanbanSquare },
  { to: '/calendar', label: 'Calendar', labelKey: 'nav.calendar', icon: Calendar },
  { to: '/leads', label: 'Leads', labelKey: 'nav.leads', icon: Building2 },
  { to: '/deals', label: 'Deals', labelKey: 'nav.deals', icon: Briefcase },
  { to: '/leaderboard', label: 'Leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { to: '/referrals', label: 'Referrals', labelKey: 'nav.referrals', icon: Network },
  { to: '/payouts', label: 'Payouts', labelKey: 'nav.payouts', icon: Wallet },
  { to: '/finances', label: 'Finances', labelKey: 'nav.finances', icon: Coins, roles: ['admin'] },
  { to: '/sellers', label: 'Sellers', labelKey: 'nav.sellers', icon: UsersRound, roles: ['admin'] },
  { to: '/create-user', label: 'Create User', labelKey: 'nav.createUser', icon: UserPlus, roles: ['admin'] },
  { to: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
]
