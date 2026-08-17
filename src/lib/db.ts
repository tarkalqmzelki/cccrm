import { supabase } from './supabase'
import { uuid } from './uuid'
import type {
  Profile, Referral, Lead, Deal, Payout, Settings,
  Company, Contact, Opportunity, Activity, Task, CompanyNote, OpportunityNote, ServiceItem,
  AccessRequest, InboxMessage, NoteComment, NoteVote, CompanyFollowUp, ChatMessage, SystemStatus, SystemStatusValue,
  FinanceEntry, FinanceCategory, FinanceKind,
  ScheduledActivity, ScheduledActivityType, ScheduledActivityStatus, ActivityComment,
  MessagePriority, MessageFolder,
  NotificationKey, NotificationPreference, NotificationTemplate, NotificationTone, PushSubscription,
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
      summary: c.summary || '',
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
  }): Promise<void> {
    const { error } = await supabase!.from('finance_entries').insert({
      kind: e.kind,
      category: e.category,
      title: e.title,
      description: e.description || '',
      amount: e.amount,
      entry_date: e.entry_date,
      deal_id: e.deal_id || null,
    })
    if (error) throw error
  },

async deleteFinanceEntry(id: string): Promise<void> {
    const { error } = await supabase!.from('finance_entries').delete().eq('id', id)
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
  async addPushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth_key: string }): Promise<void> {
    const { error } = await supabase!.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
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
}
