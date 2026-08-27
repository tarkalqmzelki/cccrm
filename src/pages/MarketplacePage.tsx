import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Store, Lock, Copy, Eye, MoreVertical, MapPin, Globe,
  Sparkles, Search, X, Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import type { MarketLead } from '../lib/types'
import { marketLeadState } from '../lib/types'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { Avatar } from '../components/ui/Avatar'
import { useToast } from '../context/ToastContext'
import { openContextMenu, type CtxItem } from '../components/ui/ContextMenu'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Leads Marketplace — a live shelf of companies HQ feeds to the team.
 * Claim one and it becomes YOUR lead on the Leads page instantly.
 * Contact phone stays hidden until you own the lead (then it lives on
 * the lead's page, visible to you and admins only).
 */
export default function MarketplacePage() {
  const { user } = useAuth()
  const { push } = useToast()
  const leadsQ = useAsync(async () => db.listMarketLeads(), [])
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState<string>('all')
  const [preview, setPreview] = useState<MarketLead | null>(null)
  const [claimTarget, setClaimTarget] = useState<MarketLead | null>(null)
  const [, setTick] = useState(0)

  const mineCount = useMemo(
    () => (leadsQ.data || []).filter((l) => l.claimed_by === user?.id).length,
    [leadsQ.data, user?.id],
  )

  /* Claimed leads leave the marketplace entirely. */
  const available = useMemo(() => {
    return (leadsQ.data || []).filter((l) =>
      l.published && !l.claimed_by && (!l.allocated_to || l.allocated_to === user?.id),
    )
  }, [leadsQ.data, user?.id])

  /* Distinct industries (categories) across published shelf */
  const industries = useMemo(() => {
    const set = new Set<string>()
    available.forEach((l) => {
      const i = (l.industry || '').trim()
      if (i) set.add(i)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [available])

  const industryCount = useMemo(() => {
    const m = new Map<string, number>()
    available.forEach((l) => {
      const i = (l.industry || '').trim()
      if (i) m.set(i, (m.get(i) || 0) + 1)
    })
    return m
  }, [available])

  const filtered = useMemo(() => {
    let list = available
    if (industry !== 'all') list = list.filter((l) => (l.industry || '').trim() === industry)
    const q = search.toLowerCase().trim()
    if (!q) return list
    return list.filter((l) => `${l.name} ${l.industry} ${l.address} ${l.summary}`.toLowerCase().includes(q))
  }, [available, industry, search])

  const reservedFirst = useMemo(
    () => [...filtered].sort((a, b) => (b.allocated_to === user?.id ? 1 : 0) - (a.allocated_to === user?.id ? 1 : 0)),
    [filtered, user?.id],
  )

  /* Tick only while a claim countdown is on screen — otherwise the page
     is perfectly static (no re-renders, no animation restarts). */
  const hasCountdown = useMemo(
    () => available.some((l) => l.unlock_at && new Date(l.unlock_at).getTime() > Date.now()),
    [available],
  )
  useEffect(() => {
    if (!hasCountdown) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [hasCountdown])

  async function performClaim(l: MarketLead): Promise<void> {
    if (!user) throw new Error('Not signed in')
    // Create first, claim second: if the claim loses a race we simply
    // delete our own company copy — no stuck half-claimed rows.
    const company = await db.createCompany({
      name: l.name,
      website: l.website,
      domain: l.domain,
      vat_number: l.vat_number,
      industry: l.industry,
      description: l.description,
      address: l.address,
      logo_url: l.logo_url,
      summary: l.summary,
      phone: l.phone || '',
      created_by: user.id,
    })
    try {
      await db.claimMarketLead(l.id, user.id)
    } catch (e) {
      try { await db.deleteCompany(company.id) } catch { /* best-effort */ }
      throw e
    }
  }

  function rowActions(l: MarketLead, viaPreview = false): CtxItem[] {
    const state = marketLeadState(l)
    const items: CtxItem[] = []
    if (!viaPreview) items.push({ label: 'Preview details', icon: <Eye size={14} strokeWidth={1.75} />, onClick: () => setPreview(l) })
    if (l.website) {
      items.push({
        label: 'Copy website',
        icon: <Copy size={14} strokeWidth={1.75} />,
        onClick: () => { navigator.clipboard?.writeText(l.website); push({ tone: 'info', title: 'Website copied' }) },
      })
    }
    if (state === 'live') {
      items.push(
        { divider: true },
        { label: 'Claim this lead', icon: <Sparkles size={14} strokeWidth={1.75} />, onClick: () => setClaimTarget(l) },
      )
    }
    return items
  }

  return (
    <PageContainer>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Leads Marketplace
            <Store size={20} strokeWidth={1.75} className="text-info" />
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Fresh companies drop here regularly — first to claim wins the lead.
            {mineCount > 0 && <span className="num font-semibold text-pos"> You've claimed {mineCount}.</span>}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies, industries, places…"
          className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-sm outline-none transition-colors focus:border-ink"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-300 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]">
            <X size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Industry category filter */}
      {industries.length > 0 && (
        <div className="-mx-1 mb-5 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button
            onClick={() => setIndustry('all')}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              industry === 'all'
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-surface text-ink-500 hover:border-ink-200 hover:text-ink'
            }`}
          >
            All <span className="num opacity-60">{available.length}</span>
          </button>
          {industries.map((ind) => {
            const activeChip = industry === ind
            return (
              <button
                key={ind}
                onClick={() => setIndustry(activeChip ? 'all' : ind)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  activeChip
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink-500 hover:border-ink-200 hover:text-ink'
                }`}
              >
                {ind} <span className="num opacity-60">{industryCount.get(ind)}</span>
              </button>
            )
          })}
        </div>
      )}

      {leadsQ.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : reservedFirst.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Store size={22} strokeWidth={1.5} />}
            title={available.length === 0 ? 'Shelf is empty right now' : 'No matches'}
            desc={available.length === 0 ? 'HQ restocks the marketplace regularly — check back soon.' : `Nothing matches "${search}".`}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reservedFirst.map((l, i) => (
            <MarketCard
              key={l.id}
              lead={l}
              index={i}
              isMineReservation={l.allocated_to === user?.id}
              onClaim={() => setClaimTarget(l)}
              onPreview={() => setPreview(l)}
              onMenu={(e) => openContextMenu(e, rowActions(l))}
            />
          ))}
        </div>
      )}

      {/* Preview modal — contact details stay hidden until claimed */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        size="md"
        title={preview?.name ?? ''}
        desc={[preview?.industry, preview?.address].filter(Boolean).join(' · ') || undefined}
        footer={
          preview && marketLeadState(preview) === 'live' ? (
            <Button block icon={<Sparkles size={15} strokeWidth={1.75} />} onClick={() => { setPreview(null); setClaimTarget(preview) }}>
              Claim this lead
            </Button>
          ) : preview && marketLeadState(preview) === 'locked' ? (
            <Button block variant="secondary" disabled icon={<Lock size={15} strokeWidth={1.75} />}>
              Unlocks {fmtCountdown(preview.unlock_at) ? `in ${fmtCountdown(preview.unlock_at)}` : 'soon'}
            </Button>
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {preview.published ? <Badge tone="pos" dot>In marketplace</Badge> : null}
              {preview.website && (
                <a href={preview.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-2xs font-medium text-ink-500 transition-colors hover:border-ink-200 hover:text-ink dark:text-ink-300">
                  <Globe size={10} strokeWidth={1.75} /> {preview.domain || preview.website}
                </a>
              )}
              {preview.vat_number && <Badge tone="neutral">VAT {preview.vat_number}</Badge>}
            </div>
            {preview.summary && (
              <div className="rounded-xl bg-gradient-to-br from-info/[0.07] to-transparent p-[1px]">
                <div className="rounded-[11px] bg-surface px-3.5 py-3">
                  <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Why it's interesting</p>
                  <p className="mt-1 text-sm leading-relaxed">{preview.summary}</p>
                </div>
              </div>
            )}
            {preview.address && (
              <p className="flex items-start gap-2 text-sm text-ink-500 dark:text-ink-300">
                <MapPin size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-300" /> {preview.address}
              </p>
            )}
            {preview.description && (
              <div>
                <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">About</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600 dark:text-ink-200">{preview.description}</p>
              </div>
            )}
            <p className="flex items-center gap-1.5 rounded-xl border border-line bg-ink-50/60 px-3 py-2 text-2xs text-ink-400 dark:bg-transparent">
              <Lock size={11} strokeWidth={2} />
              Contact details unlock for you once you claim this lead.
            </p>
          </div>
        )}
      </Modal>

      {/* Claim confirmation */}
      {user && (
        <ClaimConfirmModal
          open={!!claimTarget}
          lead={claimTarget}
          userName={user.full_name}
          userColor={user.avatar_color}
          userAvatar={user.avatar_url}
          onClose={() => setClaimTarget(null)}
          onDone={() => { setClaimTarget(null); leadsQ.reload() }}
          onConfirm={performClaim}
          onError={(msg) => push({ tone: 'error', title: msg.includes('Already claimed') ? 'Too slow — someone claimed it first' : 'Could not claim', desc: msg })}
        />
      )}
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Market card — module scope so per-second countdown re-renders never
   remount it (a nested component identity replays entrance animations
   on every parent render — the "constant flicker" bug).            */
/* ------------------------------------------------------------------ */
function MarketCard({
  lead, index, isMineReservation, onClaim, onPreview, onMenu,
}: {
  lead: MarketLead
  index: number
  isMineReservation: boolean
  onClaim: () => void
  onPreview: () => void
  onMenu: (e: React.MouseEvent) => void
}) {
  const state = marketLeadState(lead)
  const countdown = state === 'locked' ? fmtCountdown(lead.unlock_at) : null
  const locked = state === 'locked'
  const glow = locked ? 'rgba(245,158,11,0.22)' : isMineReservation ? 'rgba(168,85,247,0.25)' : 'rgba(34,197,94,0.20)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 text-white shadow-glass dark:from-[rgb(30,30,30)] dark:via-[rgb(23,23,23)] dark:to-[rgb(38,38,38)]"
    >
      {/* accent glow + sheen */}
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full blur-3xl" style={{ background: glow }} />
      {!locked && (
        <div
          aria-hidden
          className="sheen-x pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
          style={{ '--sheen-cycle': '10s' } as React.CSSProperties}
        />
      )}

      <div className="relative flex h-full flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {isMineReservation && (
              <span className="rounded-full border border-violet-300/40 bg-violet-400/20 px-2 py-0.5 text-2xs font-bold text-violet-100">
                Reserved for you
              </span>
            )}
            {lead.industry && (
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-2xs font-medium text-white/80">
                {lead.industry}
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onMenu(e as unknown as React.MouseEvent) }}
            title="More actions"
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <MoreVertical size={16} strokeWidth={1.75} />
          </button>
        </div>

        <button onClick={onPreview} className="text-left">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-white">{lead.name}</p>
        </button>

        <div className="mt-1.5 space-y-1 text-2xs text-white/55">
          {lead.address && <p className="truncate">{lead.address}</p>}
          {lead.summary && <p className="line-clamp-2 leading-relaxed text-white/65">{lead.summary}</p>}
        </div>

        <div className="mt-auto pt-3">
          {locked ? (
            <button
              disabled
              className="flex h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-white/70"
            >
              <Lock size={13} strokeWidth={1.75} /> Unlocks in {countdown}
            </button>
          ) : (
            <button
              onClick={onClaim}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-bold text-[rgb(10,10,10)] transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              <Sparkles size={13} strokeWidth={2} /> Claim this lead
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Claim confirmation modal                                            */
/* ------------------------------------------------------------------ */

function ClaimConfirmModal({
  open, lead, userName, userColor, userAvatar, onClose, onDone, onConfirm, onError,
}: {
  open: boolean
  lead: MarketLead | null
  userName: string
  userColor?: string
  userAvatar?: string
  onClose: () => void
  onDone: () => void
  onConfirm: (lead: MarketLead) => Promise<void>
  onError: (message: string) => void
}) {
  const [phase, setPhase] = useState<'idle' | 'working' | 'done'>('idle')

  useEffect(() => {
    if (open) setPhase('idle')
  }, [open])

  /* Close is blocked while working / showing success */
  const requestClose = () => {
    if (phase === 'idle') onClose()
  }

  async function confirm() {
    if (!lead || phase !== 'idle') return
    setPhase('working')
    const startedAt = Date.now()
    try {
      await onConfirm(lead)
    } catch (e: any) {
      onError(e?.message ?? 'Unknown error')
      onClose()
      return
    }
    // Always show at least a 2s working circle before success.
    await sleep(Math.max(0, 2000 - (Date.now() - startedAt)))
    setPhase('done')
    await sleep(1100)
    onDone()
  }

  return (
    <Modal open={open} onClose={requestClose} size="sm">
      {lead && (
        <div className="-m-5 overflow-hidden rounded-2xl">
          {/* Fresh gradient header — emerald wash inside the design system */}
          <div className="relative overflow-hidden px-5 pb-4 pt-5">
            <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-pos/15 via-transparent to-info/10" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-2xs font-bold uppercase tracking-wider text-pos">Confirm claim</p>
                <p className="mt-1 text-lg font-bold leading-tight">{lead.name}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {[lead.industry, lead.address].filter(Boolean).join(' · ') || 'New marketplace lead'}
                </p>
              </div>
              {phase === 'done' ? (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30"
                >
                  <Check size={19} strokeWidth={2.5} />
                </motion.span>
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/25">
                  <Sparkles size={17} strokeWidth={1.75} />
                </span>
              )}
            </div>
          </div>

          <div className="px-5 pb-5">
            {/* New owner row */}
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-ink-50 to-transparent p-3 dark:from-[rgb(28,28,28)] dark:to-transparent">
              <Avatar name={userName} color={userColor} url={userAvatar} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Becomes the new owner</p>
                <p className="truncate text-sm font-semibold">{userName}</p>
              </div>
            </div>

            <p className="mt-3 text-2xs leading-relaxed text-ink-400">
              The lead lands in your Leads page instantly and leaves the marketplace. Contact details become visible to you and admins.
            </p>

            {/* Footer / states */}
            {phase === 'done' ? (
              <p className="num mt-4 rounded-xl bg-posBg py-3 text-center text-sm font-bold text-pos ring-1 ring-inset ring-pos/15">
                ✓ Claim successful!
              </p>
            ) : phase === 'working' ? (
              <div className="mt-4 flex items-center justify-center gap-2.5 rounded-xl bg-ink-50 py-3 dark:bg-[rgb(26,26,26)]">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink" />
                <span className="text-sm font-medium text-ink-500 dark:text-ink-300">Claiming your lead…</span>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" block onClick={onClose}>Cancel</Button>
                <Button block icon={<Sparkles size={15} strokeWidth={1.75} />} onClick={() => void confirm()}>
                  Confirm claim
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function fmtCountdown(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}
