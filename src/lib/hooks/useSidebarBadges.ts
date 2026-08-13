import { useEffect, useState } from 'react'
import { db } from '../db'
import { supabase } from '../supabase'
import type { Profile } from '../types'

export interface SidebarBadges {
  deals: number
  leads: number
  payouts: number
  inbox: number
  loading: boolean
}

/**
 * Action-needed counts shown as red bubbles next to nav links.
 *
 *  - deals:   deals with status='pending_review' (admin sees all, sellers see their own)
 *  - leads:   leads (companies owned, or all if admin) that are NOT in a closed/approved state
 *             — i.e. statuses cold_call / warm_call / unfinished / to_be_finished
 *  - payouts: per-user payouts that have collectable amount greater than paid, status='pending'
 *  - inbox:   unread inbox messages (mirrors sidebar unread badge)
 */
export function useSidebarBadges(user: Profile | null): SidebarBadges {
  const [badges, setBadges] = useState<SidebarBadges>({ deals: 0, leads: 0, payouts: 0, inbox: 0, loading: true })

  useEffect(() => {
    if (!user || !supabase) {
      setBadges({ deals: 0, leads: 0, payouts: 0, inbox: 0, loading: false })
      return
    }
    const uid = user.id
    const isAdmin = user.role === 'admin'
    let active = true

    async function compute(): Promise<SidebarBadges> {
      const [deals, leads, payouts, approvals, inboxCount] = await Promise.all([
        db.listDeals(),
        db.listLeads(),
        db.listPayouts(),
        db.listAccessRequests(uid),
        db.unreadInboxCount(uid),
      ])

      // deals
      const dealPending = deals.filter((d) => d.status === 'pending_review')
        .filter((d) => isAdmin || d.seller_id === uid).length

      // leads needing action (not closed/approved/rejected)
      const ACTION_STATUSES = ['cold_call', 'warm_call', 'unfinished', 'to_be_finished', 'pending_review']
      const leadAction = leads
        .filter((l) => ACTION_STATUSES.includes(l.status))
        .filter((l) => isAdmin || l.owner_id === uid).length

      // payouts — pending + has unpaid collectable
      let payoutPending = 0
      for (const p of payouts) {
        if (p.seller_id !== uid) continue
        if (p.status !== 'pending') continue
        const remaining = Math.max(p.amount - (p.paid_amount || 0), 0)
        if (remaining > 0) payoutPending++
      }

      return {
        deals: dealPending,
        leads: leadAction,
        payouts: payoutPending,
        inbox: inboxCount,
        loading: false,
      }
    }

    compute().then((b) => { if (active) setBadges(b) }).catch(() => {
      if (active) setBadges({ deals: 0, leads: 0, payouts: 0, inbox: 0, loading: false })
    })

    const interval = setInterval(() => {
      compute().then((b) => { if (active) setBadges(b) }).catch(() => {})
    }, 20000)

    return () => { active = false; clearInterval(interval) }
  }, [user?.id, user?.role])

  return badges
}