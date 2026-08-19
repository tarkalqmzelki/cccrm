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
