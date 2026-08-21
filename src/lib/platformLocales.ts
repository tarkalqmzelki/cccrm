/** Platform UI locale strings — nav, buttons, labels.  Completely
 *  separate from invoice/contract document translations. */

export interface PlatformLocale {
  id: string
  locale: string
  label: string
  strings: Record<string, string>
  created_at: string
  updated_at: string
}

/** Canonical UI keys.  English defaults live here; admins add locales
 *  + override strings in Settings → Platform Locales. */
export interface LocaleKeyDef {
  key: string
  label: string
  group: string
}

export const LOCALE_KEYS: LocaleKeyDef[] = [
  // --- Navigation ---
  { key: 'nav.overview',        label: 'Overview',        group: 'Navigation' },
  { key: 'nav.inbox',           label: 'Inbox',           group: 'Navigation' },
  { key: 'nav.kanban',          label: 'Kanban',          group: 'Navigation' },
  { key: 'nav.calendar',        label: 'Calendar',        group: 'Navigation' },
  { key: 'nav.leads',           label: 'Leads',           group: 'Navigation' },
  { key: 'nav.deals',           label: 'Deals',           group: 'Navigation' },
  { key: 'nav.leaderboard',     label: 'Leaderboard',     group: 'Navigation' },
  { key: 'nav.referrals',       label: 'Referrals',       group: 'Navigation' },
  { key: 'nav.payouts',         label: 'Payouts',         group: 'Navigation' },
  { key: 'nav.finances',        label: 'Finances',        group: 'Navigation' },
  { key: 'nav.sellers',         label: 'Sellers',         group: 'Navigation' },
  { key: 'nav.createUser',      label: 'Create User',     group: 'Navigation' },
  { key: 'nav.settings',        label: 'Settings',        group: 'Navigation' },
  { key: 'nav.management',      label: 'Management',      group: 'Navigation' },
  { key: 'nav.givenAccess',     label: 'Given Access',    group: 'Navigation' },

  // --- Common actions ---
  { key: 'common.save',          label: 'Save',            group: 'Common actions' },
  { key: 'common.cancel',        label: 'Cancel',          group: 'Common actions' },
  { key: 'common.close',         label: 'Close',           group: 'Common actions' },
  { key: 'common.delete',        label: 'Delete',          group: 'Common actions' },
  { key: 'common.edit',          label: 'Edit',            group: 'Common actions' },
  { key: 'common.add',           label: 'Add',             group: 'Common actions' },
  { key: 'common.search',        label: 'Search',          group: 'Common actions' },
  { key: 'common.new',           label: 'New',             group: 'Common actions' },
  { key: 'common.filter',        label: 'Filter',          group: 'Common actions' },
  { key: 'common.clear',         label: 'Clear',           group: 'Common actions' },
  { key: 'common.all',           label: 'All',             group: 'Common actions' },
  { key: 'common.mine',          label: 'My leads',        group: 'Common actions' },
  { key: 'common.loading',       label: 'Loading…',        group: 'Common actions' },
  { key: 'common.saving',        label: 'Saving…',         group: 'Common actions' },
  { key: 'common.print',         label: 'Print',           group: 'Common actions' },
  { key: 'common.preview',       label: 'Preview',         group: 'Common actions' },
  { key: 'common.back',          label: 'Back',            group: 'Common actions' },
  { key: 'common.confirm',       label: 'Confirm',         group: 'Common actions' },

  // --- Sidebar / user card ---
  { key: 'side.whatsNew',        label: "What's new",      group: 'Sidebar' },
  { key: 'side.allSystems',      label: 'All systems operational', group: 'Sidebar' },
  { key: 'side.partialOutage',   label: 'Partial outage',  group: 'Sidebar' },
  { key: 'side.degraded',        label: 'Degraded',        group: 'Sidebar' },
  { key: 'side.profileSettings', label: 'Profile settings', group: 'Sidebar' },
  { key: 'side.signOut',         label: 'Sign out',        group: 'Sidebar' },
  { key: 'side.givenAccess',     label: 'Given Access',    group: 'Sidebar' },

  // --- Topbar ---
  { key: 'top.searchPlaceholder', label: 'Search leads, deals, people…', group: 'Topbar' },
  { key: 'top.notifications',     label: 'Notifications',     group: 'Topbar' },
  { key: 'top.viewAllInbox',      label: 'View all in inbox', group: 'Topbar' },
  { key: 'top.accessRequests',    label: 'Access requests',   group: 'Topbar' },
  { key: 'top.awaitingAccess',    label: 'Awaiting access',   group: 'Topbar' },
  { key: 'top.inbox',             label: 'Inbox',             group: 'Topbar' },
  { key: 'top.dealsReview',       label: 'Deals awaiting review', group: 'Topbar' },
  { key: 'top.allCaughtUp',       label: 'All caught up',     group: 'Topbar' },
  { key: 'top.noMessages',        label: 'No messages yet.',  group: 'Topbar' },

  // --- Page titles ---
  { key: 'page.overview',        label: 'Overview',                group: 'Page titles' },
  { key: 'page.leads',           label: 'Leads',                   group: 'Page titles' },
  { key: 'page.deals',           label: 'Deals',                   group: 'Page titles' },
  { key: 'page.inbox',           label: 'Inbox',                   group: 'Page titles' },
  { key: 'page.calendar',        label: 'Calendar',                group: 'Page titles' },
  { key: 'page.kanban',          label: 'Kanban',                  group: 'Page titles' },
  { key: 'page.leaderboard',     label: 'Leaderboard',             group: 'Page titles' },
  { key: 'page.referrals',       label: 'Referrals',               group: 'Page titles' },
  { key: 'page.payouts',         label: 'Payouts',                 group: 'Page titles' },
  { key: 'page.finances',        label: 'Finances',                group: 'Page titles' },

  // --- Profile modal ---
  { key: 'profile.title',         label: 'Profile settings',       group: 'Profile' },
  { key: 'profile.fullName',      label: 'Full name',              group: 'Profile' },
  { key: 'profile.email',         label: 'Email',                  group: 'Profile' },
  { key: 'profile.phone',         label: 'Phone',                  group: 'Profile' },
  { key: 'profile.address',       label: 'Address',                group: 'Profile' },
  { key: 'profile.photoUrl',      label: 'Photo URL',              group: 'Profile' },
  { key: 'profile.notifications', label: 'Notifications',          group: 'Profile' },
  { key: 'profile.language',      label: 'Language',               group: 'Profile' },
  { key: 'profile.changingLocale', label: 'Changing Locale',       group: 'Profile' },
  { key: 'profile.saveChanges',   label: 'Save changes',           group: 'Profile' },

  // --- Finances subtabs ---
  { key: 'fin.finance',           label: 'Finance',                group: 'Finances' },
  { key: 'fin.invoices',          label: 'Invoices',               group: 'Finances' },
  { key: 'fin.contracts',         label: 'Contracts',              group: 'Finances' },
  { key: 'fin.revenue',           label: 'Revenue',                group: 'Finances' },
  { key: 'fin.costs',             label: 'Costs',                  group: 'Finances' },
  { key: 'fin.profit',            label: 'Profit',                 group: 'Finances' },
  { key: 'fin.newInvoice',        label: 'New invoice',            group: 'Finances' },
  { key: 'fin.newContract',       label: 'New contract',           group: 'Finances' },
  { key: 'fin.printBalanceSheet', label: 'Print balance sheet',    group: 'Finances' },
  { key: 'fin.addRevenue',        label: 'Add revenue',            group: 'Finances' },
  { key: 'fin.addCost',           label: 'Add cost',               group: 'Finances' },
  { key: 'fin.period',            label: 'Period',                 group: 'Finances' },
  { key: 'fin.thisMonth',         label: 'This month',             group: 'Finances' },
  { key: 'fin.thisQuarter',       label: 'This quarter',           group: 'Finances' },
  { key: 'fin.thisYear',          label: 'This year',              group: 'Finances' },
  { key: 'fin.allTime',           label: 'All time',               group: 'Finances' },
  { key: 'fin.custom',            label: 'Custom',                 group: 'Finances' },

  // --- Leads page ---
  { key: 'leads.newLead',         label: 'New Lead',               group: 'Leads' },
  { key: 'leads.searchCompanies', label: 'Search companies…',      group: 'Leads' },
  { key: 'leads.company',         label: 'Company',                group: 'Leads' },
  { key: 'leads.offers',          label: 'Offers',                 group: 'Leads' },
  { key: 'leads.leadOwner',       label: 'Lead Owner',             group: 'Leads' },
  { key: 'leads.offerValue',      label: 'Offer Value',            group: 'Leads' },
  { key: 'leads.leadStatus',      label: 'Lead Status',            group: 'Leads' },
  { key: 'leads.created',         label: 'Created',                group: 'Leads' },
  { key: 'leads.allStatuses',     label: 'All statuses',           group: 'Leads' },
  { key: 'leads.allOwners',       label: 'All owners',             group: 'Leads' },
  { key: 'leads.allTime2',        label: 'All time',               group: 'Leads' },
  { key: 'leads.last7',           label: 'Last 7 days',            group: 'Leads' },
  { key: 'leads.last30',          label: 'Last 30 days',           group: 'Leads' },
  { key: 'leads.last90',          label: 'Last 90 days',           group: 'Leads' },

  // --- Deals page ---
  { key: 'deals.submitDeal',      label: 'Submit Deal',            group: 'Deals' },
  { key: 'deals.searchCompany',   label: 'Search company or contact', group: 'Deals' },
  { key: 'deals.gross',           label: 'Gross',                  group: 'Deals' },
  { key: 'deals.status',          label: 'Status',                 group: 'Deals' },
  { key: 'deals.date',            label: 'Date',                   group: 'Deals' },
  { key: 'deals.owner',           label: 'Owner',                  group: 'Deals' },

  // --- Inbox ---
  { key: 'inbox.newMessage',      label: 'New message',            group: 'Inbox' },
  { key: 'inbox.markAllRead',     label: 'Mark all read',          group: 'Inbox' },
  { key: 'inbox.received',        label: 'Received',               group: 'Inbox' },
  { key: 'inbox.sent',            label: 'Sent',                   group: 'Inbox' },
  { key: 'inbox.starred',         label: 'Starred',                group: 'Inbox' },
  { key: 'inbox.archive',         label: 'Archive',                group: 'Inbox' },
  { key: 'inbox.trash',           label: 'Trash',                  group: 'Inbox' },
  { key: 'inbox.generalChat',     label: 'General chat',           group: 'Inbox' },

  // --- Auth ---
  { key: 'auth.signIn',           label: 'Sign in',                group: 'Authentication' },
  { key: 'auth.signingIn',        label: 'Signing in…',            group: 'Authentication' },
  { key: 'auth.rememberMe',       label: 'Remember me',            group: 'Authentication' },
  { key: 'auth.forgotPassword',   label: 'Forgot password?',       group: 'Authentication' },
  { key: 'auth.welcomeBack',      label: 'Welcome back',           group: 'Authentication' },
]

export const ENGLISH_LOCALE: Record<string, string> = Object.fromEntries(
  LOCALE_KEYS.map((k) => [k.key, k.label]),
)
