import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from './useAsync'
import { db } from '../db'
import type { ScheduledActivity, Company, Profile, Deal } from '../types'
import { useActivityStats } from './useActivityStats'

/**
 * Loads all data needed by Kanban + Calendar views:
 * activities, profiles, companies, deals. Returns scope helpers and stats.
 */
export function useActivitiesData() {
  const { user } = useAuth()
  const { data, loading, reload } = useAsync(async () => {
    const [activities, profiles, companies, deals] = await Promise.all([
      db.listScheduledActivities(),
      db.listProfiles(),
      db.listCompanies(),
      db.listDeals(),
    ])
    return {
      activities: activities as ScheduledActivity[],
      profiles: profiles as Profile[],
      companies: companies as Company[],
      deals: deals as Deal[],
    }
  }, [user?.id])

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    ;(data?.profiles || []).forEach((p) => (m[p.id] = p))
    return m
  }, [data])

  const companyMap = useMemo(() => {
    const m: Record<string, Company> = {}
    ;(data?.companies || []).forEach((c) => (m[c.id] = c))
    return m
  }, [data])

  /* Sellers see only their own activities for the stats sidebar; admins see all. */
  const statsActivities = useMemo(() => {
    if (!user || !data) return []
    if (user.role === 'admin') return data.activities
    return data.activities.filter((a) => a.owner_id === user.id)
  }, [data, user])

  const stats = useActivityStats(statsActivities, data?.companies || [], data?.deals || [])

  return {
    loading,
    reload,
    activities: data?.activities || [],
    profiles: data?.profiles || [],
    companies: data?.companies || [],
    deals: data?.deals || [],
    profileMap,
    companyMap,
    stats,
    statsActivities,
  }
}