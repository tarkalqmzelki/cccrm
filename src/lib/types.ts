export type Role = 'admin' | 'seller' | 'headhunter'
export type Level = 'L1' | 'L2' | 'L3'
export type DealStatus =
  | 'cold_call'
  | 'warm_call'
  | 'unfinished'
  | 'to_be_finished'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'closed'
export type PayoutStatus = 'pending' | 'paid' | 'cancelled'

// ---- Leads / Opportunities module ----
export type OppStatus =
  | 'new' | 'researching' | 'contact_found' | 'contacted' | 'interested'
  | 'meeting_scheduled' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'archived'

export type ActivityType =
  | 'note' | 'call' | 'email' | 'meeting' | 'message' | 'reminder' | 'upload' | 'status_change' | 'created'

export type TaskStatusType = 'open' | 'in_progress' | 'done' | 'cancelled'

export const OPP_STATUS_META: Record<OppStatus, { label: string; tone: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }> = {
  new: { label: 'New', tone: 'info' },
  researching: { label: 'Researching', tone: 'neutral' },
  contact_found: { label: 'Contact Found', tone: 'neutral' },
  contacted: { label: 'Contacted', tone: 'warn' },
  interested: { label: 'Interested', tone: 'warn' },
  meeting_scheduled: { label: 'Meeting Scheduled', tone: 'info' },
  proposal_sent: { label: 'Proposal Sent', tone: 'info' },
  negotiation: { label: 'Negotiation', tone: 'warn' },
  won: { label: 'Won', tone: 'pos' },
  lost: { label: 'Lost', tone: 'neg' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export const OPP_STATUSES = Object.keys(OPP_STATUS_META) as OppStatus[]

export interface Company {
  id: string
  name: string
  website: string
  domain: string
  vat_number: string
  industry: string
  description: string
  address: string
  logo_url: string
  summary: string
  /** Direct contact line (schema61 — populated from marketplace claims). */
  phone?: string
  /** Structured geography (schema64) — powers the world map. */
  country?: string
  city?: string
  /** Comma-separated services the lead is interested in (schema64). */
  services_offered?: string
  created_by: string | null
  lead_status: LeadStatus
  lead_status_updated_at: string | null
  created_at: string
  updated_at: string
}

/** Per-lead status, separate from opp/deal status. Settable by lead
 *  owner or admin on the Leads page or CompanyDetail header. */
export type LeadStatus = 'new' | 'contacted' | 'interested' | 'in_progress' | 'won' | 'lost'

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }> = {
  new:         { label: 'New',           tone: 'info' },
  contacted:   { label: 'Contacted',     tone: 'neutral' },
  interested:  { label: 'Interested',    tone: 'warn' },
  in_progress: { label: 'In progress',   tone: 'info' },
  won:         { label: 'Won',            tone: 'pos' },
  lost:        { label: 'Lost',          tone: 'neg' },
}

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_META) as LeadStatus[]

export interface Contact {
  id: string
  company_id: string
  full_name: string
  email: string
  phone: string
  role: string
  linkedin: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ServiceItem {
  id: string
  name: string
  slug: string
  is_custom: boolean
  created_by: string | null
  created_at: string
}

export interface Opportunity {
  id: string
  company_id: string
  service_id: string
  owner_id: string
  title: string
  status: OppStatus
  priority: 'low' | 'medium' | 'high'
  est_revenue: number
  offer_value: number
  offer_description: string
  next_follow_up: string | null
  notes: string
  converted_deal_id: string | null
  created_at: string
  updated_at: string
}

export interface CompanyFollowUp {
  id: string
  company_id: string
  author_id: string
  title: string
  body: string
  follow_up_date: string | null
  created_at: string
}

export interface Activity {
  id: string
  opportunity_id: string
  company_id: string
  actor_id: string | null
  type: ActivityType
  title: string
  description: string
  old_status: OppStatus | null
  new_status: OppStatus | null
  created_at: string
}

export interface Task {
  id: string
  opportunity_id: string
  assignee_id: string | null
  title: string
  description: string
  status: TaskStatusType
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface CompanyNote {
  id: string
  company_id: string
  author_id: string | null
  body: string
  created_at: string
}

export interface OpportunityNote {
  id: string
  opportunity_id: string
  author_id: string | null
  body: string
  created_at: string
}

// ---- Access requests & inbox ----
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'
export type InboxType =
  | 'access_request' | 'access_approved' | 'access_rejected'
  | 'note_reply' | 'note_vote' | 'admin_grant' | 'system'
  | 'direct_message' | 'activity_assigned' | 'activity_reassigned'

export interface AccessRequest {
  id: string
  requester_id: string
  owner_id: string
  opportunity_id: string | null
  company_id: string | null
  status: AccessRequestStatus
  message: string
  created_at: string
  responded_at: string | null
}

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent'
export type MessageFolder = 'inbox' | 'archive' | 'trash'

export interface InboxMessage {
  id: string
  recipient_id: string
  sender_id: string | null
  type: InboxType
  title: string
  body: string
  read: boolean
  action_url: string
  metadata: Record<string, unknown>
  created_at: string
  // schema28 — email-like fields
  priority: MessagePriority
  priority_override: MessagePriority | null
  category: string
  category_override: string | null
  is_starred: boolean
  folder: MessageFolder
  thread_id: string | null
  parent_id: string | null
}

export const MESSAGE_PRIORITY_META: Record<MessagePriority, { label: string; tone: 'neutral' | 'info' | 'warn' | 'neg'; color: string; weight: number }> = {
  low:    { label: 'Low',    tone: 'neutral', color: '#6b7280', weight: 0 },
  normal: { label: 'Normal', tone: 'neutral', color: '#9ca3af', weight: 1 },
  high:   { label: 'High',   tone: 'warn',    color: '#f59e0b', weight: 2 },
  urgent: { label: 'Urgent', tone: 'neg',    color: '#ef4444', weight: 3 },
}

export const MESSAGE_PRIORITIES: MessagePriority[] = ['low', 'normal', 'high', 'urgent']

export const MESSAGE_FOLDER_META: Record<MessageFolder, { label: string }> = {
  inbox:   { label: 'Inbox' },
  archive: { label: 'Archive' },
  trash:   { label: 'Trash' },
}

export interface NoteComment {
  id: string
  parent_id: string
  author_id: string | null
  body: string
  created_at: string
}

export interface ChatMessage {
  id: string
  sender_id: string
  body: string
  created_at: string
}

export type SystemStatusValue = 'operating' | 'maintenance' | 'down'

export interface SystemStatus {
  id: string
  system: string
  status: SystemStatusValue
  uptime_pct: number
  note: string
  updated_at: string
}

export const SYSTEM_STATUS_META: Record<SystemStatusValue, { label: string; tone: 'pos' | 'warn' | 'neg'; color: string }> = {
  operating:   { label: 'Operational', tone: 'pos',  color: '#22c55e' },
  maintenance: { label: 'Maintenance', tone: 'warn', color: '#f59e0b' },
  down:        { label: 'Not working', tone: 'neg',  color: '#ef4444' },
}

export type FinanceKind = 'revenue' | 'cost'

export type FinanceCategory =
  | 'product_sale' | 'service_sale' | 'closed_deal_commission' | 'other_revenue'
  | 'materials' | 'utility_bill' | 'office' | 'salary' | 'marketing' | 'software' | 'taxes' | 'other_cost'

export interface FinanceEntry {
  id: string
  kind: FinanceKind
  category: FinanceCategory
  title: string
  description: string
  amount: number
  entry_date: string
  deal_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const FINANCE_CATEGORY_META: Record<FinanceCategory, { label: string; kind: FinanceKind }> = {
  product_sale:           { label: 'Product sale',           kind: 'revenue' },
  service_sale:           { label: 'Service sale',           kind: 'revenue' },
  closed_deal_commission: { label: 'Closed deal commission',  kind: 'revenue' },
  other_revenue:          { label: 'Other revenue',            kind: 'revenue' },
  materials:              { label: 'Materials',                 kind: 'cost' },
  utility_bill:           { label: 'Utility bill',              kind: 'cost' },
  office:                 { label: 'Office',                    kind: 'cost' },
  salary:                 { label: 'Salary',                    kind: 'cost' },
  marketing:              { label: 'Marketing',                 kind: 'cost' },
  software:               { label: 'Software / subscriptions',  kind: 'cost' },
  taxes:                  { label: 'Taxes',                     kind: 'cost' },
  other_cost:             { label: 'Other cost',                kind: 'cost' },
}

export const FINANCE_REVENUE_CATEGORIES: FinanceCategory[] = [
  'product_sale', 'service_sale', 'closed_deal_commission', 'other_revenue',
]

export const FINANCE_COST_CATEGORIES: FinanceCategory[] = [
  'materials', 'utility_bill', 'office', 'salary', 'marketing', 'software', 'taxes', 'other_cost',
]

/* ---- Scheduled activities (Kanban + Calendar) ---- */
export type ScheduledActivityType = 'call' | 'meeting' | 'potential_meeting' | 'email' | 'task' | 'reminder'
export type ScheduledActivityStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

export interface ScheduledActivity {
  id: string
  owner_id: string
  type: ScheduledActivityType
  status: ScheduledActivityStatus
  title: string
  notes: string
  color: string
  scheduled_at: string
  duration_min: number
  company_id: string | null
  opportunity_id: string | null
  visible_on_calendar: boolean
  created_at: string
  updated_at: string
}

export interface ActivityComment {
  id: string
  activity_id: string
  author_id: string
  body: string
  created_at: string
}

export const ACTIVITY_TYPE_META: Record<ScheduledActivityType, { label: string; color: string }> = {
  call:               { label: 'Call',              color: '#14b8a6' },
  meeting:            { label: 'Meeting',           color: '#3b82f6' },
  potential_meeting: { label: 'Potential meeting', color: '#a855f7' },
  email:              { label: 'Email',             color: '#f59e0b' },
  task:               { label: 'Task',              color: '#fb923c' },
  reminder:           { label: 'Reminder',         color: '#6b7280' },
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_META) as ScheduledActivityType[]

export const ACTIVITY_STATUS_META: Record<ScheduledActivityStatus, { label: string; tone: 'info' | 'warn' | 'pos' | 'neg' | 'neutral' }> = {
  planned:      { label: 'Planned',       tone: 'info' },
  in_progress:  { label: 'In progress',  tone: 'warn' },
  completed:    { label: 'Done',          tone: 'pos' },
  cancelled:   { label: 'Cancelled',    tone: 'neutral' },
  no_show:     { label: 'No-show',       tone: 'neg' },
}

export const KANBAN_COLUMNS: ScheduledActivityStatus[] = ['planned', 'in_progress', 'completed', 'cancelled', 'no_show']

export const ACTIVITY_COLOR_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#a855f7', // purple
  '#14b8a6', // teal
  '#fb923c', // orange
  '#6b7280', // gray
]

export interface NoteVote {
  id: string
  voter_id: string
  note_id: string | null
  comment_id: string | null
  vote: 'up' | 'down'
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  level: Level
  active: boolean
  avatar_color: string
  avatar_url: string
  phone: string
  address: string
  uid: string
  custom_commission_pct: number | null
  /** When false, the member is excluded from all leaderboards (admin
   *  toggle from Sellers → Edit Account). Defaults to true. */
  show_in_leaderboard: boolean
  created_at: string
  updated_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referee_id: string
  note: string
  created_at: string
}

export interface Lead {
  id: string
  owner_id: string
  company: string
  contact_name: string
  email: string
  phone: string
  website: string
  meeting_place: string
  status: DealStatus
  notes: string
  created_at: string
  updated_at: string
}

export interface Deal {
  id: string
  seller_id: string
  lead_id: string | null
  opportunity_id: string | null
  company: string
  contact_name: string
  email: string
  phone: string
  website: string
  meeting_place: string
  gross_value: number
  collected_amount: number
  commission_pct: number
  custom_commission_pct: number | null
  status: DealStatus
  notes: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface Payout {
  id: string
  seller_id: string
  deal_id: string | null
  amount: number
  paid_amount: number
  status: PayoutStatus
  period: string
  payout_type: 'sale' | 'referral'
  created_at: string
  paid_at: string | null
}

/* =====================================================================
 * CHALLENGES — admin-authored quests (schema59)
 * ===================================================================== */

/** 'functional' challenges are auto-checked against platform data;
 *  'regular' ones are free-form and self-reported by the member. */
export type ChallengeType = 'functional' | 'regular'

/** Which platform action auto-checks a functional challenge. */
export type FunctionalChallengeType = 'lead_created' | 'deal_submitted'

export const FUNCTIONAL_CHALLENGE_META: Record<FunctionalChallengeType, { label: string; hint: string }> = {
  lead_created:   { label: 'Leads created',   hint: 'Counts new leads the member creates after the challenge goes live.' },
  deal_submitted: { label: 'Deals submitted', hint: 'Counts new deals the member submits after the challenge goes live.' },
}

export interface Challenge {
  id: string
  title: string
  description: string
  type: ChallengeType
  functional_type: FunctionalChallengeType
  target_count: number
  points: number
  financial_bonus: number
  status: 'active' | 'ended'
  /** 'solo' = per-member quest · 'team' = whole company pools progress */
  scope?: 'solo' | 'team'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ChallengeProgress {
  id: string
  challenge_id: string
  user_id: string
  progress: number
  completed_at: string | null
  bonus_paid: boolean
  updated_at: string
}

export const CHALLENGE_TYPE_META: Record<ChallengeType, { label: string; desc: string }> = {
  functional: { label: 'Functional', desc: 'Auto-checked by the platform — progress is detected automatically.' },
  regular:    { label: 'Regular',    desc: 'Free-form quest — members report their own progress.' },
}

export type ChallengeScope = 'solo' | 'team'

/* =====================================================================
 * LEADS MARKETPLACE (schema61) — import pool feeding the Leads page
 * ===================================================================== */

/** Mirrors the company/lead creation shape so JSON imports map 1:1. */
export interface MarketLead {
  id: string
  name: string
  website: string
  domain: string
  vat_number: string
  industry: string
  description: string
  address: string
  logo_url: string
  summary: string
  /** Direct contact line — essential for outreach after claiming. */
  phone: string
  /** false = hidden from the marketplace (import default). */
  published: boolean
  /** Claim timer — locked until this instant (null = claimable now). */
  unlock_at: string | null
  /** Reserved for this member only. */
  allocated_to: string | null
  claimed_by: string | null
  claimed_at: string | null
  imported_by: string | null
  created_at: string
  updated_at: string
}

export function marketLeadState(m: Pick<MarketLead, 'published' | 'unlock_at' | 'allocated_to' | 'claimed_by'>, now = Date.now()):
  'claimed' | 'draft' | 'allocated' | 'locked' | 'live' {
  if (m.claimed_by) return 'claimed'
  if (!m.published) return 'draft'
  if (m.unlock_at && new Date(m.unlock_at).getTime() > now) return 'locked'
  if (m.allocated_to) return 'allocated'
  return 'live'
}

/* =====================================================================
 * BANK (schema63) — admin-issued virtual cards + manual ledger
 * ===================================================================== */

export interface BankCard {
  id: string
  user_id: string
  holder_name: string
  card_number: string
  expiry: string
  cvv: string
  brand: string
  gradient: string
  initial_balance: number
  frozen: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type BankTxKind = 'topup' | 'spend'

export interface BankTransaction {
  id: string
  card_id: string
  kind: BankTxKind
  category: string
  amount: number
  note: string
  occurred_at: string
  created_by: string | null
  created_at: string
}

/** Spend categories (power the Daily Spent panel). */
export const BANK_SPEND_CATEGORIES = [
  'salary', 'ads', 'software', 'food', 'travel', 'supplies', 'games', 'other',
] as const
export type BankSpendCategory = (typeof BANK_SPEND_CATEGORIES)[number]

export const BANK_SPEND_CATEGORY_META: Record<BankSpendCategory, { label: string }> = {
  salary:   { label: 'Salary' },
  ads:      { label: 'Ads' },
  software: { label: 'Software' },
  food:     { label: 'Food' },
  travel:   { label: 'Travel' },
  supplies: { label: 'Supplies' },
  games:    { label: 'Online games' },
  other:    { label: 'Other' },
}

/** Top-up categories. */
export const BANK_TOPUP_CATEGORIES = ['payout', 'bonus', 'correction', 'other'] as const
export type BankTopupCategory = (typeof BANK_TOPUP_CATEGORIES)[number]

export const BANK_TOPUP_CATEGORY_META: Record<BankTopupCategory, { label: string }> = {
  payout:     { label: 'Payout' },
  bonus:      { label: 'Bonus' },
  correction: { label: 'Correction' },
  other:      { label: 'Other' },
}

/** Card visual themes — gradient pairs tuned to the platform gamma. */
export const CARD_GRADIENTS: Record<string, { name: string; from: string; to: string }> = {
  aurora:   { name: 'Aurora',   from: '#f59e0b', to: '#78350f' },
  ocean:    { name: 'Ocean',    from: '#38bdf8', to: '#1e3a8a' },
  sunset:   { name: 'Sunset',   from: '#fb7185', to: '#7c2d12' },
  emerald:  { name: 'Emerald',  from: '#34d399', to: '#064e3b' },
  midnight: { name: 'Midnight', from: '#64748b', to: '#020617' },
}

export function cardGradient(key: string) {
  return CARD_GRADIENTS[key] ?? CARD_GRADIENTS.aurora
}

/** Balance of a card given its ledger. */
export function bankCardBalance(card: Pick<BankCard, 'initial_balance'>, txs: BankTransaction[]): number {
  return txs.reduce(
    (bal, t) => (t.kind === 'topup' ? bal + t.amount : bal - t.amount),
    card.initial_balance || 0,
  )
}

/** Masked number for display: keep last 4. */
export function maskCardNumber(num: string): string {
  const digits = (num || '').replace(/\s+/g, '')
  if (digits.length <= 4) return `•••• ${digits}`
  return `•••• •••• •••• ${digits.slice(-4)}`
}

/** Full number, grouped in 4s for online checkouts. */
export function formatCardNumber(num: string): string {
  const digits = (num || '').replace(/\D/g, '')
  return digits.replace(/(.{4})/g, '$1 ').trim() || '—'
}

export interface Settings {
  id: number
  l1_threshold: number
  l2_threshold: number
  l3_threshold: number
  l1_commission_pct: number
  l2_commission_pct: number
  l3_commission_pct: number
  referral_commission_pct: number
  l1_referral_pct: number
  l2_referral_pct: number
  l3_referral_pct: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  l1_threshold: 0,
  l2_threshold: 5000,
  l3_threshold: 15000,
  l1_commission_pct: 10,
  l2_commission_pct: 15,
  l3_commission_pct: 20,
  referral_commission_pct: 5,
  l1_referral_pct: 5,
  l2_referral_pct: 5,
  l3_referral_pct: 5,
}

export const STATUS_META: Record<DealStatus, { label: string; tone: 'pos' | 'neg' | 'warn' | 'info' | 'neutral' }> = {
  cold_call: { label: 'Cold Call', tone: 'neutral' },
  warm_call: { label: 'Warm Call', tone: 'warn' },
  unfinished: { label: 'Unfinished', tone: 'neg' },
  to_be_finished: { label: 'To Finish', tone: 'warn' },
  pending_review: { label: 'Pending Review', tone: 'info' },
  approved: { label: 'Approved', tone: 'pos' },
  rejected: { label: 'Rejected', tone: 'neg' },
  closed: { label: 'Closed', tone: 'pos' },
}

// =====================================================================
// Web Push notifications
// =====================================================================

/**
 * Canonical notification keys.  Admins see the `admin_*` set in their
 * Settings tab; users see the `user_*` set in their Profile modal.
 * The Edge Function resolves an `inbox_messages` row to one of these
 * keys (via `notification_key` column or by mapping `inbox_type` + role).
 */
export type NotificationKey =
  | 'admin_deal_new'
  | 'admin_deal_review'
  | 'admin_lead_new'
  | 'admin_inbox'
  | 'admin_meeting'
  | 'admin_payout_reminder'
  | 'user_inbox'
  | 'user_deal_approved'
  | 'user_lead_status'
  | 'user_payout'
  | 'user_lead_reminder'
  | 'user_whats_new'
  | 'user_broadcast'
  | 'user_chat'
  | 'user_challenge_new'
  | 'user_challenge_completed'

export interface NotificationKeyMeta {
  key: NotificationKey
  label: string
  desc: string
  role: 'admin' | 'user'
}

export const NOTIFICATION_KEYS: NotificationKeyMeta[] = [
  { key: 'admin_deal_new',        label: 'New deal submitted',     desc: 'When a seller submits a new deal.',          role: 'admin' },
  { key: 'admin_deal_review',     label: 'Deal needs review',      desc: 'When a deal is pending your approval.',      role: 'admin' },
  { key: 'admin_lead_new',        label: 'New lead added',         desc: 'When a new lead is created.',                role: 'admin' },
  { key: 'admin_inbox',           label: 'Inbox messages',         desc: 'Direct messages and system notifications.',  role: 'admin' },
  { key: 'admin_meeting',         label: 'Calendar activities',    desc: 'When an activity is assigned to you.',       role: 'admin' },
  { key: 'admin_payout_reminder', label: 'Pending payout reminder',desc: 'Daily reminder of stale pending payouts.',   role: 'admin' },
  { key: 'user_inbox',            label: 'Inbox messages',         desc: 'Direct messages from admins or members.',    role: 'user'  },
  { key: 'user_deal_approved',    label: 'Deal approved',          desc: 'When one of your deals is approved.',        role: 'user'  },
  { key: 'user_lead_status',      label: 'Lead status changes',    desc: 'When the status of your lead is updated.',   role: 'user'  },
  { key: 'user_payout',           label: 'Payout received',        desc: 'When one of your payouts is marked paid.',   role: 'user'  },
  { key: 'user_lead_reminder',    label: 'Lead reminders',         desc: 'Reminders you scheduled for your leads.',   role: 'user'  },
  { key: 'user_whats_new',        label: "What's new posts",        desc: 'When an admin publishes a new release note.', role: 'user'  },
  { key: 'user_broadcast',        label: 'Broadcast announcements', desc: 'Platform-wide announcements sent by admins.', role: 'user'  },
  { key: 'user_chat',             label: 'General chat messages',   desc: 'When someone posts in the platform-wide general chat.', role: 'user' },
  { key: 'user_challenge_new',    label: 'New challenge pushed',    desc: 'When HQ publishes a new challenge for the team.',       role: 'user' },
  { key: 'user_challenge_completed', label: 'Challenge completed',  desc: 'When you complete a challenge (points & bonus recap).', role: 'user' },
]

export type NotificationTone = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationPreference {
  user_id: string
  key: NotificationKey
  enabled: boolean
}

export interface NotificationTemplate {
  key: NotificationKey
  enabled: boolean
  title_template: string
  body_template: string
  tone: NotificationTone
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth_key: string
  /** Full PushSubscription.toJSON() object — preferred format used
   *  by the `web-push` library.  Falls back to building from endpoint
   *  + p256dh + auth_key when null (legacy rows). */
  subscription: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime: number | null } | null
  created_at: string
}

/** Scheduled lead reminder — fires a push notification at remind_at. */
export interface LeadReminder {
  id: string
  user_id: string
  company_id: string
  remind_at: string
  title: string
  body: string
  sent: boolean
  created_at: string
}

/** Admin-only knowledge base entry.  Body is markdown source; the UI
 *  renders it with react-markdown so pasted code blocks render
 *  correctly.  Categories are user-defined free-form strings (the UI
 *  collects distinct values for the dropdown). */
export interface AdminDoc {
  id: string
  created_at: string
  updated_at: string
  title: string
  body: string
  /** Long-form markdown where the admin describes HOW a given update
   *  was built — the "Structure View" rendered in the read modal. */
  structure: string
  category: string
  tags: string[]
  created_by: string | null
}

/** Code snippet attached to an Admin Doc entry.  One doc → many
 *  snippets.  `language` is a free-form hint for syntax styling. */
export interface AdminDocSnippet {
  id: string
  doc_id: string
  title: string
  language: string
  code: string
  created_at: string
}
export interface PushLogEntry {
  id: string
  created_at: string
  recipient_id: string | null
  key: string
  status: 'sent' | 'skipped' | 'error' | 'unauthorized' | string
  detail: string
  sent_count: number
}

/** Generic platform error log (see schema38.sql).  Any code path can
 *  write to it via the service role; the LogBook view shows all rows. */
export interface ErrorLogEntry {
  id: string
  created_at: string
  source: string
  severity: 'info' | 'warn' | 'error' | string
  message: string
  detail: string
  actor_id: string | null
  metadata: Record<string, unknown>
}

/** Release-note entries visible to all users in the sidebar; managed
 *  by admins in Settings → ChangeLog. */
export type ChangelogLabel = 'NEW' | 'IMPROVEMENT' | 'FIX' | 'TODO' | 'ANNOUNCEMENT'

export const CHANGELOG_LABEL_META: Record<ChangelogLabel, { label: string; tone: 'pos' | 'info' | 'warn' | 'neutral' | 'neg'; color: string }> = {
  NEW:          { label: 'New',          tone: 'pos',    color: '#16A34A' },
  IMPROVEMENT:  { label: 'Improvement',  tone: 'info',   color: '#2563EB' },
  FIX:          { label: 'Fix',          tone: 'warn',   color: '#D97706' },
  TODO:         { label: 'To be done',   tone: 'neutral', color: '#737373' },
  ANNOUNCEMENT: { label: 'Announcement', tone: 'neg',    color: '#9333EA' },
}

export const CHANGELOG_LABELS: ChangelogLabel[] = ['NEW', 'IMPROVEMENT', 'FIX', 'TODO', 'ANNOUNCEMENT']

export interface ChangelogEntry {
  id: string
  created_at: string
  label: ChangelogLabel
  version: string
  title: string
  body: string
  published: boolean
  created_by: string | null
}

// =====================================================================
// INVOICES
// =====================================================================

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }> = {
  draft: { label: 'Draft',   tone: 'neutral' },
  sent:  { label: 'Sent',    tone: 'info'    },
  paid:  { label: 'Paid',    tone: 'pos'     },
  void:  { label: 'Void',    tone: 'neg'     },
}

export const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_META) as InvoiceStatus[]

export interface InvoiceService {
  id: string
  invoice_id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  position: number
  created_at: string
}

export interface Invoice {
  id: string
  number: string
  billed_to: string
  billed_address: string
  billed_email: string
  billed_vat: string
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  vat_included: boolean
  vat_pct: number
  currency: string
  notes: string
  /** Reference to a contract number (human-readable link, e.g.
   *  "CC-CTR-2026-A7F3B2") — set from the invoice editor. */
  contract_ref: string
  finance_entry_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Default service catalog the admin can pick from when adding a line
 *  to an invoice.  They can also type a free-form name to add a new
 *  one on the fly. */
export const INVOICE_SERVICE_CATALOG = [
  'Web design',
  'Web development',
  'UI/UX design',
  'Branding & identity',
  'SEO consultation',
  'Marketing strategy',
  'Copywriting',
  'Photography',
  'Social media management',
  'Consultation',
  'Retainer',
  'Project management',
  'Hosting & maintenance',
  'Other',
]

/** Issuer identity + default templates that prefill every new invoice.
 *  Stored in a single-row `invoice_settings` table (admin-only write,
 *  public read so the verify route can show the issuer name). */
export interface InvoiceSettings {
  id: number
  company_name: string
  company_subname: string
  company_address: string
  company_email: string
  company_phone: string
  company_website: string
  company_vat: string
  company_id: string
  default_bank: { bank: string; iban: string; bic: string; account: string } | null
  default_legal_notes: string
  default_signature_name: string
  default_payment_terms: string
  qr_verify_base_url: string
  updated_at: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  id: 1,
  company_name: 'Calista Concept',
  company_subname: 'Legendary Design Ltd.',
  company_address: '',
  company_email: 'ops@calistaconcept.eu',
  company_phone: '',
  company_website: '',
  company_vat: '',
  company_id: '',
  default_bank: null,
  default_legal_notes: '',
  default_signature_name: '',
  default_payment_terms: '',
  qr_verify_base_url: 'https://calistaconcept.eu/invoice/verify',
  updated_at: '',
}

/** Platform-wide visual / branding settings — separate from invoice
 *  settings so the admin's logo identity is owned at the platform
 *  level, not tangled with invoice templates. */
export interface DesignSettings {
  id: number
  logo_url_light: string
  logo_url_dark: string
  updated_at: string
}

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  id: 1,
  logo_url_light: '',
  logo_url_dark: '',
  updated_at: '',
}

// =====================================================================
// CONTRACTS
// =====================================================================

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated' | 'void'

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; tone: 'neutral' | 'info' | 'warn' | 'pos' | 'neg' }> = {
  draft:      { label: 'Draft',      tone: 'neutral' },
  active:     { label: 'Active',     tone: 'pos'    },
  expired:    { label: 'Expired',    tone: 'warn'   },
  terminated: { label: 'Terminated', tone: 'neg'    },
  void:       { label: 'Void',       tone: 'neg'    },
}

export const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_META) as ContractStatus[]

export interface ContractTemplate {
  id: string
  name: string
  description: string
  body: string
  custom_placeholders: CustomPlaceholderDef[]
  created_at: string
  updated_at: string
  created_by: string | null
}

/** A language variant of a contract template — same concept but a
 *  different language's body + custom placeholders. */
export interface ContractTemplateVariant {
  id: string
  template_id: string
  language: string           // 'en', 'it', 'fr', 'bg', …
  language_label: string     // 'English', 'Italiano', …
  body: string
  custom_placeholders: CustomPlaceholderDef[]
  created_at: string
  updated_at: string
}

/** Definition of a custom placeholder on a contract template. */
export interface CustomPlaceholderDef {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'textarea'
}

export interface Contract {
  id: string
  number: string
  template_id: string | null
  status: ContractStatus
  counterparty_name: string
  counterparty_company: string
  counterparty_address: string
  counterparty_phone: string
  counterparty_email: string
  counterparty_vat: string
  issue_date: string
  start_date: string | null
  end_date: string | null
  notes: string
  finance_entry_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Placeholders that can be used inside a contract template body.
 *  They're filled in from the contract's counterparty data + the
 *  issuer settings when the PDF is rendered. */
export const CONTRACT_PLACEHOLDERS = [
  '{contract_number}',
  '{issue_date}',
  '{start_date}',
  '{end_date}',
  '{counterparty_name}',
  '{counterparty_company}',
  '{counterparty_address}',
  '{counterparty_phone}',
  '{counterparty_email}',
  '{counterparty_vat}',
  '{company_name}',
  '{company_subname}',
  '{company_address}',
  '{company_email}',
  '{company_phone}',
  '{company_website}',
  '{company_vat}',
  '{company_id}',
  '{current_date}',
]
