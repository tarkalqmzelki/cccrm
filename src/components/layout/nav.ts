import { LayoutDashboard, Briefcase, Trophy, Network, Wallet, UsersRound, Settings, UserPlus, Building2, Inbox, Coins, KanbanSquare, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../../lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/kanban', label: 'Kanban', icon: KanbanSquare },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/leads', label: 'Leads', icon: Building2 },
  { to: '/deals', label: 'Deals', icon: Briefcase },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/referrals', label: 'Referrals', icon: Network },
  { to: '/payouts', label: 'Payouts', icon: Wallet },
  { to: '/finances', label: 'Finances', icon: Coins, roles: ['admin'] },
  { to: '/sellers', label: 'Sellers', icon: UsersRound, roles: ['admin'] },
  { to: '/create-user', label: 'Create User', icon: UserPlus, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
]
