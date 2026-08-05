import { supabase } from './supabase'
import { uuid } from './uuid'
import type {
  Profile, Referral, Lead, Deal, Payout, Settings,
  Company, Contact, Opportunity, Activity, Task, CompanyNote, OpportunityNote, ServiceItem,
} from './types'
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
      opportunity_id: d.opportunity_id || null,
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
      if (['lead_id','opportunity_id','company','contact_name','email','phone','website','meeting_place','gross_value','collected_amount','commission_pct','custom_commission_pct','status','notes','closed_at'].includes(k)) {
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

  /* ================================================================== */
  /* COMPANIES                                                           */
  /* ================================================================== */
  async listCompanies(): Promise<Company[]> {
    const { data, error } = await supabase!
      .from('companies').select('*').order('name', { ascending: true })
    if (error) throw error
    return data as Company[]
  },

  async getCompany(id: string): Promise<Company | null> {
    const { data, error } = await supabase!
      .from('companies').select('*').eq('id', id).single()
    if (error) return null
    return data as Company
  },

  async searchCompanies(query: string): Promise<Company[]> {
    const q = query.toLowerCase().trim()
    if (!q) return []
    const { data, error } = await supabase!
      .from('companies').select('*')
      .or(`name.ilike.%${q}%,domain.ilike.%${q}%,website.ilike.%${q}%,vat_number.ilike.%${q}%`)
      .limit(10)
    if (error) return []
    return data as Company[]
  },

  async createCompany(c: Partial<Company>): Promise<Company> {
    const row = {
      id: uuid(),
      name: c.name || '',
      website: c.website || '',
      domain: c.domain || (c.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
      vat_number: c.vat_number || '',
      industry: c.industry || '',
      description: c.description || '',
      address: c.address || '',
      logo_url: c.logo_url || '',
    }
    const { data, error } = await supabase!.from('companies').insert(row).select().single()
    if (error) throw error
    return data as Company
  },

  async updateCompany(id: string, patch: Partial<Company>): Promise<Company> {
    const { data, error } = await supabase!
      .from('companies').update({ ...patch, updated_at: iso() }).eq('id', id).select().single()
    if (error) throw error
    return data as Company
  },

  /* ---------- CONTACTS ---------- */
  async listContacts(companyId: string): Promise<Contact[]> {
    const { data, error } = await supabase!
      .from('contacts').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error) throw error
    return data as Contact[]
  },

  async createContact(c: Partial<Contact>): Promise<Contact> {
    const { data, error } = await supabase!
      .from('contacts').insert({ ...c, id: uuid(), created_by: c.created_by || null }).select().single()
    if (error) throw error
    return data as Contact
  },

  async updateContact(id: string, patch: Partial<Contact>): Promise<Contact> {
    const { data, error } = await supabase!
      .from('contacts').update({ ...patch, updated_at: iso() }).eq('id', id).select().single()
    if (error) throw error
    return data as Contact
  },

  async deleteContact(id: string): Promise<void> {
    const { error } = await supabase!.from('contacts').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- SERVICE CATALOG ---------- */
  async listServices(): Promise<ServiceItem[]> {
    const { data, error } = await supabase!
      .from('service_catalog').select('*').order('name')
    if (error) throw error
    return data as ServiceItem[]
  },

  async createService(name: string, slug: string): Promise<ServiceItem> {
    const { data, error } = await supabase!
      .from('service_catalog').insert({ name, slug, is_custom: true }).select().single()
    if (error) throw error
    return data as ServiceItem
  },

  /* ---------- OPPORTUNITIES ---------- */
  async listOpportunities(): Promise<Opportunity[]> {
    const { data, error } = await supabase!
      .from('opportunities').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Opportunity[]
  },

  async listOpportunitiesByCompany(companyId: string): Promise<Opportunity[]> {
    const { data, error } = await supabase!
      .from('opportunities').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error) throw error
    return data as Opportunity[]
  },

  async getOpportunity(id: string): Promise<Opportunity | null> {
    const { data, error } = await supabase!
      .from('opportunities').select('*').eq('id', id).single()
    if (error) return null
    return data as Opportunity
  },

  async createOpp(o: Partial<Opportunity>): Promise<Opportunity> {
    const row = {
      id: uuid(),
      company_id: o.company_id,
      service_id: o.service_id,
      owner_id: o.owner_id,
      title: o.title || '',
      status: o.status || 'new',
      priority: o.priority || 'medium',
      est_revenue: o.est_revenue || 0,
      next_follow_up: o.next_follow_up || null,
      notes: o.notes || '',
    }
    const { data, error } = await supabase!.from('opportunities').insert(row).select().single()
    if (error) throw error
    return data as Opportunity
  },

  async updateOpp(id: string, patch: Partial<Opportunity>): Promise<Opportunity> {
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (['title','status','priority','est_revenue','next_follow_up','notes','converted_deal_id'].includes(k)) {
        payload[k] = v
      }
    }
    payload.updated_at = iso()
    const { data, error } = await supabase!
      .from('opportunities').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data as Opportunity
  },

  async deleteOpp(id: string): Promise<void> {
    const { error } = await supabase!.from('opportunities').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- OPPORTUNITY CONTACTS ---------- */
  async listOppContacts(oppId: string): Promise<Contact[]> {
    const { data, error } = await supabase!
      .from('opportunity_contacts').select('contact_id').eq('opportunity_id', oppId)
    if (error) return []
    const ids = (data as any[]).map((r) => r.contact_id)
    if (ids.length === 0) return []
    const { data: contacts, error: e2 } = await supabase!
      .from('contacts').select('*').in('id', ids)
    if (e2) return []
    return contacts as Contact[]
  },

  async linkOppContact(oppId: string, contactId: string): Promise<void> {
    const { error } = await supabase!
      .from('opportunity_contacts').insert({ opportunity_id: oppId, contact_id: contactId })
    if (error && !error.message.includes('duplicate')) throw error
  },

  async unlinkOppContact(oppId: string, contactId: string): Promise<void> {
    const { error } = await supabase!
      .from('opportunity_contacts').delete()
      .eq('opportunity_id', oppId).eq('contact_id', contactId)
    if (error) throw error
  },

  /* ---------- ACTIVITIES ---------- */
  async listActivities(oppId: string): Promise<Activity[]> {
    const { data, error } = await supabase!
      .from('activities').select('*').eq('opportunity_id', oppId).order('created_at', { ascending: false })
    if (error) throw error
    return data as Activity[]
  },

  async listCompanyActivities(companyId: string): Promise<Activity[]> {
    const { data, error } = await supabase!
      .from('activities').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error) throw error
    return data as Activity[]
  },

  async createActivity(a: Partial<Activity>): Promise<Activity> {
    const { data, error } = await supabase!
      .from('activities').insert({ ...a, id: uuid() }).select().single()
    if (error) throw error
    return data as Activity
  },

  /* ---------- TASKS ---------- */
  async listTasks(oppId: string): Promise<Task[]> {
    const { data, error } = await supabase!
      .from('tasks').select('*').eq('opportunity_id', oppId).order('created_at', { ascending: false })
    if (error) throw error
    return data as Task[]
  },

  async createTask(t: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase!
      .from('tasks').insert({ ...t, id: uuid() }).select().single()
    if (error) throw error
    return data as Task
  },

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase!
      .from('tasks').update({ ...patch, updated_at: iso() }).eq('id', id).select().single()
    if (error) throw error
    return data as Task
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase!.from('tasks').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- COMPANY NOTES ---------- */
  async listCompanyNotes(companyId: string): Promise<CompanyNote[]> {
    const { data, error } = await supabase!
      .from('company_notes').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error) throw error
    return data as CompanyNote[]
  },

  async createCompanyNote(companyId: string, authorId: string, body: string): Promise<CompanyNote> {
    const { data, error } = await supabase!
      .from('company_notes').insert({ id: uuid(), company_id: companyId, author_id: authorId, body }).select().single()
    if (error) throw error
    return data as CompanyNote
  },

  async deleteCompanyNote(id: string): Promise<void> {
    const { error } = await supabase!.from('company_notes').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- OPPORTUNITY NOTES ---------- */
  async listOppNotes(oppId: string): Promise<OpportunityNote[]> {
    const { data, error } = await supabase!
      .from('opportunity_notes').select('*').eq('opportunity_id', oppId).order('created_at', { ascending: false })
    if (error) throw error
    return data as OpportunityNote[]
  },

  async createOppNote(oppId: string, authorId: string, body: string): Promise<OpportunityNote> {
    const { data, error } = await supabase!
      .from('opportunity_notes').insert({ id: uuid(), opportunity_id: oppId, author_id: authorId, body }).select().single()
    if (error) throw error
    return data as OpportunityNote
  },

  async deleteOppNote(id: string): Promise<void> {
    const { error } = await supabase!.from('opportunity_notes').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- CONVERT OPPORTUNITY TO DEAL ---------- */
  async convertOppToDeal(oppId: string, sellerId: string, grossValue: number, commissionPct: number): Promise<Deal> {
    const opp = await db.getOpportunity(oppId)
    if (!opp) throw new Error('Opportunity not found')
    const company = await db.getCompany(opp.company_id)
    const contacts = await db.listOppContacts(oppId)
    // If no opp-specific contacts, fall back to company contacts
    const allContacts = contacts.length > 0 ? contacts : await db.listContacts(opp.company_id)
    const contact = allContacts[0]

    // Combine all phone numbers and emails from contacts
    const phones = allContacts.map((c) => c.phone).filter(Boolean)
    const emails = allContacts.map((c) => c.email).filter(Boolean)

    const deal = await db.createDeal({
      id: uuid(),
      seller_id: sellerId,
      lead_id: null,
      opportunity_id: oppId,
      company: company?.name || '',
      contact_name: contact?.full_name || '',
      email: emails.join(', ') || '',
      phone: phones.join(', ') || '',
      website: company?.website || '',
      meeting_place: '',
      gross_value: grossValue,
      collected_amount: 0,
      commission_pct: commissionPct,
      custom_commission_pct: null,
      status: 'pending_review',
      notes: opp.notes || '',
      closed_at: null,
      created_at: iso(),
      updated_at: iso(),
    } as Deal)

    await db.updateOpp(oppId, { converted_deal_id: deal.id, status: 'won' as never })
    return deal
  },
}
