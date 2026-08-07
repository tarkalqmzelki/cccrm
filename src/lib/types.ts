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
  created_at: string
  updated_at: string
}

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
export type InboxType = 'access_request' | 'access_approved' | 'access_rejected' | 'note_reply' | 'note_vote' | 'admin_grant' | 'system'

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
}

export interface NoteComment {
  id: string
  parent_id: string
  author_id: string | null
  body: string
  created_at: string
}

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
