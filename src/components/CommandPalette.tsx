import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Building2, Briefcase, Wallet, FileText, Users, Network,
  CornerDownLeft, Lock, ArrowRight, Phone, Mail, Sparkles, FileText as SummaryIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import { Avatar } from './ui/Avatar'
import { eur } from '../lib/format'
import type {
  Company, Opportunity, Contact, Deal, Payout, Profile,
  AccessRequest, Lead,
} from '../lib/types'

/* ------------------------------------------------------------------ */
/* Result type                                                         */
/* ------------------------------------------------------------------ */
type SearchResultType = 'lead' | 'offer' | 'contact' | 'deal' | 'payout' | 'member'

interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  href: string
  locked?: boolean
  icon: typeof Building2
  /** Override icon element, optional */
  iconTone?: string
}

/* ------------------------------------------------------------------ */
/* CommandPalette                                                      */
/* ------------------------------------------------------------------ */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [allData, setAllData] = useState<null | {
    companies: Company[]
    opportunities: Opportunity[]
    contacts: Contact[]
    deals: Deal[]
    payouts: Payout[]
    profiles: Profile[]
    leads: Lead[]
    requests: AccessRequest[]
  }>(null)

  /* -- Bootstrap: load everything once when first opened -- */
  useEffect(() => {
    if (!open || !user || allData) return
    let active = true
    setLoading(true)
    Promise.all([
      db.listCompanies(),
      db.listOpportunities(),
      db.listLeads(),
      db.listDeals(),
      db.listPayouts(),
      db.listProfiles(),
      db.listAccessRequests(user.id),
    ])
      .then(([companies, opportunities, leads, deals, payouts, profiles, requests]) => {
        if (!active) return
        const contactPromises = companies.map((c) => db.listContacts(c.id).catch(() => [] as Contact[]))
        return Promise.all(contactPromises).then((contactGroups) => {
          if (!active) return
          const contacts = contactGroups.flat()
          setAllData({ companies, opportunities, leads, deals, payouts, profiles, contacts: contacts as Contact[], requests: requests as AccessRequest[] } as never)
        })
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, user?.id, allData])

  /* -- Reset query/state when opening -- */
  useEffect(() => { if (open) { setQuery(''); setActiveIdx(0) } }, [open])

  /* -- Compute visible results filtered by access + query -- */
  const computed = useMemo(() => {
    if (!allData || !user) return []
    const isAdmin = user.role === 'admin'
    const q = query.trim().toLowerCase()

    const approvedCompanies = new Set<string>()
    const approvedOpportunities = new Set<string>()
    for (const r of allData.requests) {
      if (r.status !== 'approved' || r.requester_id !== user.id) continue
      if (r.company_id) approvedCompanies.add(r.company_id)
      if (r.opportunity_id) approvedOpportunities.add(r.opportunity_id)
    }

    /* For leads (companies): admin sees all; otherwise user owns it OR approved request */
    const canSeeCompany = (c: Company): boolean => {
      if (isAdmin) return true
      if (c.created_by === user.id) return true
      return approvedCompanies.has(c.id)
    }
    const canSeeOpp = (o: Opportunity): boolean => {
      if (isAdmin) return true
      if (o.owner_id === user.id) return true
      return approvedOpportunities.has(o.id)
    }
    const canSeeContact = (c: Contact): boolean => {
      if (isAdmin) return true
      if (c.created_by === user.id) return true
      const company = allData.companies.find((x) => x.id === c.company_id)
      if (!company) return false
      return canSeeCompany(company)
    }
    const canSeeDeal = (d: Deal): boolean => isAdmin || d.seller_id === user.id
    const canSeePayout = (p: Payout): boolean => isAdmin || p.seller_id === user.id

    const out: SearchResult[] = []

    /* Companies (leads) */
    for (const c of allData.companies) {
      if (!q && !canSeeCompany(c)) continue
      if (q && !(c.name.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q) || c.website.toLowerCase().includes(q) || c.vat_number.toLowerCase().includes(q))) continue
      const locked = !canSeeCompany(c)
      out.push({
        id: `lead:${c.id}`,
        type: 'lead',
        title: c.name || 'Untitled',
        subtitle: c.industry || c.website || c.domain || 'Lead',
        href: `/leads/${c.id}`,
        locked,
        icon: Building2,
      })
    }

    /* Opportunities (offers) */
    for (const o of allData.opportunities) {
      if (!canSeeOpp(o)) continue
      if (q && !o.title.toLowerCase().includes(q)) continue
      const company = allData.companies.find((c) => c.id === o.company_id)
      out.push({
        id: `offer:${o.id}`,
        type: 'offer',
        title: o.title || 'Untitled offer',
        subtitle: `${company?.name || '—'} · ${eur(o.offer_value || o.est_revenue)}`,
        href: `/leads/opp/${o.id}`,
        icon: Briefcase,
      })
    }

    /* Contacts — only when unlocked */
    for (const c of allData.contacts as Contact[]) {
      if (!canSeeContact(c)) continue
      if (q && !(c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.role.toLowerCase().includes(q))) continue
      out.push({
        id: `contact:${c.id}`,
        type: 'contact',
        title: c.full_name || 'Contact',
        subtitle: `${c.role || 'contact'}${c.email ? ` · ${c.email}` : ''}`,
        href: '',
        icon: Users,
      })
    }

    /* Deals */
    for (const d of allData.deals) {
      if (!canSeeDeal(d)) continue
      if (q && !(d.company.toLowerCase().includes(q) || d.contact_name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || d.phone.toLowerCase().includes(q))) continue
      out.push({
        id: `deal:${d.id}`,
        type: 'deal',
        title: d.company || 'Untitled deal',
        subtitle: d.contact_name || 'No contact',
        href: `/deals/${d.id}`,
        icon: FileText,
      })
    }

    /* Payouts */
    for (const p of allData.payouts) {
      if (!canSeePayout(p)) continue
      const deal = p.deal_id ? allData.deals.find((d) => d.id === p.deal_id) : null
      const label = deal?.company || (p.payout_type === 'referral' ? 'Referral payout' : 'Sale payout')
      if (q && !label.toLowerCase().includes(q)) continue
      out.push({
        id: `payout:${p.id}`,
        type: 'payout',
        title: label,
        subtitle: `${eur(p.amount)} · paid ${eur(p.paid_amount || 0)}`,
        href: '/payouts',
        icon: Wallet,
      })
    }

    /* Members */
    for (const p of allData.profiles) {
      if (q && !(p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q))) continue
      out.push({
        id: `member:${p.id}`,
        type: 'member',
        title: p.full_name,
        subtitle: `${p.role}${p.phone ? ` · ${p.phone}` : ''}`,
        href: '',
        icon: Users,
      })
    }

    /* Cap results */
    return out.slice(0, 60)
  }, [allData, user, query])

  useEffect(() => { setResults(computed) }, [computed])
  useEffect(() => { if (activeIdx >= results.length) setActiveIdx(0) }, [results.length, activeIdx])

  /* -- Keyboard nav -- */
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); select(results[activeIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  function select(r?: SearchResult) {
    if (!r) return
    /* Locked leads (companies) are still navigable — the CompanyDetail
       page's Summary tab is public, so the user can see the summary
       even without access to the rest of the lead. */
    if (r.locked && r.type !== 'lead') return
    onClose()
    if (r.href) navigate(r.href)
  }

  function openSummary(r?: SearchResult) {
    if (!r || !r.href) return
    onClose()
    navigate(r.href)
  }

  /* -- Close on outside click handled by parent modal; ESC handled here -- */
  /* -- Group results for display -- */
  const groups = useMemo(() => {
    const g: Record<SearchResultType, SearchResult[]> = { lead: [], offer: [], contact: [], deal: [], payout: [], member: [] }
    results.forEach((r) => g[r.type].push(r))
    return g
  }, [results])

  const GROUP_LABELS: Record<SearchResultType, string> = {
    lead: 'Leads',
    offer: 'Offers',
    contact: 'Contacts',
    deal: 'Deals',
    payout: 'Payouts',
    member: 'Members',
  }
  const GROUP_ORDER: SearchResultType[] = ['lead', 'offer', 'contact', 'deal', 'payout', 'member']

  let runningIdx = 0

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[160] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 backdrop-strong"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-2xl glass-strong rounded-2xl shadow-glass overflow-hidden"
          >
            {/* Search bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
              <Search size={18} strokeWidth={1.75} className="text-ink-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={user?.role === 'admin' ? 'Search leads, contacts, deals, payouts, members…' : 'Search what you have access to…'}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-300 focus:outline-none"
              />
              <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded-md border border-line bg-ink-50 px-1.5 text-2xs font-medium text-ink-400">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[58vh] overflow-y-auto px-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-400">
                  <Sparkles size={14} strokeWidth={1.75} className="animate-pulse" />
                  Building search index…
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-sm text-ink-400">
                  <Search size={20} strokeWidth={1.75} className="text-ink-300" />
                  {query.trim() ? 'No matches' : 'Start typing to search'}
                </div>
              ) : (
                GROUP_ORDER.map((key) => {
                  const arr = groups[key]
                  if (arr.length === 0) return null
                  return (
                    <div key={key} className="mb-2">
                      <p className="px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-ink-400">{GROUP_LABELS[key]}</p>
                      {arr.map((r) => {
                        const idx = runningIdx++
                        const isActive = idx === activeIdx
                        /* Locked leads are clickable (they open the public Summary
                           tab). Other locked results stay disabled. */
                        const isLockedLead = r.locked && r.type === 'lead'
                        const clickable = !r.locked || isLockedLead
                        return (
                          <div
                            key={r.id}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                              isActive ? (r.locked && !isLockedLead ? 'bg-ink-50' : 'bg-ink-100') : 'hover:bg-ink-50'
                            } ${clickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                            onClick={() => clickable && select(r)}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
                              <r.icon size={14} strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{r.title}</p>
                              <p className="truncate text-2xs text-ink-400">{r.subtitle}</p>
                            </div>
                            {r.locked && !isLockedLead && <Lock size={13} strokeWidth={1.75} className="text-ink-300" />}
                            {isLockedLead && (
                              <>
                                <Lock size={13} strokeWidth={1.75} className="text-ink-300" />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openSummary(r) }}
                                  className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-2xs font-medium text-ink-600 hover:border-ink-200 hover:bg-ink-50 transition-colors"
                                  title="Open the public summary of this lead"
                                >
                                  <SummaryIcon size={10} strokeWidth={1.75} /> Summary
                                </button>
                              </>
                            )}
                            {isActive && !r.locked && <ArrowRight size={14} strokeWidth={1.75} className="text-ink-400" />}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-2xs text-ink-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="rounded border border-line bg-ink-50 px-1 py-0.5 font-medium">↑↓</span> navigate
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded border border-line bg-ink-50 px-1 py-0.5 font-medium">↵</span> open
                </span>
              </div>
              <span className="flex items-center gap-1">
                {user?.role === 'admin' ? 'Full access' : 'Filtered by your access'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}