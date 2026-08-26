import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Landmark, Snowflake, ArrowUpRight, Wallet,
  CreditCard, TrendingUp, PiggyBank, Wifi, Copy, Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import {
  bankCardBalance, cardGradient, maskCardNumber, formatCardNumber,
  BANK_SPEND_CATEGORY_META,
} from '../lib/types'
import type { BankCard, BankTransaction } from '../lib/types'
import { eur } from '../lib/format'

const WINDOWS: Record<string, { label: string; ms: number; fmt: (t: number) => string }> = {
  '1D': { label: '1D', ms: 86400000, fmt: (t) => new Date(t).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) },
  '7D': { label: '7D', ms: 7 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { weekday: 'short' }) },
  '1M': { label: '1M', ms: 30 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }) },
  '3M': { label: '3M', ms: 90 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }) },
  '1Y': { label: '1Y', ms: 365 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { month: 'short' }) },
}

export default function Bank() {
  const { user } = useAuth()
  const cardsQ = useAsync(async () => (user ? db.listBankCardsForUser(user.id) : []), [user?.id])
  const designQ = useAsync(async () => db.getDesignSettings(), [])
  const logoDark = designQ.data?.logo_url_dark || ''
  const [txs, setTxs] = useState<BankTransaction[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [range, setRange] = useState<keyof typeof WINDOWS>('1M')

  const cards = cardsQ.data || []

  useEffect(() => {
    if (!user || cards.length === 0) { setTxs([]); return }
    void db.listBankTransactions(cards.map((c) => c.id)).then(setTxs)
  }, [user, cards.map((c) => c.id).join('|')])

  useEffect(() => {
    if (cards.length > 0 && (!activeId || !cards.some((c) => c.id === activeId))) {
      setActiveId(cards[0].id)
    }
  }, [cards, activeId])

  const txsByCard = useMemo(() => {
    const m: Record<string, BankTransaction[]> = {}
    txs.forEach((t) => { (m[t.card_id] ??= []).push(t) })
    return m
  }, [txs])

  const active = cards.find((c) => c.id === activeId) ?? cards[0] ?? null
  const activeTxs = active ? txsByCard[active.id] || [] : []
  const activeBalance = active ? bankCardBalance(active, activeTxs) : 0

  const win = WINDOWS[range]
  const windowStart = Date.now() - win.ms
  const inWindow = activeTxs.filter((t) => new Date(t.occurred_at).getTime() >= windowStart)

  /* Balance curve — real transactions only */
  const chartData = useMemo(() => {
    if (!active) return []
    const all = [...activeTxs].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    const balAt = (t: number) =>
      all.reduce((b, tx) => (new Date(tx.occurred_at).getTime() <= t ? (tx.kind === 'topup' ? b + tx.amount : b - tx.amount) : b), active.initial_balance || 0)
    const pts: { t: number; v: number; label: string }[] = []
    pts.push({ t: windowStart, v: balAt(windowStart), label: win.fmt(windowStart) })
    for (const tx of inWindow) {
      const t = new Date(tx.occurred_at).getTime()
      pts.push({ t, v: balAt(t), label: win.fmt(t) })
    }
    pts.push({ t: Date.now(), v: activeBalance, label: win.fmt(Date.now()) })
    return pts
  }, [active, activeTxs, activeBalance, windowStart, win, inWindow])

  const first = chartData[0]?.v ?? 0
  const deltaPct = first !== 0 ? ((activeBalance - first) / Math.abs(first)) * 100 : 0

  /* Daily Spent (period = selected window) */
  const spends = inWindow.filter((t) => t.kind === 'spend')
  const topupsSum = inWindow.filter((t) => t.kind === 'topup').reduce((s, t) => s + t.amount, 0)
  const spendsSum = spends.reduce((s, t) => s + t.amount, 0)
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {}
    spends.forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount })
    return Object.entries(m)
      .map(([key, amount]) => ({ key, amount, pct: spendsSum > 0 ? Math.round((amount / spendsSum) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [spends, spendsSum])
  const topSource = byCategory[0]
  const savingsRate = topupsSum > 0 ? Math.round(((topupsSum - spendsSum) / topupsSum) * 100) : null

  const totalBalance = cards.reduce((s, c) => s + bankCardBalance(c, txsByCard[c.id] || []), 0)

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Bank
            <Landmark size={20} strokeWidth={1.75} className="text-amber-500" />
          </h1>
          <p className="mt-1 text-sm text-ink-400">Your issued cards, balances and spending at a glance.</p>
        </div>
        <div className="liquid-tile">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(150deg, rgba(245,158,11,0.30) 0%, transparent 52%), radial-gradient(120% 90% at 100% 100%, rgba(245,158,11,0.18) 0%, transparent 62%)' }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="relative px-4 py-2 text-right">
            <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">Total across cards</p>
            <p className="num text-lg font-extrabold text-amber-500 dark:text-amber-400">{eur(totalBalance)}</p>
          </div>
        </div>
      </div>

      {cardsQ.loading ? (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <div className="space-y-5"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
              <CreditCard size={24} strokeWidth={1.75} />
            </span>
            <p className="text-base font-semibold">No cards yet</p>
            <p className="max-w-sm text-sm text-ink-400">
              When HQ issues you a virtual card it appears here with its balance, ledger and spending insights.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          {/* ── Left: card stack ── */}
          <div className="space-y-5">
            <div className="relative h-[248px] select-none">
              {/* stacked ghosts */}
              {cards.slice(0, 3).map((c, i) => {
                if (c.id === activeId) return null
                const g = cardGradient(c.gradient)
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className="absolute left-0 right-0 rounded-2xl border border-white/10 shadow-lg transition-all hover:-translate-y-1"
                    style={{
                      top: i * 14,
                      height: 190,
                      zIndex: 5 - i,
                      transform: `scale(${1 - i * 0.03})`,
                      background: `linear-gradient(140deg, ${g.from}, ${g.to})`,
                      opacity: 0.85,
                    }}
                    title={`Switch to ${c.holder_name || 'card'}`}
                  >
                    <span className="absolute left-4 top-3.5 flex items-center">
                      {logoDark ? (
                        <img src={logoDark} alt="Calista Concept" className="h-4 w-auto max-w-[110px] object-contain opacity-90" />
                      ) : (
                        <span className="text-2xs font-bold uppercase tracking-[0.18em] text-white/60">Calista Bank</span>
                      )}
                    </span>
                  </button>
                )
              })}
              {/* front card */}
              {active && (
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-0 right-0 top-[42px] z-10 h-[190px] overflow-hidden rounded-2xl p-4 text-white shadow-2xl"
                  style={{ background: `linear-gradient(140deg, ${cardGradient(active.gradient).from}, ${cardGradient(active.gradient).to})` }}
                >
                  <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
                  <div aria-hidden className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-black/20 blur-2xl" />
                  {active.frozen && (
                    <div className="absolute inset-0 z-20 grid place-items-center bg-slate-900/55 backdrop-blur-[3px]">
                      <span className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] backdrop-blur">
                        <Snowflake size={14} strokeWidth={2.5} /> Frozen
                      </span>
                    </div>
                  )}
                  <div className="relative flex items-start justify-between">
                    <div>
                      {logoDark ? (
                        <img src={logoDark} alt="Calista Concept" className="h-5 w-auto max-w-[130px] object-contain" />
                      ) : (
                        <>
                          <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/65">Calista Bank</p>
                          <p className="mt-0.5 text-sm font-bold">{active.holder_name || 'Card holder'}</p>
                        </>
                      )}
                      {logoDark && <p className="mt-1 text-xs font-semibold text-white/85">{active.holder_name || 'Card holder'}</p>}
                    </div>
                    <Wifi size={18} strokeWidth={2} className="rotate-90 text-white/70" />
                  </div>
                  <p className="num mt-6 text-base font-bold tracking-[0.14em] text-white/95 sm:text-lg">{formatCardNumber(active.card_number)}</p>
                  <div className="mt-1 flex items-end justify-between">
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wider text-white/60">Available balance</p>
                      <p className="num text-2xl font-extrabold">{eur(activeBalance)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-2xs text-white/80">{active.expiry || '—'} · CVV {active.cvv || '—'}</p>
                      <p className="text-sm font-black uppercase italic tracking-wider text-white/90">{active.brand}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            {active?.frozen && (
              <p className="rounded-xl border border-info/25 bg-infoBg px-3 py-2 text-2xs text-info">
                This card is frozen by HQ — spending is paused until it's unfrozen.
              </p>
            )}

            {/* Accounts overview */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Accounts overview</h3>
                <TrendingUp size={15} strokeWidth={1.75} className="text-ink-300" />
              </div>
              <div className="space-y-1.5">
                {cards.map((c) => {
                  const t = txsByCard[c.id] || []
                  const bal = bankCardBalance(c, t)
                  const g = cardGradient(c.gradient)
                  const net30 = t
                    .filter((x) => new Date(x.occurred_at).getTime() >= Date.now() - 30 * 86400000)
                    .reduce((s, x) => s + (x.kind === 'topup' ? x.amount : -x.amount), 0)
                  const pct = bal !== 0 ? (net30 / Math.max(Math.abs(bal) - Math.abs(net30), 1)) * 100 : 0
                  const isActiveRow = c.id === activeId
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isActiveRow ? 'border-amber-400/40 bg-amber-400/10' : 'border-line hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]'
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(140deg, ${g.from}, ${g.to})` }}>
                        <CreditCard size={15} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.holder_name || 'Card'}</p>
                        <p className="num text-2xs text-ink-400">{maskCardNumber(c.card_number)}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-bold">{eur(bal)}</p>
                        {net30 !== 0 && (
                          <p className={`num text-2xs font-semibold ${net30 > 0 ? 'text-pos' : 'text-neg'}`}>
                            {net30 > 0 ? '▲' : '▼'} {Math.abs(Math.round(pct))}%
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* ── Right: insights + chart ── */}
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              {/* Daily spent */}
              <Card>
                <div className="mb-1 flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold">Daily spent</h3>
                    <p className="text-2xs text-ink-400">Track spending across {win.label.toLowerCase()} window</p>
                  </div>
                  <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-bold text-ink-400">{win.label}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {byCategory.slice(0, 3).map((c, i) => {
                    const colors = ['#22c55e', '#f59e0b', '#ef4444']
                    return (
                      <motion.span
                        key={c.key}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        className="grid h-12 w-12 place-items-center rounded-xl text-white shadow-md"
                        style={{ background: `linear-gradient(160deg, ${colors[i]}, ${colors[i]}aa)` }}
                      >
                        <span className="text-[11px] font-black leading-none">{c.pct}%</span>
                      </motion.span>
                    )
                  })}
                  {byCategory.length === 0 && <p className="text-2xs text-ink-300">No spending in this window.</p>}
                </div>

                <div className="mt-4 space-y-1.5">
                  {byCategory.map((c) => (
                    <div key={c.key} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-500">
                        <Wallet size={13} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold capitalize">{BANK_SPEND_CATEGORY_META[c.key as keyof typeof BANK_SPEND_CATEGORY_META]?.label ?? c.key}</p>
                        <p className="num text-2xs text-ink-400">{eur(c.amount)}</p>
                      </div>
                      <span className="num shrink-0 text-2xs font-bold text-ink-400">{c.pct}%</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-line p-3">
                    <p className="flex items-center gap-1 text-2xs font-bold text-neg"><ArrowUpRight size={11} strokeWidth={2.25} /> Top source</p>
                    <p className="mt-1 truncate text-xs font-bold capitalize">{topSource ? BANK_SPEND_CATEGORY_META[topSource.key as keyof typeof BANK_SPEND_CATEGORY_META]?.label ?? topSource.key : '—'}</p>
                    <p className="num text-2xs text-ink-400">{topSource ? `${Math.round(topSource.pct)}% of spend` : 'No spend yet'}</p>
                  </div>
                  <div className="rounded-xl border border-line p-3">
                    <p className="flex items-center gap-1 text-2xs font-bold text-pos"><PiggyBank size={11} strokeWidth={2.25} /> Savings rate</p>
                    <p className="mt-1 text-xs font-bold">{savingsRate == null ? '—' : `${savingsRate}%`}</p>
                    <p className="text-2xs text-ink-400">{savingsRate == null ? 'No top-ups yet' : savingsRate >= 20 ? 'Great job!' : 'Keep it up'}</p>
                  </div>
                </div>
              </Card>

              {/* Quick card facts */}
              <Card>
                <div className="mb-1 flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold">Card facts</h3>
                    <p className="text-2xs text-ink-400">Everything on the selected card</p>
                  </div>
                  <CreditCard size={15} strokeWidth={1.75} className="text-ink-300" />
                </div>
                {active && (
                  <div className="mt-3 space-y-2">
                    <CopyRow label="Card number" value={formatCardNumber(active.card_number)} mono />
                    <CopyRow label="Expiry" value={active.expiry || '—'} mono copy={active.expiry} />
                    <CopyRow label="CVV" value={active.cvv || '—'} mono copy={active.cvv} />
                    <FactRow label="Brand" value={active.brand.toUpperCase()} />
                    <FactRow label="Status" value={active.frozen ? 'Frozen' : 'Active'} />
                    <FactRow label="Transactions" value={String(activeTxs.length)} mono />
                    <FactRow label="Spent all-time" value={eur(activeTxs.filter((t) => t.kind === 'spend').reduce((s, t) => s + t.amount, 0))} mono />
                    <FactRow label="Topped-up all-time" value={eur(activeTxs.filter((t) => t.kind === 'topup').reduce((s, t) => s + t.amount, 0))} mono />
                    <p className="pt-1 text-2xs leading-relaxed text-ink-400">
                      Use these details at checkout — everything on this card is yours to spend online.
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Balance chart */}
            <Card>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="num text-3xl font-extrabold tracking-tight">
                    {eur(activeBalance)}
                    <span className="ml-2 text-xs font-semibold text-ink-400">EUR</span>
                  </p>
                  {chartData.length > 1 && (
                    <p className={`num mt-0.5 text-xs font-bold ${deltaPct >= 0 ? 'text-pos' : 'text-neg'}`}>
                      {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(2)}% this {range.toLowerCase()}
                    </p>
                  )}
                </div>
                <div className="glass-tabs flex gap-1 rounded-full p-1">
                  {Object.keys(WINDOWS).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRange(k as keyof typeof WINDOWS)}
                      className={`relative rounded-full px-3 py-1.5 text-2xs font-bold transition-colors ${
                        range === k ? 'text-white' : 'text-ink-400 hover:text-ink dark:hover:text-white'
                      }`}
                    >
                      {range === k && (
                        <motion.span
                          layoutId="bank-range"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600"
                        />
                      )}
                      <span className="relative">{k}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                    <defs>
                      <linearGradient id="bankFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'rgb(var(--ink-400))' }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'rgb(var(--ink-400))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => eur(v as number).replace('€', '')}
                    />
                    <Tooltip
                      cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3 3' }}
                      contentStyle={{
                        background: 'var(--glass-strong-bg)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid var(--glass-strong-border)',
                        borderRadius: 12,
                        fontSize: 12,
                        color: 'rgb(var(--ink))',
                      }}
                      formatter={(v: number) => [eur(v), 'Balance']}
                    />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      fill="url(#bankFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#f59e0b' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function FactRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`truncate text-sm font-bold ${mono ? 'num' : ''}`}>{value}</p>
    </div>
  )
}

/** Fact row with a one-tap copy button — built for online checkouts. */
function CopyRow({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  const [copied, setCopied] = useState(false)
  const text = copy ?? value
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <div className="flex min-w-0 items-center gap-2">
        <p className={`truncate text-sm font-bold ${mono ? 'num' : ''}`}>{value}</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          title={`Copy ${label.toLowerCase()}`}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${copied ? 'bg-posBg text-pos' : 'text-ink-300 hover:bg-ink-50 hover:text-ink dark:hover:bg-[rgb(28,28,28)]'}`}
        >
          {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}
