import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { geoNaturalEarth1, geoCentroid, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'
import worldData from 'world-atlas/countries-110m.json'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { PageContainer } from '../components/layout/AppShell'
import { Card, CardHeader } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Crosshair } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { eur } from '../lib/format'
import { aggregateCountries, type GeoDealInput, type GeoLeadInput } from '../lib/geo'

/**
 * World map — Apple-clock-style flat planet showing where the book of
 * business lives. Countries tint by lead saturation; pulsing dots mark
 * deal activity. Drag to pan (great on phones), click a country for a
 * full drill-down breakdown.
 */

const WIDTH = 960
const HEIGHT = 500
const MAX_PAN = 260 // px of horizontal travel in either direction

interface WorldFeature extends Feature<Geometry> {
  id?: string | number
  properties: { name?: string }
}

const world = worldData as unknown as Topology<{ countries: GeometryCollection }>
const countries = feature(world, world.objects.countries).features as WorldFeature[]

const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [WIDTH - 8, HEIGHT - 8],
  ],
  { type: 'Sphere' },
)
const pathGen = geoPath(projection)

export default function MapPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const containerRef = useRef<HTMLDivElement>(null)

  /* Pan state — pointer drag moves the map horizontally */
  const [panX, setPanX] = useState(0)
  const panState = useRef<{ active: boolean; startX: number; startPan: number; moved: boolean }>({
    active: false, startX: 0, startPan: 0, moved: false,
  })

  /* Drill-down */
  const [drill, setDrill] = useState<string | null>(null)

  /* Hover tooltip */
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)

  const { data, loading } = useAsync(async () => {
    const [companies, deals] = await Promise.all([db.listCompanies(), db.listDeals()])
    return { companies, deals }
  }, [])

  const scoped = useMemo(() => {
    if (!data) return null
    const companies = isAdmin || !user ? data.companies : data.companies.filter((c) => c.created_by === user.id)
    const deals = isAdmin || !user ? data.deals : data.deals.filter((d) => d.seller_id === user.id && (d.status === 'approved' || d.status === 'closed'))
    return { companies, deals }
  }, [data, isAdmin, user?.id])

  const geo = useMemo(() => {
    if (!scoped) return null
    const countedDeals = scoped.deals.filter((d) => d.status === 'approved' || d.status === 'closed')
    const companyIdByName = new Map<string, string>()
    for (const c of scoped.companies) {
      const norm = (c.name || '').toLowerCase().trim()
      if (norm) companyIdByName.set(norm, c.id)
    }
    const leadItems: GeoLeadInput[] = scoped.companies.map((c) => ({
      key: c.id,
      // Structured country/city dominate the match; the rest is fallback.
      text: `${(c as { country?: string }).country || ''} ${(c as { city?: string }).city || ''} ${c.name} ${c.address} ${c.website} ${c.domain}`,
      id: c.id,
      name: c.name || 'Untitled lead',
      address: [(c as { city?: string }).city, (c as { country?: string }).country].filter(Boolean).join(', ') || c.address || '',
      city: (c as { city?: string }).city || '',
      services: (c as { services_offered?: string }).services_offered || '',
    }))
    const dealItems: GeoDealInput[] = countedDeals.map((d) => {
      const linkedCompanyId = companyIdByName.get((d.company || '').toLowerCase().trim())
      return {
        key: linkedCompanyId ?? `deal-${d.id}`,
        text: `${d.company} ${d.website}`,
        value: d.gross_value,
        id: d.id,
        company: d.company || 'Untitled deal',
        status: d.status,
      }
    })
    return aggregateCountries(leadItems, dealItems)
  }, [scoped])

  const statsByCountry = geo?.stats ?? new Map()
  const totalLeads = [...statsByCountry.values()].reduce((s, c) => s + c.leads, 0)
  const totalDeals = [...statsByCountry.values()].reduce((s, c) => s + c.deals, 0)
  const maxLeads = Math.max(...[...statsByCountry.values()].map((c) => c.leads), 1)
  const topCountries = [...statsByCountry.values()].sort((a, b) => b.leads + b.deals - (a.leads + a.deals)).slice(0, 8)

  function intensity(name: string | undefined): number {
    if (!name) return 0
    const s = statsByCountry.get(name)
    return s ? s.leads / maxLeads : 0
  }

  /* ---- Pan handlers ---- */
  function onPointerDown(e: React.PointerEvent) {
    panState.current = { active: true, startX: e.clientX, startPan: panX, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!panState.current.active) return
    const dx = e.clientX - panState.current.startX
    if (Math.abs(dx) > 4) panState.current.moved = true
    setPanX(Math.max(-MAX_PAN, Math.min(MAX_PAN, panState.current.startPan + dx)))
  }
  function onPointerUp() {
    panState.current.active = false
  }

  function openDrill(name: string) {
    if (panState.current.moved) return // it was a drag, not a click
    if (!statsByCountry.has(name)) return
    setDrill(name)
  }

  const drillStats = drill ? statsByCountry.get(drill) : undefined
  const drillLeads = drill ? geo?.leadsByCountry.get(drill) ?? [] : []
  const drillDeals = drill ? geo?.dealsByCountry.get(drill) ?? [] : []

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">World Map</h1>
          <p className="mt-1 text-sm text-ink-400">
            {isAdmin ? 'Global saturation of leads & deals across the platform.' : 'Where your leads and deals live around the globe.'}
            {' '}Drag to explore · tap a country for details.
          </p>
        </div>
        <button
          onClick={() => setPanX(0)}
          title="Recenter map"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium transition-colors hover:bg-ink-50"
        >
          <Crosshair size={13} strokeWidth={1.75} /> Recenter
        </button>
      </div>

      {/* Stat chips */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
        <Chip label="Countries" value={String(statsByCountry.size)} tone="#3b82f6" delay={0} />
        <Chip label="Leads mapped" value={String(totalLeads)} tone="#8b5cf6" delay={0.05} />
        <Chip label="Won deals" value={String(totalDeals)} tone="#22c55e" delay={0.1} />
        <Chip label="Mapped revenue" value={eur([...statsByCountry.values()].reduce((s, c) => s + c.revenue, 0))} tone="#f59e0b" delay={0.15} />
      </div>

      <Card className="min-w-0">
        <CardHeader title="Lead saturation" desc="Darker countries hold more leads · pulsing dots mark won-deal activity" />
        {loading ? (
          <Skeleton className="h-[300px] w-full rounded-xl sm:h-[420px]" />
        ) : (
          <div
            ref={containerRef}
            className={`relative touch-pan-y overflow-hidden rounded-xl border border-line bg-ink-50/40 dark:bg-transparent ${panState.current.active ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <motion.div animate={{ x: panX }} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-auto w-full min-w-[680px] select-none"
                role="img"
                aria-label="World map of lead saturation"
              >
                <defs>
                  <radialGradient id="dealDot" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.25" />
                  </radialGradient>
                </defs>
                <g>
                  {countries.map((f, i) => {
                    const t = intensity(f.properties?.name)
                    const fill = t > 0 ? `rgba(59,130,246,${0.12 + t * 0.55})` : undefined
                    const hasData = !!f.properties?.name && statsByCountry.has(f.properties.name)
                    return (
                      <motion.path
                        key={f.id ?? i}
                        d={pathGen(f) || ''}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: Math.min(i * 0.004, 0.5) }}
                        className={`stroke-line dark:stroke-[rgb(38,38,38)] ${fill ? '' : 'fill-ink-100 dark:fill-[rgb(24,24,24)]'} ${hasData ? 'cursor-pointer' : ''} transition-[fill] duration-300 hover:brightness-125`}
                        style={fill ? { fill } : undefined}
                        strokeWidth={0.4}
                        onClick={() => f.properties?.name && openDrill(f.properties.name)}
                        onMouseEnter={(e) => {
                          const name = f.properties?.name
                          const s = name ? statsByCountry.get(name) : undefined
                          if (!s || (s.leads === 0 && s.deals === 0)) return
                          const rect = containerRef.current?.getBoundingClientRect()
                          setHover({ name: name!, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) })
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                    )
                  })}
                </g>
                {/* Deal activity dots */}
                <g pointerEvents="none">
                  {[...statsByCountry.values()]
                    .filter((s) => s.deals > 0)
                    .map((s) => {
                      const f = countries.find((c) => c.properties?.name === s.country)
                      if (!f) return null
                      const [cx, cy] = geoCentroid(f)
                      const projected = projection([cx, cy])
                      if (!projected) return null
                      const r = 3 + Math.sqrt(s.deals) * 2.2
                      return (
                        <g key={s.country} transform={`translate(${projected[0]},${projected[1]})`}>
                          <circle r={r} fill="url(#dealDot)" stroke="#10b981" strokeWidth={0.6} />
                          <circle
                            r={r}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth={1}
                            className="status-ring"
                            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                          />
                        </g>
                      )
                    })}
                </g>
              </svg>
            </motion.div>

            {/* Hover tooltip */}
            {hover && !drill && (
              <div
                className="pointer-events-none absolute z-20 rounded-lg border border-line bg-surface px-3 py-2 shadow-glass"
                style={{
                  left: Math.max(8, Math.min(hover.x - 60, (containerRef.current?.clientWidth ?? 400) - 150)),
                  top: hover.y + 14,
                }}
              >
                <p className="text-xs font-bold">{prettyName(hover.name)}</p>
                <p className="num mt-0.5 text-2xs text-ink-400">
                  {statsByCountry.get(hover.name)?.leads} leads · {statsByCountry.get(hover.name)?.deals} deals
                </p>
                <p className="mt-0.5 text-2xs font-medium text-info">Tap for details</p>
              </div>
            )}

            {/* Legend */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[92%] flex-wrap items-center gap-x-2 gap-y-1 rounded-full glass px-3 py-1.5 text-2xs text-ink-500 dark:text-ink-300">
              <span>Fewer</span>
              <span className="inline-block h-2 w-16 sm:w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.12), rgba(59,130,246,0.67))' }} />
              <span>More leads</span>
              <span className="mx-1 h-3 w-px bg-line" />
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Won deals</span>
            </div>
          </div>
        )}
      </Card>

      {/* Regional ranking */}
      {!loading && topCountries.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Top regions" desc="Tap to inspect · ranked by combined footprint" />
            <div className="space-y-2.5">
              {topCountries.map((s, i) => {
                const score = s.leads + s.deals
                const max = topCountries[0].leads + topCountries[0].deals || 1
                return (
                  <button key={s.country} onClick={() => setDrill(s.country)} className="block w-full text-left">
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="num w-4 text-2xs font-bold text-ink-300">{i + 1}</span>
                        {prettyName(s.country)}
                      </span>
                      <span className="num shrink-0 text-2xs text-ink-400">
                        {s.leads} leads · {s.deals} deals{s.revenue > 0 ? ` · ${eur(s.revenue)}` : ''}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(score / max) * 100}%` }}
                        transition={{ duration: 0.9, delay: 0.2 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-sky-500/80 to-blue-400"
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="How this works" desc="Geography is detected automatically" />
            <div className="space-y-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              <p>• Country detection scans each lead's name, address and website — country names, city hints and domains like <span className="num">.de</span> or <span className="num">.fr</span>.</p>
              <p>• Won deals inherit their lead's geography when the deal itself doesn't mention one.</p>
              <p>• {isAdmin ? 'You are viewing every member’s footprint.' : 'You are viewing your own book of business.'}</p>
              <p className="text-2xs text-ink-400">Tip: keep the address field tidy for sharper mapping.</p>
            </div>
          </Card>
        </div>
      )}

      {/* Country drill-down modal */}
      <Modal open={!!drill} onClose={() => setDrill(null)} size="md" title={drill ? prettyName(drill) : ''} desc="Regional breakdown of your book of business">
        {drillStats ? (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Leads" value={String(drillStats.leads)} tone="#8b5cf6" />
              <MiniStat label="Won deals" value={String(drillStats.deals)} tone="#22c55e" />
              <MiniStat label="Revenue" value={eur(drillStats.revenue)} tone="#f59e0b" />
            </div>

            {drillLeads.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-2xs font-bold uppercase tracking-wider text-ink-400">Leads · {drillLeads.length}</p>
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {drillLeads.map((l) => (
                    <li key={l.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="truncate text-2xs text-ink-400">{l.address || '—'}</p>
                      {l.services && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.services.split(',').slice(0, 4).map((s) => (
                            <span key={s} className="rounded-full border border-info/25 bg-infoBg px-2 py-0.5 text-[9px] font-semibold capitalize text-info">{s.trim()}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {drillDeals.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-2xs font-bold uppercase tracking-wider text-ink-400">Won deals · {drillDeals.length}</p>
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {drillDeals.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <Badge tone={d.status === 'closed' ? 'pos' : 'info'} dot>{d.status}</Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">{d.company}</span>
                      <span className="num shrink-0 font-bold">{eur(d.value)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {drillLeads.length === 0 && drillDeals.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">No records detected in this region yet.</p>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-ink-400">No records detected here.</p>
        )}
      </Modal>
    </PageContainer>
  )
}

function prettyName(name: string): string {
  return name.replace(/\./g, '')
}

function Chip({ label, value, tone, delay }: { label: string; value: string; tone: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }} className="liquid-tile">
      {/* tone gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(150deg, ${tone}30 0%, transparent 52%), radial-gradient(120% 90% at 100% 100%, ${tone}1c 0%, transparent 62%)` }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="relative px-3.5 py-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <p className="num text-base font-extrabold" style={{ color: tone }}>{value}</p>
      </div>
    </motion.div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="liquid-tile">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(150deg, ${tone}30 0%, transparent 52%)` }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="relative px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <p className="num text-sm font-extrabold" style={{ color: tone }}>{value}</p>
      </div>
    </div>
  )
}
