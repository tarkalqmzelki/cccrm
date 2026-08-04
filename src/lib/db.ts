import { supabase } from './supabase'
import { uuid } from './uuid'
import type { Profile, Referral, Lead, Deal, Payout, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

const iso = () => new Date().toISOString()

/* ------------------------------------------------------------------ */
/* Public API  — Supabase only (no demo/mock fallback)                */
/* ------------------------------------------------------------------ */
export const db = {
  /* ---------- PROFILES ---------- */
  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await supabase!
      .from('profiles').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Profile[]
  },

  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await supabase!
      .from('profiles').select('*').eq('id', id).single()
    if (error) return null
    return data as Profile
  },

  async createProfile(p: Profile): Promise<Profile> {
    const { data, error } = await supabase!
      .from('profiles').insert({
        id: p.id, email: p.email, full_name: p.full_name,
        role: p.role, level: p.level, active: p.active,
        avatar_color: p.avatar_color, avatar_url: p.avatar_url,
        phone: p.phone, address: p.address,
        custom_commission_pct: p.custom_commission_pct,
      }).select().single()
    if (error) throw error
    return data as Profile
  },

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
    const payload: Record<string, unknown> = { ...patch, updated_at: iso() }
    delete payload.id
    delete payload.created_at
    const { data, error } = await supabase!
      .from('profiles').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as Profile
  },

  async deleteProfile(id: string): Promise<void> {
    const { error } = await supabase!.from('profiles').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- CREATE USER (auth + profile) ---------- */
  async createUser(opts: {
    email: string
    password: string
    full_name: string
    role: 'seller' | 'headhunter'
    level: 'L1' | 'L2' | 'L3'
    phone?: string
  }): Promise<void> {
    const { error } = await supabase!.rpc('create_user', {
      p_email: opts.email,
      p_password: opts.password,
      p_full_name: opts.full_name,
      p_role: opts.role,
      p_level: opts.level,
      p_phone: opts.phone || '',
    })
    if (error) throw error
  },

  /* ---------- CHANGE PASSWORD (admin resets any user) ---------- */
  async adminSetPassword(userId: string, password: string): Promise<void> {
    const { error } = await supabase!.rpc('update_user_password', {
      p_user_id: userId,
      p_password: password,
    })
    if (error) throw error
  },

  /* ---------- REFERRALS ---------- */
  async listReferrals(): Promise<Referral[]> {
    const { data, error } = await supabase!.from('referrals').select('*')
    if (error) throw error
    return data as Referral[]
  },

  async createReferral(r: Omit<Referral, 'id' | 'created_at'>): Promise<Referral> {
    const { data, error } = await supabase!
      .from('referrals').insert({ ...r, id: uuid() }).select().single()
    if (error) throw error
    return data as Referral
  },

  async deleteReferral(id: string): Promise<void> {
    const { error } = await supabase!.from('referrals').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- LEADS ---------- */
  async listLeads(): Promise<Lead[]> {
    const { data, error } = await supabase!
      .from('leads').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Lead[]
  },

  async createLead(l: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead> {
    const { data, error } = await supabase!
      .from('leads').insert({ ...l, id: uuid() }).select().single()
    if (error) throw error
    return data as Lead
  },

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const { data, error } = await supabase!
      .from('leads').update({ ...patch, updated_at: iso() }).eq('id', id).select().single()
    if (error) throw error
    return data as Lead
  },

  async deleteLead(id: string): Promise<void> {
    const { error } = await supabase!.from('leads').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- DEALS ---------- */
  async listDeals(): Promise<Deal[]> {
    const { data, error } = await supabase!
      .from('deals').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Deal[]
  },

  async createDeal(d: Deal): Promise<Deal> {
    // Send only the columns the deals table expects — let the DB
    // generate id/created_at/updated_at via defaults.
    const row = {
      seller_id: d.seller_id,
      lead_id: d.lead_id || null,
      company: d.company,
      contact_name: d.contact_name,
      email: d.email,
      phone: d.phone,
      website: d.website,
      meeting_place: d.meeting_place,
      gross_value: d.gross_value,
      collected_amount: d.collected_amount || 0,
      commission_pct: d.commission_pct,
      custom_commission_pct: d.custom_commission_pct ?? null,
      status: d.status || 'pending_review',
      notes: d.notes,
      closed_at: d.status === 'closed' ? iso() : null,
    }
    const { data, error } = await supabase!.from('deals').insert(row).select().single()
    if (error) throw error
    return data as Deal
  },

  async updateDeal(id: string, patch: Partial<Deal>): Promise<Deal> {
    // Only send fields that are explicitly in the patch + updated_at
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (['lead_id','company','contact_name','email','phone','website','meeting_place','gross_value','collected_amount','commission_pct','custom_commission_pct','status','notes','closed_at'].includes(k)) {
        payload[k] = v
      }
    }
    payload.updated_at = iso()
    if (patch.status === 'closed' && !patch.closed_at) payload.closed_at = iso()
    const { data, error } = await supabase!
      .from('deals').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as Deal
  },

  async deleteDeal(id: string): Promise<void> {
    const { error } = await supabase!.from('deals').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- PAYOUTS ---------- */
  async listPayouts(): Promise<Payout[]> {
    const { data, error } = await supabase!
      .from('payouts').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Payout[]
  },

  async updatePayout(id: string, patch: Partial<Payout>): Promise<Payout> {
    const p: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (['amount','paid_amount','status','period','paid_at'].includes(k)) {
        p[k] = v
      }
    }
    if (patch.status === 'paid') p.paid_at = iso()
    const { data, error } = await supabase!
      .from('payouts').update(p).eq('id', id).select().single()
    if (error) throw error
    return data as Payout
  },

  /* Mark a payout as fully paid to the seller */
  async markPayoutPaid(id: string): Promise<Payout> {
    const { data, error } = await supabase!
      .from('payouts')
      .update({ status: 'paid' as never, paid_at: iso() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Payout
  },

  /* Record a partial payment to the seller */
  async recordPayoutPayment(id: string, amount: number): Promise<Payout> {
    // First fetch current payout
    const { data: current, error: ferr } = await supabase!
      .from('payouts').select('*').eq('id', id).single()
    if (ferr) throw ferr
    const payout = current as Payout
    const newPaid = Math.min((payout.paid_amount || 0) + amount, payout.amount)
    const fullyPaid = newPaid >= payout.amount
    const { data, error } = await supabase!
      .from('payouts')
      .update({
        paid_amount: newPaid,
        status: fullyPaid ? ('paid' as never) : payout.status,
        paid_at: fullyPaid ? iso() : payout.paid_at,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Payout
  },

  /* ---------- SETTINGS ---------- */
  async getSettings(): Promise<Settings> {
    const { data, error } = await supabase!
      .from('settings').select('*').eq('id', 1).single()
    if (error) return { ...DEFAULT_SETTINGS }
    return data as Settings
  },

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const { data, error } = await supabase!
      .from('settings').update({ ...patch, updated_at: iso() }).eq('id', 1).select().single()
    if (error) throw error
    return data as Settings
  },
}
