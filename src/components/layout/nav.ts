import { LayoutDashboard, Briefcase, Trophy, Network, Wallet, UsersRound, Settings, UserPlus, Building2, Inbox } from 'lucide-react'
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
  { to: '/leads', label: 'Leads', icon: Building2 },
  { to: '/deals', label: 'Deals', icon: Briefcase },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/referrals', label: 'Referrals', icon: Network },
  { to: '/payouts', label: 'Payouts', icon: Wallet },
  { to: '/sellers', label: 'Sellers', icon: UsersRound, roles: ['admin'] },
  { to: '/create-user', label: 'Create User', icon: UserPlus, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
]
