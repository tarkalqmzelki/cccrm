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
