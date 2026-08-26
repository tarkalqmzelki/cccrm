import { supabase } from './supabase'
import { uuid } from './uuid'
import type {
  Profile, Referral, Lead, Deal, Payout, Settings,
  Company, Contact, Opportunity, Activity, Task, CompanyNote, OpportunityNote, ServiceItem,
  AccessRequest, InboxMessage, NoteComment, NoteVote, CompanyFollowUp, ChatMessage, SystemStatus, SystemStatusValue,
  FinanceEntry, FinanceCategory, FinanceKind,
  ScheduledActivity, ScheduledActivityType, ScheduledActivityStatus, ActivityComment,
  MessagePriority, MessageFolder,
  NotificationKey, NotificationPreference, NotificationTemplate, NotificationTone, PushSubscription, PushLogEntry, ErrorLogEntry, ChangelogEntry, ChangelogLabel, LeadReminder, LeadStatus, AdminDoc, AdminDocSnippet,
  Invoice, InvoiceService, InvoiceStatus, InvoiceSettings,
  Contract, ContractTemplate, ContractStatus, CustomPlaceholderDef,
  ContractTemplateVariant, DesignSettings,
  Challenge, ChallengeProgress, ChallengeType, FunctionalChallengeType,
  MarketLead,
  BankCard, BankTransaction, BankTxKind,
} from './types'
import { DEFAULT_INVOICE_SETTINGS, DEFAULT_SETTINGS, DEFAULT_DESIGN_SETTINGS } from './types'
import type { LanguageTranslations } from './translations'
import type { PlatformLocale } from './platformLocales'

const iso = () => new Date().toISOString()

/* ------------------------------------------------------------------ */
/* Public API  — Supabase only (no demo/mock fallback)                */
/* ------------------------------------------------------------------ */
export const db = {
  /* ---------- CHALLENGES (schema59) ---------- */
  async listChallenges(): Promise<Challenge[]> {
    const { data, error } = await supabase!
      .from('challenges').select('*')
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as Challenge[]
  },

  async createChallenge(c: {
    title: string
    description?: string
    type: ChallengeType
    functional_type?: FunctionalChallengeType
    target_count?: number
    points?: number
    financial_bonus?: number
    scope?: 'solo' | 'team'
    created_by?: string | null
  }): Promise<void> {
    const { error } = await supabase!.from('challenges').insert({
      title: c.title,
      description: c.description || '',
      type: c.type,
      functional_type: c.functional_type || 'lead_created',
      target_count: c.target_count ?? 1,
      points: c.points ?? 0,
      financial_bonus: c.financial_bonus ?? 0,
      status: 'active',
      scope: c.scope || 'solo',
      created_by: c.created_by ?? null,
    })
    if (error) throw error
  },

  async updateChallenge(id: string, patch: Partial<Challenge>): Promise<void> {
    const allowed = ['title', 'description', 'type', 'functional_type', 'target_count', 'points', 'financial_bonus', 'status', 'scope']
    const payload: Record<string, unknown> = { updated_at: iso() }
    for (const k of allowed) if (k in patch) payload[k] = (patch as Record<string, unknown>)[k]
    const { error } = await supabase!.from('challenges').update(payload).eq('id', id)
    if (error) throw error
  },

  async deleteChallenge(id: string): Promise<void> {
    const { error } = await supabase!.from('challenges').delete().eq('id', id)
    if (error) throw error
  },

  async listChallengeProgress(userId?: string): Promise<ChallengeProgress[]> {
    let q = supabase!.from('challenge_progress').select('*')
    if (userId) q = q.eq('user_id', userId)
    const { data, error } = await q
    if (error) return []
    return (data || []) as ChallengeProgress[]
  },

  /** Self-reported progress bump for regular challenges. Creates the row
   *  on first increment and stamps completed_at at the target. */
  async bumpChallengeProgress(challengeId: string, userId: string, target: number): Promise<ChallengeProgress> {
    const existing = await db.listChallengeProgress(userId)
    const row = existing.find((r) => r.challenge_id === challengeId)
    const nextProgress = Math.min((row?.progress ?? 0) + 1, target)
    if (row) {
      const completedAt = nextProgress >= target ? (row.completed_at ?? iso()) : row.completed_at
      const { data, error } = await supabase!.from('challenge_progress')
        .update({ progress: nextProgress, completed_at: completedAt, updated_at: iso() })
        .eq('id', row.id).select().single()
      if (error) throw error
      return data as ChallengeProgress
    }
    const { data, error } = await supabase!.from('challenge_progress')
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        progress: nextProgress,
        completed_at: nextProgress >= target ? iso() : null,
      }).select().single()
    if (error) throw error
    return data as ChallengeProgress
  },

  /** Admin/service marks the completion bonus as credited to payouts. */
  async markChallengeBonusPaid(challengeId: string, userId: string): Promise<void> {
    const existing = await db.listChallengeProgress(userId)
    const row = existing.find((r) => r.challenge_id === challengeId)
    if (!row) return
    const { error } = await supabase!.from('challenge_progress')
      .update({ bonus_paid: true, updated_at: iso() }).eq('id', row.id)
    if (error) throw error
  },

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

  /* Challenge completion bonus → pending 'bonus' payout (schema59) */
  async createChallengeBonusPayout(sellerId: string, amount: number): Promise<void> {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { error } = await supabase!.from('payouts').insert({
      seller_id: sellerId,
      deal_id: null,
      amount,
      paid_amount: 0,
      status: 'pending',
      period,
      payout_type: 'bonus',
    })
    if (error) throw error
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
      summary: c.summary || '',
      phone: c.phone || '',
      country: c.country || '',
      city: c.city || '',
      services_offered: c.services_offered || '',
      created_by: c.created_by || null,
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

  async deleteCompany(id: string): Promise<void> {
    const { error } = await supabase!.from('companies').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- LEAD STATUS (on companies table) ---------- */
  async updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
    const { error } = await supabase!
      .from('companies')
      .update({ lead_status: status, lead_status_updated_at: iso(), updated_at: iso() })
      .eq('id', id)
    if (error) throw error
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
      est_revenue: o.offer_value || o.est_revenue || 0,
      offer_value: o.offer_value || 0,
      offer_description: o.offer_description || '',
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
  async convertOppToDeal(oppId: string, sellerId: string, grossValue: number): Promise<Deal> {
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
      commission_pct: 0,
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

  /* ================================================================== */
  /* ACCESS REQUESTS                                                     */
  /* ================================================================== */
  async listAccessRequests(userId: string): Promise<AccessRequest[]> {
    const { data, error } = await supabase!
      .from('access_requests').select('*')
      .or(`requester_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: false })
    if (error) {
      // If there are stale rows with invalid enum values, the SELECT fails.
      // Return empty array instead of crashing the page.
      console.warn('listAccessRequests error:', error.message)
      return []
    }
    return (data || []) as AccessRequest[]
  },

  async createAccessRequest(r: Partial<AccessRequest>): Promise<void> {
    const row = {
      id: uuid(),
      requester_id: r.requester_id,
      owner_id: r.owner_id,
      opportunity_id: r.opportunity_id || null,
      company_id: r.company_id || null,
      status: (r.status || 'pending') as 'pending' | 'approved' | 'rejected',
      message: r.message || '',
    }
    // Don't use .select() — avoids PostgREST enum deserialization errors
    const { error } = await supabase!
      .from('access_requests').insert(row)
    if (error) throw error
  },

  async updateAccessRequest(id: string, patch: Partial<AccessRequest>): Promise<void> {
    const payload: Record<string, unknown> = {}
    if (patch.status) payload.status = patch.status as 'pending' | 'approved' | 'rejected'
    if (patch.message !== undefined) payload.message = patch.message
    payload.responded_at = new Date().toISOString()
    // Don't use .select() — avoids PostgREST enum deserialization errors
    // if there are stale rows with invalid status values in the table
    const { error } = await supabase!
      .from('access_requests').update(payload).eq('id', id)
    if (error) throw error
  },

  async checkAccess(requesterId: string, ownerId: string, opportunityId?: string, companyId?: string): Promise<boolean> {
    let q = supabase!.from('access_requests').select('id').eq('requester_id', requesterId).eq('owner_id', ownerId).eq('status', 'approved')
    if (opportunityId) q = q.eq('opportunity_id', opportunityId)
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q.limit(1)
    if (error) return false
    return (data && data.length > 0)
  },

  /* ---------- INBOX ---------- */
  async listInbox(userId: string): Promise<InboxMessage[]> {
    const { data, error } = await supabase!
      .from('inbox_messages').select('*').eq('recipient_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as InboxMessage[]
  },

  async unreadInboxCount(userId: string): Promise<number> {
    const { count, error } = await supabase!
      .from('inbox_messages').select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId).eq('read', false)
    if (error) return 0
    return count || 0
  },

  async markInboxRead(id: string): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').update({ read: true }).eq('id', id)
    if (error) throw error
  },

  async markAllInboxRead(userId: string): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').update({ read: true }).eq('recipient_id', userId).eq('read', false)
    if (error) throw error
  },

  async sendInboxMessage(recipientId: string, senderId: string | null, type: string, title: string, body: string, actionUrl = '', metadata: Record<string, unknown> = {}): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').insert({
      id: uuid(), recipient_id: recipientId, sender_id: senderId,
      type: type as never, title, body, read: false, action_url: actionUrl, metadata,
    })
    if (error) throw error
  },

  /* ---------- DIRECT MESSAGES (email-like, member -> member) ---------- */
  async sendDirectMessage(opts: {
    recipientId: string
    senderId: string
    title: string
    body: string
    priority?: MessagePriority
    category?: string
    parentId?: string | null
    threadId?: string | null
  }): Promise<string> {
    const id = uuid()
    const { error } = await supabase!.from('inbox_messages').insert({
      id,
      recipient_id: opts.recipientId,
      sender_id: opts.senderId,
      type: 'direct_message' as never,
      title: opts.title || '',
      body: opts.body || '',
      read: false,
      action_url: '/inbox',
      metadata: { kind: 'direct_message' },
      priority: opts.priority || 'normal',
      category: opts.category || '',
      is_starred: false,
      folder: 'inbox',
      thread_id: opts.threadId ?? null,
      parent_id: opts.parentId ?? null,
    })
    if (error) throw error
    return id
  },

  /* Bulk send the same direct message to many recipients at once.
   * Used by admins for mass-messaging members. Returns the count of
   * messages actually inserted (each recipient gets its own row, so
   * the existing push trigger fires per-recipient and each user's
   * per-type preference is honoured individually). */
  async sendDirectMessageBulk(opts: {
    recipientIds: string[]
    senderId: string
    title: string
    body: string
    priority?: MessagePriority
    category?: string
  }): Promise<{ sent: number }> {
    if (opts.recipientIds.length === 0) return { sent: 0 }
    const rows = opts.recipientIds.map((rid) => ({
      id: uuid(),
      recipient_id: rid,
      sender_id: opts.senderId,
      type: 'direct_message' as never,
      title: opts.title || '',
      body: opts.body || '',
      read: false,
      action_url: '/inbox',
      metadata: { kind: 'direct_message', bulk: true } as Record<string, unknown>,
      priority: opts.priority || 'normal',
      category: opts.category || '',
      is_starred: false,
      folder: 'inbox',
      thread_id: null as string | null,
      parent_id: null as string | null,
    }))
    const { error } = await supabase!.from('inbox_messages').insert(rows as never)
    if (error) throw error
    return { sent: rows.length }
  },

  /* List messages I sent to other members (Sent view) */
  async listInboxSent(senderId: string): Promise<InboxMessage[]> {
    const { data, error } = await supabase!
      .from('inbox_messages').select('*')
      .eq('sender_id', senderId)
      .eq('type', 'direct_message')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as InboxMessage[]
  },

  /* Patch recipient-side fields on an inbox message:
     priority_override, category_override, is_starred, folder, read */
  async updateInboxMessage(id: string, patch: Partial<{
    read: boolean
    is_starred: boolean
    folder: MessageFolder
    priority_override: MessagePriority | null
    category_override: string | null
  }>): Promise<void> {
    const payload: Record<string, unknown> = {}
    if (patch.read !== undefined) payload.read = patch.read
    if (patch.is_starred !== undefined) payload.is_starred = patch.is_starred
    if (patch.folder !== undefined) payload.folder = patch.folder
    if (patch.priority_override !== undefined) payload.priority_override = patch.priority_override
    if (patch.category_override !== undefined) payload.category_override = patch.category_override
    const { error } = await supabase!.from('inbox_messages').update(payload).eq('id', id)
    if (error) throw error
  },

  /* Permanently delete a message (only used for trash / direct messages) */
  async deleteInboxMessage(id: string): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- GENERAL CHAT (platform-wide channel) ---------- */
  async listChatMessages(limit = 200): Promise<ChatMessage[]> {
    const { data, error } = await supabase!
      .from('chat_messages').select('*')
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data || []) as ChatMessage[]
  },

  async sendChatMessage(senderId: string, body: string): Promise<ChatMessage> {
    const { data, error } = await supabase!
      .from('chat_messages').insert({ id: uuid(), sender_id: senderId, body })
      .select().single()
    if (error) throw error
    return data as ChatMessage
  },

  async deleteChatMessage(id: string): Promise<void> {
    const { error } = await supabase!.from('chat_messages').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- NOTE COMMENTS ---------- */
  async listNoteComments(noteId: string): Promise<NoteComment[]> {
    const { data, error } = await supabase!
      .from('note_comments').select('*').eq('parent_id', noteId).order('created_at', { ascending: true })
    if (error) throw error
    return data as NoteComment[]
  },

  async createNoteComment(noteId: string, authorId: string, body: string): Promise<NoteComment> {
    const { data, error } = await supabase!
      .from('note_comments').insert({ id: uuid(), parent_id: noteId, author_id: authorId, body }).select().single()
    if (error) throw error
    return data as NoteComment
  },

  async deleteNoteComment(id: string): Promise<void> {
    const { error } = await supabase!.from('note_comments').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- NOTE VOTES ---------- */
  async getNoteVotes(noteIds: string[]): Promise<NoteVote[]> {
    if (noteIds.length === 0) return []
    const { data, error } = await supabase!
      .from('note_votes').select('*').in('note_id', noteIds)
    if (error) return []
    return data as NoteVote[]
  },

  async voteNote(noteId: string, voterId: string, vote: 'up' | 'down'): Promise<void> {
    // Delete existing vote first
    await supabase!.from('note_votes').delete().eq('note_id', noteId).eq('voter_id', voterId)
    // Insert new vote
    const { error } = await supabase!.from('note_votes').insert({
      id: uuid(), note_id: noteId, voter_id: voterId, vote,
    })
    if (error) throw error
  },

  async unvoteNote(noteId: string, voterId: string): Promise<void> {
    const { error } = await supabase!.from('note_votes').delete().eq('note_id', noteId).eq('voter_id', voterId)
    if (error) throw error
  },

  async voteComment(commentId: string, voterId: string, vote: 'up' | 'down'): Promise<void> {
    await supabase!.from('note_votes').delete().eq('comment_id', commentId).eq('voter_id', voterId)
    const { error } = await supabase!.from('note_votes').insert({
      id: uuid(), comment_id: commentId, voter_id: voterId, vote,
    })
    if (error) throw error
  },

  async unvoteComment(commentId: string, voterId: string): Promise<void> {
    const { error } = await supabase!.from('note_votes').delete().eq('comment_id', commentId).eq('voter_id', voterId)
    if (error) throw error
  },

  /* ---------- COMPANY FOLLOW-UPS ---------- */
  async listFollowUps(companyId: string): Promise<CompanyFollowUp[]> {
    const { data, error } = await supabase!
      .from('company_followups').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (error) throw error
    return data as CompanyFollowUp[]
  },

  async createFollowUp(f: Partial<CompanyFollowUp>): Promise<CompanyFollowUp> {
    const { data, error } = await supabase!
      .from('company_followups').insert({
        id: uuid(),
        company_id: f.company_id,
        author_id: f.author_id,
        title: f.title || '',
        body: f.body || '',
        follow_up_date: f.follow_up_date || null,
      }).select().single()
    if (error) throw error
    return data as CompanyFollowUp
  },

  async deleteFollowUp(id: string): Promise<void> {
    const { error } = await supabase!.from('company_followups').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- REVOKE ACCESS ---------- */
  async revokeAccess(requestId: string): Promise<void> {
    // Mark as rejected (revoked)
    const { error } = await supabase!
      .from('access_requests').update({ status: 'rejected' as never, responded_at: iso() }).eq('id', requestId)
    if (error) throw error
  },

async listGrantedAccess(ownerId: string): Promise<AccessRequest[]> {
    const { data, error } = await supabase!
      .from('access_requests').select('*')
      .eq('owner_id', ownerId).eq('status', 'approved')
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as AccessRequest[]
  },

  /* ---------- SYSTEM STATUS (platform status page + admin toggles) ---------- */
  async listSystemStatuses(): Promise<SystemStatus[]> {
    const { data, error } = await supabase!
      .from('system_status').select('*').order('system', { ascending: true })
    if (error) return []
    return (data || []) as SystemStatus[]
  },

async updateSystemStatus(id: string, patch: Partial<Pick<SystemStatus, 'status' | 'uptime_pct' | 'note'>>): Promise<void> {
    const payload: Record<string, unknown> = {}
    if (patch.status) payload.status = patch.status as SystemStatusValue
    if (patch.uptime_pct !== undefined) payload.uptime_pct = patch.uptime_pct
    if (patch.note !== undefined) payload.note = patch.note
    const { error } = await supabase!.from('system_status').update(payload).eq('id', id)
    if (error) throw error
  },

  /* ---------- FINANCES (admin revenue/cost ledger) ---------- */
  async listFinanceEntries(): Promise<FinanceEntry[]> {
    const { data, error } = await supabase!
      .from('finance_entries').select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as FinanceEntry[]
  },

  async createFinanceEntry(e: {
    kind: FinanceKind
    category: FinanceCategory
    title: string
    description?: string
    amount: number
    entry_date: string
    deal_id?: string | null
  }): Promise<string> {
    const id = uuid()
    const { error } = await supabase!.from('finance_entries').insert({
      id,
      kind: e.kind,
      category: e.category,
      title: e.title,
      description: e.description || '',
      amount: e.amount,
      entry_date: e.entry_date,
      deal_id: e.deal_id || null,
    })
    if (error) throw error
    return id
  },

  async updateFinanceEntry(id: string, patch: Partial<{
    kind: FinanceKind
    category: FinanceCategory
    title: string
    description: string
    amount: number
    entry_date: string
    deal_id: string | null
  }>): Promise<void> {
    const { error } = await supabase!.from('finance_entries')
      .update(patch).eq('id', id)
    if (error) throw error
  },

  async deleteFinanceEntry(id: string): Promise<void> {
    const { error } = await supabase!.from('finance_entries').delete().eq('id', id)
    if (error) throw error
  },

  /* Challenge announcement → inbox row per member with the push routed
   * through the 'user_challenge_new' notification template (schema29's
   * notification_key column drives the Edge Function routing). */
  async announceChallenge(recipientIds: string[], senderId: string, title: string, body: string): Promise<void> {
    if (!recipientIds.length) return
    const rows = recipientIds.map((rid) => ({
      id: uuid(),
      recipient_id: rid,
      sender_id: senderId,
      type: 'system',
      title,
      body,
      read: false,
      action_url: '/challenges',
      metadata: { kind: 'challenge_announcement' },
      priority: 'normal',
      category: 'challenges',
      is_starred: false,
      folder: 'inbox',
      thread_id: null,
      parent_id: null,
      notification_key: 'user_challenge_new',
    }))
    const { error } = await supabase!.from('inbox_messages').insert(rows)
    if (error) throw error
  },

  /* Completion recap → the completer's inbox + optional push. */
  async sendChallengeCompletedNotice(userId: string, title: string, body: string): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').insert({
      id: uuid(),
      recipient_id: userId,
      sender_id: null,
      type: 'system',
      title,
      body,
      read: false,
      action_url: '/challenges',
      metadata: { kind: 'challenge_completed' },
      priority: 'normal',
      category: 'challenges',
      is_starred: false,
      folder: 'inbox',
      thread_id: null,
      parent_id: null,
      notification_key: 'user_challenge_completed',
    })
    if (error) throw error
  },

  /* ---------- LEADS MARKETPLACE (schema61) ---------- */
  async listMarketLeads(): Promise<MarketLead[]> {
    const { data, error } = await supabase!
      .from('marketplace_leads').select('*')
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as MarketLead[]
  },

  async createMarketLead(m: Partial<MarketLead> & { name: string }, importedBy?: string | null): Promise<void> {
    const { error } = await supabase!.from('marketplace_leads').insert({
      name: m.name,
      website: m.website || '',
      domain: m.domain || (m.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
      vat_number: m.vat_number || '',
      industry: m.industry || '',
      description: m.description || '',
      address: m.address || '',
      logo_url: m.logo_url || '',
      summary: m.summary || '',
      phone: m.phone || '',
      published: m.published ?? false,
      unlock_at: m.unlock_at ?? null,
      allocated_to: m.allocated_to ?? null,
      imported_by: importedBy ?? null,
    })
    if (error) throw error
  },

  async updateMarketLead(id: string, patch: Partial<MarketLead>): Promise<void> {
    const allowed = ['name', 'website', 'domain', 'vat_number', 'industry', 'description', 'address', 'logo_url', 'summary', 'phone', 'published', 'unlock_at', 'allocated_to']
    const payload: Record<string, unknown> = { updated_at: iso() }
    for (const k of allowed) if (k in patch) payload[k] = (patch as Record<string, unknown>)[k]
    const { error } = await supabase!.from('marketplace_leads').update(payload).eq('id', id)
    if (error) throw error
  },

  async bulkUpdateMarketLeads(ids: string[], patch: Partial<MarketLead>): Promise<void> {
    if (!ids.length) return
    const allowed = ['published', 'unlock_at', 'allocated_to']
    const payload: Record<string, unknown> = { updated_at: iso() }
    for (const k of allowed) if (k in patch) payload[k] = (patch as Record<string, unknown>)[k]
    const { error } = await supabase!.from('marketplace_leads').update(payload).in('id', ids)
    if (error) throw error
  },

  async deleteMarketLead(id: string): Promise<void> {
    const { error } = await supabase!.from('marketplace_leads').delete().eq('id', id)
    if (error) throw error
  },

  async bulkDeleteMarketLeads(ids: string[]): Promise<void> {
    if (!ids.length) return
    const { error } = await supabase!.from('marketplace_leads').delete().in('id', ids)
    if (error) throw error
  },

  /** Member claim — flips ownership on the pool row; the caller then
   *  creates the real company with created_by = claimer. */
  async claimMarketLead(id: string, userId: string): Promise<void> {
    const { data: claimedAtRows, error: readErr } = await supabase!
      .from('marketplace_leads').select('claimed_by').eq('id', id).single()
    if (readErr) throw readErr
    if ((claimedAtRows as { claimed_by: string | null }).claimed_by) throw new Error('Already claimed')
    const { error } = await supabase!.from('marketplace_leads')
      .update({ claimed_by: userId, claimed_at: iso(), updated_at: iso() })
      .eq('id', id)
    if (error) throw error
  },

  /* ---------- BANK (schema63) ---------- */
  async listBankCards(): Promise<BankCard[]> {
    const { data, error } = await supabase!
      .from('bank_cards').select('*')
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as BankCard[]
  },

  async listBankCardsForUser(userId: string): Promise<BankCard[]> {
    const { data, error } = await supabase!
      .from('bank_cards').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as BankCard[]
  },

  async createBankCard(c: Omit<BankCard, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'frozen'> & { frozen?: boolean }, createdBy: string): Promise<void> {
    const { error } = await supabase!.from('bank_cards').insert({
      user_id: c.user_id,
      holder_name: c.holder_name || '',
      card_number: c.card_number || '',
      expiry: c.expiry || '',
      cvv: c.cvv || '',
      brand: c.brand || 'visa',
      gradient: c.gradient || 'aurora',
      initial_balance: c.initial_balance || 0,
      frozen: c.frozen ?? false,
      created_by: createdBy,
    })
    if (error) throw error
  },

  async updateBankCard(id: string, patch: Partial<BankCard>): Promise<void> {
    const allowed = ['user_id', 'holder_name', 'card_number', 'expiry', 'cvv', 'brand', 'gradient', 'initial_balance', 'frozen']
    const payload: Record<string, unknown> = { updated_at: iso() }
    for (const k of allowed) if (k in patch) payload[k] = (patch as Record<string, unknown>)[k]
    const { error } = await supabase!.from('bank_cards').update(payload).eq('id', id)
    if (error) throw error
  },

  async deleteBankCard(id: string): Promise<void> {
    const { error } = await supabase!.from('bank_cards').delete().eq('id', id)
    if (error) throw error
  },

  async listBankTransactions(cardIds?: string[]): Promise<BankTransaction[]> {
    let q = supabase!.from('bank_transactions').select('*').order('occurred_at', { ascending: true })
    if (cardIds && cardIds.length > 0) q = q.in('card_id', cardIds)
    const { data, error } = await q
    if (error) return []
    return (data || []) as BankTransaction[]
  },

  async createBankTransaction(t: {
    card_id: string
    kind: BankTxKind
    category: string
    amount: number
    note?: string
    occurred_at?: string
  }, createdBy: string): Promise<void> {
    const { error } = await supabase!.from('bank_transactions').insert({
      card_id: t.card_id,
      kind: t.kind,
      category: t.category || 'other',
      amount: t.amount,
      note: t.note || '',
      occurred_at: t.occurred_at || iso(),
      created_by: createdBy,
    })
    if (error) throw error
  },

  async deleteBankTransaction(id: string): Promise<void> {
    const { error } = await supabase!.from('bank_transactions').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- SCHEDULED ACTIVITIES (Kanban + Calendar) ---------- */
  async listScheduledActivities(): Promise<ScheduledActivity[]> {
    const { data, error } = await supabase!
      .from('scheduled_activities').select('*')
      .order('scheduled_at', { ascending: true })
    if (error) return []
    return (data || []) as ScheduledActivity[]
  },

  async createScheduledActivity(a: {
    owner_id: string
    type?: ScheduledActivityType
    status?: ScheduledActivityStatus
    title: string
    notes?: string
    color?: string
    scheduled_at: string
    duration_min?: number
    company_id?: string | null
    opportunity_id?: string | null
    visible_on_calendar?: boolean
  }): Promise<void> {
    const { error } = await supabase!.from('scheduled_activities').insert({
      owner_id: a.owner_id,
      type: a.type || 'meeting',
      status: a.status || 'planned',
      title: a.title,
      notes: a.notes || '',
      color: a.color || '',
      scheduled_at: a.scheduled_at,
      duration_min: a.duration_min ?? 30,
      company_id: a.company_id || null,
      opportunity_id: a.opportunity_id || null,
      visible_on_calendar: a.visible_on_calendar ?? true,
    })
    if (error) throw error
  },

  async updateScheduledActivity(id: string, patch: Partial<ScheduledActivity>): Promise<void> {
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (['type', 'status', 'title', 'notes', 'color', 'scheduled_at', 'duration_min', 'company_id', 'opportunity_id', 'owner_id', 'visible_on_calendar'].includes(k)) {
        payload[k] = v
      }
    }
    const { error } = await supabase!.from('scheduled_activities').update(payload).eq('id', id)
    if (error) throw error
  },

  async deleteScheduledActivity(id: string): Promise<void> {
    const { error } = await supabase!.from('scheduled_activities').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- ACTIVITY COMMENTS ---------- */
  async listActivityComments(activityId: string): Promise<ActivityComment[]> {
    const { data, error } = await supabase!
      .from('scheduled_activity_comments').select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true })
    if (error) return []
    return (data || []) as ActivityComment[]
  },

  async createActivityComment(activityId: string, authorId: string, body: string): Promise<void> {
    const { error } = await supabase!.from('scheduled_activity_comments').insert({
      activity_id: activityId,
      author_id: authorId,
      body,
    })
    if (error) throw error
  },

  async deleteActivityComment(id: string): Promise<void> {
    const { error } = await supabase!.from('scheduled_activity_comments').delete().eq('id', id)
    if (error) throw error
  },

  /* ================================================================== */
  /* WEB PUSH NOTIFICATIONS                                             */
  /* ================================================================== */

  /* ---------- push_subscriptions ---------- */
  async addPushSubscription(
    userId: string,
    sub: {
      endpoint: string
      p256dh: string
      auth_key: string
      subscription?: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime: number | null }
    },
  ): Promise<void> {
    const { error } = await supabase!.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth_key: sub.auth_key,
        subscription: sub.subscription ?? null,
      },
      { onConflict: 'user_id,endpoint' },
    )
    if (error) throw error
  },

  async removePushSubscription(endpoint: string): Promise<void> {
    const { error } = await supabase!.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw error
  },

  async listPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    const { data, error } = await supabase!.from('push_subscriptions')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as PushSubscription[]
  },

  /* ---------- notification_preferences ---------- */
  async listNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
    const { data, error } = await supabase!.from('notification_preferences')
      .select('*').eq('user_id', userId)
    if (error) throw error
    return (data || []) as NotificationPreference[]
  },

  async setNotificationPreference(userId: string, key: NotificationKey, enabled: boolean): Promise<void> {
    const { error } = await supabase!.from('notification_preferences')
      .upsert({ user_id: userId, key, enabled }, { onConflict: 'user_id,key' })
    if (error) throw error
  },

  /* ---------- notification_templates (admin) ---------- */
  async listNotificationTemplates(): Promise<NotificationTemplate[]> {
    const { data, error } = await supabase!.from('notification_templates')
      .select('*').order('key', { ascending: true })
    if (error) throw error
    return (data || []) as NotificationTemplate[]
  },

  async updateNotificationTemplate(key: NotificationKey, patch: Partial<{
    enabled: boolean
    title_template: string
    body_template: string
    tone: NotificationTone
  }>): Promise<void> {
    const { error } = await supabase!.from('notification_templates').update(patch).eq('key', key)
    if (error) throw error
  },

  /* ---------- test notification (full pipeline: insert → trigger → edge → push) ---------- */
  async sendTestPush(userId: string): Promise<void> {
    const { error } = await supabase!.from('inbox_messages').insert({
      id: uuid(),
      recipient_id: userId,
      sender_id: userId,
      type: 'system',
      title: 'Test notification',
      body: 'If you can read this on your phone, push notifications are working.',
      read: false,
      action_url: '/inbox',
      metadata: { kind: 'test_push' },
    })
    if (error) throw error
  },

  /* ---------- push log (admin) — listPushLog now supports status filter ---------- */
  async listPushLog(opts: { limit?: number; status?: 'sent' | 'skipped' | 'error' | 'all' } = {}): Promise<PushLogEntry[]> {
    const limit = opts.limit ?? 25
    let q = supabase!.from('push_log').select('*').order('created_at', { ascending: false }).limit(limit)
    if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as PushLogEntry[]
  },

  /* ---------- error logs (LogBook) ---------- */
  async listErrorLogs(limit = 100): Promise<ErrorLogEntry[]> {
    const { data, error } = await supabase!.from('error_logs')
      .select('*').order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return (data || []) as ErrorLogEntry[]
  },

  async createErrorLog(entry: { source: string; severity?: 'info' | 'warn' | 'error'; message: string; detail?: string; metadata?: Record<string, unknown> }): Promise<void> {
    const { error } = await supabase!.from('error_logs').insert({
      source: entry.source,
      severity: entry.severity ?? 'error',
      message: entry.message,
      detail: entry.detail ?? '',
      metadata: entry.metadata ?? {},
    })
    if (error) throw error
  },

  /* ---------- changelog (admin CRUD, user read) ---------- */
  async listChangelog(includeDrafts = false): Promise<ChangelogEntry[]> {
    let q = supabase!.from('changelog').select('*').order('created_at', { ascending: false })
    if (!includeDrafts) q = q.eq('published', true)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as ChangelogEntry[]
  },

  async createChangelog(entry: { label: ChangelogLabel; version?: string; title: string; body?: string; published?: boolean }): Promise<void> {
    const { error } = await supabase!.from('changelog').insert({
      label: entry.label,
      version: entry.version ?? '',
      title: entry.title,
      body: entry.body ?? '',
      published: entry.published ?? true,
    })
    if (error) throw error
  },

  async updateChangelog(id: string, patch: Partial<{ label: ChangelogLabel; version: string; title: string; body: string; published: boolean }>): Promise<void> {
    const { error } = await supabase!.from('changelog').update(patch).eq('id', id)
    if (error) throw error
  },

  async deleteChangelog(id: string): Promise<void> {
    const { error } = await supabase!.from('changelog').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- LEAD REMINDERS ---------- */
  async createLeadReminder(r: { user_id: string; company_id: string; remind_at: string; title?: string; body?: string }): Promise<void> {
    const { error } = await supabase!.from('lead_reminders').insert({
      user_id: r.user_id,
      company_id: r.company_id,
      remind_at: r.remind_at,
      title: r.title ?? '',
      body: r.body ?? '',
    })
    if (error) throw error
  },

  async listLeadReminders(userId: string): Promise<LeadReminder[]> {
    const { data, error } = await supabase!.from('lead_reminders')
      .select('*').eq('user_id', userId).order('remind_at', { ascending: false })
    if (error) throw error
    return (data || []) as LeadReminder[]
  },

  async deleteLeadReminder(id: string): Promise<void> {
    const { error } = await supabase!.from('lead_reminders').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- ADMIN DOCS (knowledge base) ---------- */
  async listAdminDocs(): Promise<AdminDoc[]> {
    const { data, error } = await supabase!.from('admin_docs')
      .select('*').order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []) as AdminDoc[]
  },

  async createAdminDoc(entry: { title: string; body?: string; structure?: string; category?: string; tags?: string[] }): Promise<void> {
    const { error } = await supabase!.from('admin_docs').insert({
      title: entry.title,
      body: entry.body ?? '',
      structure: entry.structure ?? '',
      category: entry.category ?? 'General',
      tags: entry.tags ?? [],
    })
    if (error) throw error
  },

  async updateAdminDoc(id: string, patch: Partial<{ title: string; body: string; structure: string; category: string; tags: string[] }>): Promise<void> {
    const { error } = await supabase!.from('admin_docs')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteAdminDoc(id: string): Promise<void> {
    const { error } = await supabase!.from('admin_docs').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- ADMIN DOC SNIPPETS (one doc → many code snippets) ---------- */
  async listAdminDocSnippets(docId: string): Promise<AdminDocSnippet[]> {
    const { data, error } = await supabase!.from('admin_doc_snippets')
      .select('*').eq('doc_id', docId).order('created_at', { ascending: true })
    if (error) throw error
    return (data || []) as AdminDocSnippet[]
  },

  async createAdminDocSnippet(s: { doc_id: string; title?: string; language?: string; code: string }): Promise<void> {
    const { error } = await supabase!.from('admin_doc_snippets').insert({
      doc_id: s.doc_id,
      title: s.title ?? '',
      language: s.language ?? '',
      code: s.code ?? '',
    })
    if (error) throw error
  },

  async updateAdminDocSnippet(id: string, patch: Partial<{ title: string; language: string; code: string }>): Promise<void> {
    const { error } = await supabase!.from('admin_doc_snippets').update(patch).eq('id', id)
    if (error) throw error
  },

  async deleteAdminDocSnippet(id: string): Promise<void> {
    const { error } = await supabase!.from('admin_doc_snippets').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- BROADCAST ANNOUNCEMENT (admin → all active users) ----------
   * Fan-out inserts one inbox_messages row per active user with
   * notification_key='user_broadcast'.  The existing push pipeline then
   * delivers a push to each user's subscribed devices, honouring their
   * per-type preference (so users who opted out of 'user_broadcast'
   * won't receive it).
   */
  async broadcastAnnouncement(opts: { title: string; body: string; action_url?: string; sender_id: string }): Promise<{ sent: number }> {
    const { data: profiles, error: pErr } = await supabase!.from('profiles')
      .select('id').eq('active', true)
    if (pErr) throw pErr
    const list = (profiles || []) as { id: string }[]
    if (list.length === 0) return { sent: 0 }
    const rows = list.map((p) => ({
      id: uuid(),
      recipient_id: p.id,
      sender_id: opts.sender_id,
      type: 'system' as never,
      title: opts.title,
      body: opts.body,
      read: false,
      action_url: opts.action_url || '/',
      metadata: { kind: 'broadcast' },
      notification_key: 'user_broadcast' as never,
    }))
    const { error } = await supabase!.from('inbox_messages').insert(rows as never)
    if (error) throw error
    return { sent: list.length }
  },

  /* ================================================================== */
  /* INVOICES                                                            */
  /* ================================================================== */

  async listInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase!.from('invoices')
      .select('*').order('issue_date', { ascending: false }).order('number', { ascending: false })
    if (error) throw error
    return (data || []) as Invoice[]
  },

  async getInvoice(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase!.from('invoices')
      .select('*').eq('id', id).single()
    if (error) return null
    return data as Invoice
  },

  async createInvoice(inv: {
    number: string
    billed_to: string
    billed_address?: string
    billed_email?: string
    billed_vat?: string
    issue_date: string
    due_date?: string | null
    status?: InvoiceStatus
    vat_included?: boolean
    vat_pct?: number
    currency?: string
    notes?: string
    contract_ref?: string
    created_by?: string | null
  }): Promise<Invoice> {
    const { data, error } = await supabase!.from('invoices').insert({
      number: inv.number,
      billed_to: inv.billed_to,
      billed_address: inv.billed_address ?? '',
      billed_email: inv.billed_email ?? '',
      billed_vat: inv.billed_vat ?? '',
      issue_date: inv.issue_date,
      due_date: inv.due_date ?? null,
      status: inv.status ?? 'draft',
      vat_included: inv.vat_included ?? false,
      vat_pct: inv.vat_pct ?? 0,
      currency: inv.currency ?? 'EUR',
      notes: inv.notes ?? '',
      contract_ref: inv.contract_ref ?? '',
      created_by: inv.created_by ?? null,
    }).select().single()
    if (error) throw error
    return data as Invoice
  },

  async updateInvoice(id: string, patch: Partial<{
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
    contract_ref: string
    finance_entry_id: string | null
  }>): Promise<void> {
    const { error } = await supabase!.from('invoices')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteInvoice(id: string): Promise<void> {
    // invoice_services cascade-deletes with the invoice row.
    // The linked finance_entries row is left intact (FK is SET NULL)
    // so historical revenue numbers don't disappear; the admin can
    // manually delete the orphaned finance entry if they want.
    const { error } = await supabase!.from('invoices').delete().eq('id', id)
    if (error) throw error
  },

  /* ---------- invoice_services ---------- */
  async listInvoiceServices(invoiceId: string): Promise<InvoiceService[]> {
    const { data, error } = await supabase!.from('invoice_services')
      .select('*').eq('invoice_id', invoiceId).order('position', { ascending: true })
    if (error) throw error
    return (data || []) as InvoiceService[]
  },

  async createInvoiceService(s: {
    invoice_id: string
    name: string
    description?: string
    quantity?: number
    unit_price: number
    position?: number
  }): Promise<void> {
    const { error } = await supabase!.from('invoice_services').insert({
      invoice_id: s.invoice_id,
      name: s.name,
      description: s.description ?? '',
      quantity: s.quantity ?? 1,
      unit_price: s.unit_price,
      position: s.position ?? 0,
    })
    if (error) throw error
  },

  async updateInvoiceService(id: string, patch: Partial<{
    name: string
    description: string
    quantity: number
    unit_price: number
    position: number
  }>): Promise<void> {
    const { error } = await supabase!.from('invoice_services')
      .update(patch).eq('id', id)
    if (error) throw error
  },

  async deleteInvoiceService(id: string): Promise<void> {
    const { error } = await supabase!.from('invoice_services').delete().eq('id', id)
    if (error) throw error
  },

  /** Replace all line items on an invoice in one shot — used by the
   *  invoice editor so the admin can add/remove/reorder freely. */
  async setInvoiceServices(invoiceId: string, services: Array<{
    name: string
    description?: string
    quantity?: number
    unit_price: number
  }>): Promise<void> {
    // Wipe + insert — simplest correct approach for an admin editor.
    const { error: dErr } = await supabase!.from('invoice_services')
      .delete().eq('invoice_id', invoiceId)
    if (dErr) throw dErr
    if (services.length === 0) return
    const rows = services.map((s, i) => ({
      invoice_id: invoiceId,
      name: s.name,
      description: s.description ?? '',
      quantity: s.quantity ?? 1,
      unit_price: s.unit_price,
      position: i,
    }))
    const { error } = await supabase!.from('invoice_services').insert(rows as never)
    if (error) throw error
  },

  /** Next sequential invoice number in the CC-INV-YYYY-NNNN format.
   *  Reads the highest existing number for the current year and
   *  increments by 1.  Not race-safe but the admin is the only writer. */
  async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `CC-INV-${year}-`
    const { data, error } = await supabase!.from('invoices')
      .select('number')
      .like('number', `${prefix}%`)
      .order('number', { ascending: false })
      .limit(1)
    if (error) {
      // Fall back to 0001 — better than blocking invoice creation.
      return `${prefix}0001`
    }
    const last = (data || [])[0]?.number as string | undefined
    if (!last) return `${prefix}0001`
    const seqStr = last.replace(prefix, '')
    const seq = parseInt(seqStr, 10) || 0
    return `${prefix}${String(seq + 1).padStart(4, '0')}`
  },

  /* ================================================================== */
  /* INVOICE SETTINGS — issuer identity + default templates             */
  /* ================================================================== */

  async getInvoiceSettings(): Promise<InvoiceSettings> {
    const { data, error } = await supabase!.from('invoice_settings')
      .select('*').eq('id', 1).maybeSingle()
    if (error || !data) return { ...DEFAULT_INVOICE_SETTINGS }
    return data as InvoiceSettings
  },

  async updateInvoiceSettings(patch: Partial<InvoiceSettings>): Promise<void> {
    const payload: Record<string, unknown> = { ...patch, updated_at: iso() }
    delete payload.id
    const { error } = await supabase!.from('invoice_settings')
      .update(payload).eq('id', 1)
    if (error) throw error
  },

  /** Public read — used by the /invoice/verify/:id route which doesn't
   *  have an authenticated session.  Returns only the issuer identity
   *  fields (no templates), but RLS already gates the templates to
   *  admins and exposes the identity columns to anonymous reads. */
  async getPublicInvoiceSettings(): Promise<InvoiceSettings> {
    const { data, error } = await supabase!.from('invoice_settings')
      .select('*').eq('id', 1).maybeSingle()
    if (error || !data) return { ...DEFAULT_INVOICE_SETTINGS }
    return data as InvoiceSettings
  },

  /* ================================================================== */
  /* CONTRACT TEMPLATES                                                 */
  /* ================================================================== */

  async listContractTemplates(): Promise<ContractTemplate[]> {
    const { data, error } = await supabase!.from('contract_templates')
      .select('*').order('name', { ascending: true })
    if (error) throw error
    return (data || []) as ContractTemplate[]
  },

  async createContractTemplate(t: {
    name: string
    description?: string
    body: string
    custom_placeholders?: CustomPlaceholderDef[]
  }): Promise<void> {
    const { error } = await supabase!.from('contract_templates').insert({
      name: t.name,
      description: t.description ?? '',
      body: t.body,
      custom_placeholders: t.custom_placeholders ?? [],
    })
    if (error) throw error
  },

  async updateContractTemplate(id: string, patch: Partial<{
    name: string
    description: string
    body: string
    custom_placeholders: CustomPlaceholderDef[]
  }>): Promise<void> {
    const { error } = await supabase!.from('contract_templates')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteContractTemplate(id: string): Promise<void> {
    const { error } = await supabase!.from('contract_templates').delete().eq('id', id)
    if (error) throw error
  },

  /* ================================================================== */
  /* CONTRACTS                                                          */
  /* ================================================================== */

  async listContracts(): Promise<Contract[]> {
    const { data, error } = await supabase!.from('contracts')
      .select('*').order('issue_date', { ascending: false }).order('number', { ascending: false })
    if (error) throw error
    return (data || []) as Contract[]
  },

  async getContract(id: string): Promise<Contract | null> {
    const { data, error } = await supabase!.from('contracts')
      .select('*').eq('id', id).single()
    if (error) return null
    return data as Contract
  },

  async createContract(c: {
    number: string
    template_id?: string | null
    status?: ContractStatus
    counterparty_name: string
    counterparty_company?: string
    counterparty_address?: string
    counterparty_phone?: string
    counterparty_email?: string
    counterparty_vat?: string
    issue_date: string
    start_date?: string | null
    end_date?: string | null
    notes?: string
    created_by?: string | null
  }): Promise<Contract> {
    const { data, error } = await supabase!.from('contracts').insert({
      number: c.number,
      template_id: c.template_id ?? null,
      status: c.status ?? 'draft',
      counterparty_name: c.counterparty_name,
      counterparty_company: c.counterparty_company ?? '',
      counterparty_address: c.counterparty_address ?? '',
      counterparty_phone: c.counterparty_phone ?? '',
      counterparty_email: c.counterparty_email ?? '',
      counterparty_vat: c.counterparty_vat ?? '',
      issue_date: c.issue_date,
      start_date: c.start_date ?? null,
      end_date: c.end_date ?? null,
      notes: c.notes ?? '',
      created_by: c.created_by ?? null,
    }).select().single()
    if (error) throw error
    return data as Contract
  },

  async updateContract(id: string, patch: Partial<{
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
  }>): Promise<void> {
    const { error } = await supabase!.from('contracts')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteContract(id: string): Promise<void> {
    const { error } = await supabase!.from('contracts').delete().eq('id', id)
    if (error) throw error
  },

  /** Random contract number in the format CC-CTR-YYYY-XXXXXX where
   *  XXXXXX is a 6-char alphanumeric (uppercase, no ambiguous chars). */
  randomContractNumber(): string {
    const year = new Date().getFullYear()
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return `CC-CTR-${year}-${code}`
  },

  /* ================================================================== */
  /* CONTRACT TEMPLATE VARIANTS (multi-language)                          */
  /* ================================================================== */

  async listContractVariants(templateId: string): Promise<ContractTemplateVariant[]> {
    const { data, error } = await supabase!.from('contract_template_variants')
      .select('*').eq('template_id', templateId).order('language', { ascending: true })
    if (error) throw error
    return (data || []) as ContractTemplateVariant[]
  },

  async createContractVariant(v: {
    template_id: string
    language: string
    language_label: string
    body: string
    custom_placeholders?: CustomPlaceholderDef[]
  }): Promise<void> {
    const { error } = await supabase!.from('contract_template_variants').insert({
      template_id: v.template_id,
      language: v.language,
      language_label: v.language_label,
      body: v.body,
      custom_placeholders: v.custom_placeholders ?? [],
    })
    if (error) throw error
  },

  async updateContractVariant(id: string, patch: Partial<{
    language: string
    language_label: string
    body: string
    custom_placeholders: CustomPlaceholderDef[]
  }>): Promise<void> {
    const { error } = await supabase!.from('contract_template_variants')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteContractVariant(id: string): Promise<void> {
    const { error } = await supabase!.from('contract_template_variants').delete().eq('id', id)
    if (error) throw error
  },

  /** Search contracts by number prefix — used by the InvoiceEditor's
   *  live contract-ref validator (tick/X). */
  async findContractByNumber(number: string): Promise<Contract | null> {
    if (!number.trim()) return null
    const { data, error } = await supabase!.from('contracts')
      .select('*').eq('number', number.trim()).maybeSingle()
    if (error) return null
    return (data || null) as Contract | null
  },

  /* ================================================================== */
  /* DESIGN SETTINGS (platform-wide branding)                            */
  /* ================================================================== */

  async getDesignSettings(): Promise<DesignSettings> {
    const { data, error } = await supabase!.from('design_settings')
      .select('*').eq('id', 1).maybeSingle()
    if (error || !data) return { ...DEFAULT_DESIGN_SETTINGS }
    return data as DesignSettings
  },

  async getPublicDesignSettings(): Promise<DesignSettings> {
    const { data, error } = await supabase!.from('design_settings')
      .select('*').eq('id', 1).maybeSingle()
    if (error || !data) return { ...DEFAULT_DESIGN_SETTINGS }
    return data as DesignSettings
  },

  async updateDesignSettings(patch: Partial<DesignSettings>): Promise<void> {
    const payload: Record<string, unknown> = { ...patch, updated_at: iso() }
    delete payload.id
    const { error } = await supabase!.from('design_settings')
      .update(payload).eq('id', 1)
    if (error) throw error
  },

  /* ================================================================== */
  /* LANGUAGE TRANSLATIONS                                                */
  /* ================================================================== */

  async listLanguageTranslations(): Promise<LanguageTranslations[]> {
    const { data, error } = await supabase!.from('language_translations')
      .select('*').order('language', { ascending: true })
    if (error) throw error
    return (data || []) as LanguageTranslations[]
  },

  async createLanguageTranslation(l: { language: string; language_label: string; translations: Record<string, string> }): Promise<void> {
    const { error } = await supabase!.from('language_translations').insert({
      language: l.language,
      language_label: l.language_label,
      translations: l.translations,
    })
    if (error) throw error
  },

  async updateLanguageTranslation(id: string, patch: Partial<{ language: string; language_label: string; translations: Record<string, string> }>): Promise<void> {
    const { error } = await supabase!.from('language_translations')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deleteLanguageTranslation(id: string): Promise<void> {
    const { error } = await supabase!.from('language_translations').delete().eq('id', id)
    if (error) throw error
  },

  /* ================================================================== */
  /* PLATFORM LOCALES (UI translations)                                   */
  /* ================================================================== */

  async listPlatformLocales(): Promise<PlatformLocale[]> {
    const { data, error } = await supabase!.from('platform_locales')
      .select('*').order('locale', { ascending: true })
    if (error) return []
    return (data || []) as PlatformLocale[]
  },

  async createPlatformLocale(l: { locale: string; label: string; strings: Record<string, string> }): Promise<void> {
    const { error } = await supabase!.from('platform_locales').insert({
      locale: l.locale,
      label: l.label,
      strings: l.strings,
    })
    if (error) throw error
  },

  async updatePlatformLocale(id: string, patch: Partial<{ locale: string; label: string; strings: Record<string, string> }>): Promise<void> {
    const { error } = await supabase!.from('platform_locales')
      .update({ ...patch, updated_at: iso() }).eq('id', id)
    if (error) throw error
  },

  async deletePlatformLocale(id: string): Promise<void> {
    const { error } = await supabase!.from('platform_locales').delete().eq('id', id)
    if (error) throw error
  },
}
