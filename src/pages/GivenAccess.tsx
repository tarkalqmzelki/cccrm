import { useMemo } from 'react'
import { KeyRound, Trash2, Network, Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { PageContainer } from '../components/layout/AppShell'
import { useToast } from '../context/ToastContext'
import type { AccessRequest, Profile, Company, Opportunity } from '../lib/types'
import { dateShort } from '../lib/format'

export default function GivenAccess() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, reload } = useAsync(async () => {
    if (!user) return null
    const [granted, profiles, companies, opps] = await Promise.all([
      db.listGrantedAccess(user.id),
      db.listProfiles(),
      db.listCompanies(),
      db.listOpportunities(),
    ])
    return { granted, profiles: profiles as Profile[], companies, opps }
  }, [user?.id])

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {}
    data?.profiles.forEach((p) => (m[p.id] = p))
    return m
  }, [data])
  const companyMap = useMemo(() => {
    const m: Record<string, { name: string }> = {}
    data?.companies.forEach((c) => (m[c.id] = { name: c.name }))
    return m
  }, [data])
  const oppMap = useMemo(() => {
    const m: Record<string, { title: string; company_id: string }> = {}
    data?.opps.forEach((o) => (m[o.id] = { title: o.title, company_id: o.company_id }))
    return m
  }, [data])

  if (!user) return null
  const granted = data?.granted || []

  async function revoke(id: string, name: string) {
    try {
      await db.revokeAccess(id)
      push({ tone: 'success', title: 'Access revoked', desc: `${name} can no longer see your leads.` })
      reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not revoke', desc: e?.message })
    }
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Given Access</h1>
        <p className="mt-1 text-sm text-ink-400">Manage who has access to your leads. Revoke access at any time.</p>
      </div>

      <Card>
        <CardHeader title="Active access grants" desc={`${granted.length} ${granted.length === 1 ? 'person' : 'people'} with access`} />
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : granted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <KeyRound size={24} strokeWidth={1.75} className="text-ink-300" />
            <p className="text-sm text-ink-400">You haven't granted access to anyone yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {granted.map((g) => {
              const grantee = profileMap[g.requester_id]
              return (
                <div key={g.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar name={grantee?.full_name || '?'} color={grantee?.avatar_color} url={grantee?.avatar_url} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{grantee?.full_name || 'Unknown'}</p>
                    <p className="text-2xs text-ink-400">
                      Granted {dateShort(g.responded_at || g.created_at)} ·
                      {g.opportunity_id ? ` Offer: ${oppMap[g.opportunity_id]?.title || companyMap[oppMap[g.opportunity_id]?.company_id || '']?.name || 'Unknown'}`
                        : g.company_id ? ` Lead: ${companyMap[g.company_id]?.name || 'Unknown'}`
                        : ' Unknown lead'}
                    </p>
                  </div>
                  <Badge tone="pos" dot>Active</Badge>
                  <Button size="sm" variant="secondary" icon={<Trash2 size={14} strokeWidth={1.75} />} onClick={() => revoke(g.id, grantee?.full_name || 'Unknown')}>
                    Revoke
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </PageContainer>
  )
}
