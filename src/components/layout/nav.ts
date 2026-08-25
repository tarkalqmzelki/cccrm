import { LayoutDashboard, Briefcase, Trophy, Network, Wallet, UsersRound, Settings, UserPlus, Building2, Inbox, Coins, KanbanSquare, Calendar, Swords, Globe2, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '../../lib/types'

export interface NavItem {
  to: string
  label: string
  /** Key into the platform locale strings table (used by `t()`). */
  labelKey: string
  icon: LucideIcon
  roles?: Role[]
  /** When set, the item renders nested under this parent path
   *  instead of as a top-level link (e.g. admin's Map under Leads). */
  parent?: string
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', icon: Inbox },
  { to: '/kanban', label: 'Kanban', labelKey: 'nav.kanban', icon: KanbanSquare },
  { to: '/calendar', label: 'Calendar', labelKey: 'nav.calendar', icon: Calendar },
  { to: '/leads', label: 'Leads', labelKey: 'nav.leads', icon: Building2 },
  /* Admins get the world map tucked under Leads; everyone else sees it top-level. */
  { to: '/map', label: 'Map', labelKey: 'nav.map', icon: Globe2, parent: '/leads', roles: ['admin'] },
  { to: '/marketplace', label: 'Lead Marketplace', labelKey: 'nav.marketplace', icon: Store },
  { to: '/deals', label: 'Deals', labelKey: 'nav.deals', icon: Briefcase },
  { to: '/leaderboard', label: 'Leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { to: '/challenges', label: 'Challenges', labelKey: 'nav.challenges', icon: Swords },
  { to: '/referrals', label: 'Referrals', labelKey: 'nav.referrals', icon: Network },
  { to: '/payouts', label: 'Payouts', labelKey: 'nav.payouts', icon: Wallet },
  { to: '/map', label: 'Map', labelKey: 'nav.map', icon: Globe2, roles: ['seller', 'headhunter'] },
  { to: '/finances', label: 'Finances', labelKey: 'nav.finances', icon: Coins, roles: ['admin'] },
  { to: '/sellers', label: 'Sellers', labelKey: 'nav.sellers', icon: UsersRound, roles: ['admin'] },
  { to: '/create-user', label: 'Create User', labelKey: 'nav.createUser', icon: UserPlus, roles: ['admin'] },
  { to: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
]
