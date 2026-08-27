import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Landmark, Snowflake, ArrowUpRight, Wallet,
  CreditCard, TrendingUp, PiggyBank, Wifi, Copy, Check, CheckCheck,
  Coins, Gift, Repeat, Trophy, Star,
} from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks/useAsync'
import { db } from '../lib/db'
import { PageContainer } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Field } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { CreditsCoin } from '../components/CreditsBadge'
import { useCreditBalance, useCreditLeaderboard } from '../lib/hooks/useCreditBalance'
import {
  bankCardBalance, cardGradient, formatCardNumber,
} from '../lib/types'
import type { BankCard, BankTransaction, RedeemItem, Redemption } from '../lib/types'
import { eur } from '../lib/format'

const WINDOWS: Record<string, { label: string; ms: number; fmt: (t: number) => string }> = {
  '1D': { label: '1D', ms: 86400000, fmt: (t) => new Date(t).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) },
  '7D': { label: '7D', ms: 7 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { weekday: 'short' }) },
  '1M': { label: '1M', ms: 30 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }) },
  '3M': { label: '3M', ms: 90 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }) },
  '1Y': { label: '1Y', ms: 365 * 86400000, fmt: (t) => new Date(t).toLocaleDateString('en', { month: 'short' }) },
}

type Tab = 'cards' | 'redeem'

export default function Bank() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('cards')
  const cardsQ = useAsync(async () => (user ? db.listBankCardsForUser(user.id) : []), [user?.id])
  const shopQ = useAsync(async () => db.listRedeemItems(), [])
  const rdsQ = useAsync(async () => (user ? db.listRedemptions(user.id) : []), [user?.id])
  const designQ = useAsync(async () => db.getDesignSettings(), [])
  const credit = useCreditBalance()
  const leaderboard = useCreditLeaderboard()

  const logoDark = designQ.data?.logo_url_dark || ''
  const [txs, setTxs] = useState<BankTransaction[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [range, setRange] = useState<keyof typeof WINDOWS>('1M')

  const cards = cardsQ.data || []

  useEffect(() => {
    if (!user || cards.length === 0) { setTxs([]); return }
    void db.listBankTransactions(cards.map((c) => c.id)).then(setTxs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => c.id).join('|')])

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

  /* Points curve — real transactions only */
  const chartData = useMemo(() => {
    if (!active) return []
    const all = [...activeTxs].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    const balAt = (t: number) =>
      all.reduce((b, tx) => (new Date(tx.occurred_at).getTime() <= t ? (tx.kind === 'topup' ? b + tx.amount : b - tx.amount) : b), active.initial_balance || 0)
    const pts: { t: number; v: number; label: string }[] = [{ t: windowStart, v: balAt(windowStart), label: win.fmt(windowStart) }]
    for (const tx of inWindow) {
      const t = new Date(tx.occurred_at).getTime()
      pts.push({ t, v: balAt(t), label: win.fmt(t) })
    }
    pts.push({ t: Date.now(), v: activeBalance, label: win.fmt(Date.now()) })
    return pts
  }, [active, activeTxs, activeBalance, windowStart, win, inWindow])

  const first = chartData[0]?.v ?? 0
  const deltaPct = first !== 0 ? ((activeBalance - first) / Math.abs(first)) * 100 : 0

  const totalPoints = cards.reduce((s, c) => s + bankCardBalance(c, txsByCard[c.id] || []), 0)

  const loading = cardsQ.loading || shopQ.loading
  const shopItems = (shopQ.data || []).filter((i) => i.active)
  const featuredFirst = [...shopItems].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))

  function refreshAll() {
    credit.reload()
    rdsQ.reload()
    if (!user) return
    void db.listBankCardsForUser(user.id).then((cs) => {
      if (cs.length) void db.listBankTransactions(cs.map((c) => c.id)).then(setTxs)
    })
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Redeem Cards
            <Landmark size={20} strokeWidth={1.75} className="text-amber-500" />
          </h1>
          <p className="mt-1 text-sm text-ink-400">Your point wallets, CC Credits and the rewards shop.</p>
        </div>
        {/* Available credits — liquid glass */}
        <div className="liquid-tile">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(150deg, rgba(245,158,11,0.30) 0%, transparent 52%), radial-gradient(120% 90% at 100% 100%, rgba(245,158,11,0.18) 0%, transparent 62%)' }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <button onClick={() => setTab('redeem')} className="relative flex items-center gap-2.5 px-4 py-2">
            <CreditsCoin size={26} logo={logoDark} />
            <span className="text-left">
              <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-400">Available credits</span>
              <span className="num block text-lg font-extrabold leading-none text-amber-500 dark:text-amber-400">{Math.round(credit.balance).toLocaleString('en')} cc</span>
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass-tabs mb-5 inline-flex gap-1 rounded-full p-1">
        {([['cards', 'My cards'], ['redeem', 'Redeem']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative rounded-full px-5 py-2 text-xs font-bold transition-colors ${tab === k ? 'text-white' : 'text-ink-500 hover:text-ink dark:text-white/60 dark:hover:text-white'}`}
          >
            {tab === k && (
              <motion.span
                layoutId="bank-tab"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
      ) : tab === 'cards' ? (
        cards.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
                <CreditCard size={24} strokeWidth={1.75} />
              </span>
              <p className="text-base font-semibold">No point cards yet</p>
              <p className="max-w-sm text-sm text-ink-400">When HQ issues you a card it appears here. Collect points on it and convert them into CC Credits for the shop.</p>
            </div>
          </Card>
        ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          {/* ── Left: card stack ── */}
          <div className="space-y-5">
            <div className="relative h-[248px] select-none">
              {cards.slice(0, 3).map((c, i) => {
                if (c.id === activeId) return null
                const g = cardGradient(c.gradient)
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className="absolute left-0 right-0 rounded-2xl border border-white/10 shadow-lg transition-all hover:-translate-y-1"
                    style={{ top: i * 14, height: 190, zIndex: 5 - i, transform: `scale(${1 - i * 0.03})`, background: `linear-gradient(140deg, ${g.from}, ${g.to})`, opacity: 0.85 }}
                  >
                    <span className="absolute left-4 top-3.5 flex items-center">
                      {logoDark ? <img src={logoDark} alt="" className="h-4 w-auto max-w-[110px] object-contain opacity-90" /> : <span className="text-2xs font-bold uppercase tracking-[0.18em] text-white/60">Calista Bank</span>}
                    </span>
                  </button>
                )
              })}
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
                        <img src={logoDark} alt="" className="h-5 w-auto max-w-[130px] object-contain" />
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
                      <p className="text-2xs font-semibold uppercase tracking-wider text-white/60">Point balance</p>
                      <p className="num text-2xl font-extrabold">{Math.round(activeBalance).toLocaleString('en')} pts</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-2xs text-white/80">{active.expiry || '—'} · CVV {active.cvv || '—'}</p>
                      <p className="text-sm font-black uppercase italic tracking-wider text-white/90">{active.brand}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Convert points → credits */}
            <ConvertCard active={active} balance={activeBalance} disabled={!!active?.frozen} onConverted={refreshAll} />

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
                  const net30 = t.filter((x) => new Date(x.occurred_at).getTime() >= Date.now() - 30 * 86400000).reduce((s, x) => s + (x.kind === 'topup' ? x.amount : -x.amount), 0)
                  const pct = bal !== 0 ? (net30 / Math.max(Math.abs(bal) - Math.abs(net30), 1)) * 100 : 0
                  return (
                    <button key={c.id} onClick={() => setActiveId(c.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${c.id === activeId ? 'border-amber-400/40 bg-amber-400/10' : 'border-line hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]'}`}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(140deg, ${g.from}, ${g.to})` }}>
                        <CreditCard size={15} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.holder_name || 'Card'}</p>
                        <p className="num text-2xs text-ink-400">{maskShort(c.card_number)}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-bold">{Math.round(bal).toLocaleString('en')} pts</p>
                        {net30 !== 0 && <p className={`num text-2xs font-semibold ${net30 > 0 ? 'text-pos' : 'text-neg'}`}>{net30 > 0 ? '▲' : '▼'} {Math.abs(Math.round(pct))}%</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* ── Right ── */}
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Card>
                <div className="mb-1"><h3 className="text-base font-bold">Daily earned</h3><p className="text-2xs text-ink-400">Points movement in this window</p></div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat tone="#22c55e" label="Earned" value={`+${Math.round(inWindow.filter((t) => t.kind === 'topup').reduce((s, t) => s + t.amount, 0)).toLocaleString('en')}`} icon={<ArrowUpRight size={13} strokeWidth={2.25} />} />
                  <MiniStat tone="#ef4444" label="Spent" value={`−${Math.round(inWindow.filter((t) => t.kind === 'spend').reduce((s, t) => s + t.amount, 0)).toLocaleString('en')}`} icon={<Repeat size={13} strokeWidth={2.25} />} />
                </div>
                <div className="mt-3 space-y-2">
                  <FactRow label="Lifetime earned" value={Math.round(activeTxs.filter((t) => t.kind === 'topup').reduce((s, t) => s + t.amount, 0)).toLocaleString('en') + ' pts'} mono />
                  <FactRow label="Lifetime converted/spent" value={Math.round(activeTxs.filter((t) => t.kind === 'spend').reduce((s, t) => s + t.amount, 0)).toLocaleString('en') + ' pts'} mono />
                  <FactRow label="Status" value={active?.frozen ? 'Frozen' : 'Active'} />
                </div>
              </Card>

              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-base font-bold"><Coins size={16} strokeWidth={1.75} className="text-amber-500" /> CC Credits leaderboard</h3>
                  <Trophy size={15} strokeWidth={1.75} className="text-amber-400" />
                </div>
                {leaderboard.loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-xl" />)}</div>
                ) : leaderboard.top.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-400">No credits earned yet this month.</p>
                ) : (
                  <div className="space-y-1.5">
                    {leaderboard.top.map((r, i) => (
                      <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                        <span className={`num grid h-6 w-6 place-items-center rounded-lg text-2xs font-black ${i === 0 ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-200 dark:text-ink-300'}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                        <CreditsCoin size={16} logo={logoDark} />
                        <span className="num text-sm font-bold text-amber-600 dark:text-amber-400">{Math.round(r.total).toLocaleString('en')}</span>
                      </motion.div>
                    ))}
                    <p className="pt-1 text-2xs text-ink-400">Top earners this month.</p>
                  </div>
                )}
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="num text-3xl font-extrabold tracking-tight">
                    {Math.round(activeBalance).toLocaleString('en')}
                    <span className="ml-2 text-xs font-semibold text-ink-400">PTS</span>
                  </p>
                  {chartData.length > 1 && (
                    <p className={`num mt-0.5 text-xs font-bold ${deltaPct >= 0 ? 'text-pos' : 'text-neg'}`}>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(2)}% this {range.toLowerCase()}</p>
                  )}
                </div>
                <div className="glass-tabs flex gap-1 rounded-full p-1">
                  {Object.keys(WINDOWS).map((k) => (
                    <button key={k} onClick={() => setRange(k as keyof typeof WINDOWS)} className={`relative rounded-full px-3 py-1.5 text-2xs font-bold transition-colors ${range === k ? 'text-white' : 'text-ink-400 hover:text-ink dark:hover:text-white'}`}>
                      {range === k && <motion.span layoutId="bank-range" transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />}
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
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--ink-400))' }} axisLine={false} tickLine={false} minTickGap={28} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--ink-400))' }} axisLine={false} tickLine={false} tickFormatter={(v) => String(Math.round(v as number))} />
                    <Tooltip cursor={{ stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3 3' }} contentStyle={{ background: 'var(--glass-strong-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-strong-border)', borderRadius: 12, fontSize: 12, color: 'rgb(var(--ink))' }} formatter={(v: number) => [`${Math.round(v).toLocaleString('en')} pts`, 'Balance']} />
                    <Area type="monotone" dataKey="v" stroke="#f59e0b" strokeWidth={2.5} fill="url(#bankFill)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
        )
      ) : (
        /* ================= REDEEM SHOP TAB ================= */
        <RedeemShop
          items={featuredFirst}
          redemptions={rdsQ.data || []}
          balance={credit.balance}
          logoDark={logoDark}
          onChanged={refreshAll}
        />
      )}
    </PageContainer>
  )
}

function maskShort(num: string): string {
  const d = (num || '').replace(/\D/g, '')
  return d.length <= 4 ? `•••• ${d}` : `•••• ${d.slice(-4)}`
}

/* ------------------------------------------------------------------ */
/* Convert points → credits                                            */
/* ------------------------------------------------------------------ */
function ConvertCard({ active, balance, disabled, onConverted }: {
  active: BankCard | null
  balance: number
  disabled: boolean
  onConverted: () => void
}) {
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number>(0)
  const [working, setWorking] = useState(false)

  async function convert() {
    if (!active || !(amount > 0)) return
    setWorking(true)
    try {
      await db.convertPoints(active.id, amount)
      push({ tone: 'success', title: `${amount.toLocaleString('en')} pts converted`, desc: 'Your CC Credits are ready to spend.' })
      setOpen(false)
      setAmount(0)
      onConverted()
    } catch (e: any) {
      const msg = e?.message ?? ''
      push({ tone: 'error', title: msg.includes('INSUFFICIENT') ? 'Not enough points on this card' : 'Conversion failed', desc: msg })
    } finally { setWorking(false) }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold"><Coins size={15} strokeWidth={1.75} className="text-amber-500" /> Convert to CC Credits</h3>
          <p className="mt-0.5 text-2xs text-ink-400">Move points off this card into your spendable balance · rate 1:1</p>
        </div>
        <Button size="sm" disabled={disabled || balance <= 0} onClick={() => setOpen(true)} icon={<Repeat size={13} strokeWidth={2} />}>Convert</Button>
      </div>
      {disabled && <p className="mt-2 text-2xs text-info">Unfreeze the card to convert its points.</p>}

      <Modal open={open} onClose={() => !working && setOpen(false)} size="sm" title="Convert to CC Credits" desc={`${balance.toLocaleString('en')} pts available on this card`}>
        <div className="space-y-4">
          <Field label="Amount to convert" hint="Rate is 1 pt = 1 CC Credit">
            <Input type="number" min={1} max={balance} className="num" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {[25, 50, 100].filter((v) => v <= balance).map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="rounded-full border border-line px-3 py-1.5 text-2xs font-semibold num hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]">{v}</button>
            ))}
            <button onClick={() => setAmount(Math.floor(balance))} className="rounded-full border border-line px-3 py-1.5 text-2xs font-semibold hover:bg-ink-50 dark:hover:bg-[rgb(28,28,28)]">Max</button>
          </div>
          <Button block onClick={convert} disabled={working || !(amount > 0)} icon={<Coins size={15} strokeWidth={2} />}>
            {working ? 'Converting…' : `Convert ${amount > 0 ? amount.toLocaleString('en') : ''} pts`}
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Redeem shop + history                                               */
/* ------------------------------------------------------------------ */
function RedeemShop({ items, redemptions, balance, logoDark, onChanged }: {
  items: RedeemItem[]
  redemptions: Redemption[]
  balance: number
  logoDark: string
  onChanged: () => void
}) {
  const { push } = useToast()
  const [selected, setSelected] = useState<RedeemItem | null>(null)
  const [result, setResult] = useState<{ code: string; title: string; cost: number } | null>(null)
  const [working, setWorking] = useState(false)

  async function redeem(it: RedeemItem) {
    setWorking(true)
    try {
      const code = await db.redeemVoucher(it.id)
      setSelected(null)
      setResult({ code, title: it.title, cost: it.cost })
      onChanged()
    } catch (e: any) {
      const m = e?.message ?? ''
      push({ tone: 'error', title: m.includes('INSUFFICIENT') ? 'Not enough CC Credits' : m.includes('SOLD_OUT') ? 'Sold out!' : 'Redemption failed', desc: m })
    } finally { setWorking(false) }
  }

  return (
    <div className="space-y-6">
      {/* Balance strip */}
      <div className="liquid-tile">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(150deg, rgba(245,158,11,0.30) 0%, transparent 52%)' }} />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <CreditsCoin size={38} logo={logoDark} />
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Available credits</p>
              <p className="num text-2xl font-extrabold leading-none text-amber-500 dark:text-amber-400">{Math.round(balance).toLocaleString('en')}</p>
            </div>
          </div>
          <p className="max-w-xs text-2xs leading-relaxed text-ink-400">Pick a reward below — a voucher code is issued instantly and locked to you.</p>
        </div>
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <Card><p className="py-12 text-center text-sm text-ink-400">The shop is being stocked — check back soon.</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it, i) => {
            const codesLeft = it.codes.split('\n').filter((x) => x.trim()).length
            const soldOut = codesLeft === 0 || it.stock === 0
            const canAfford = balance >= it.cost
            return (
              <motion.button
                key={it.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
                onClick={() => !soldOut && setSelected(it)}
                className="group overflow-hidden rounded-2xl border border-line bg-surface text-left transition-all hover:-translate-y-1 hover:shadow-glass"
              >
                <div className="relative h-32 w-full overflow-hidden bg-ink-100 dark:bg-[rgb(28,28,28)]">
                  {it.image_url && <img src={it.image_url} alt={it.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
                  <div className="absolute left-2 top-2 flex gap-1">
                    {it.featured && <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-bold text-amber-300 backdrop-blur"><Star size={9} strokeWidth={2.5} className="fill-amber-300" /> Recommended</span>}
                  </div>
                  {soldOut && <div className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-black uppercase tracking-widest text-white backdrop-blur-[2px]">Sold out</div>}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold">{it.title}</p>
                  <p className="num mt-0.5 text-2xs font-semibold text-amber-600 dark:text-amber-400">From {it.cost} cc</p>
                  {!canAfford && !soldOut && <p className="text-2xs text-neg">Need {(Math.ceil(it.cost - balance)).toLocaleString('en')} more</p>}
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold"><Wallet size={16} strokeWidth={1.75} className="text-ink-300" /> Your redemptions</h3>
        {redemptions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line py-8 text-center text-sm text-ink-400">Nothing redeemed yet — your purchases will appear here.</p>
        ) : (
          <div className="space-y-1.5">
            {redemptions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <Gift size={15} strokeWidth={1.75} className="shrink-0 text-violet-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.item_title}</p>
                  <p className="num text-2xs text-ink-400">{new Date(r.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })} · −{Math.round(r.cost).toLocaleString('en')} cc{r.code ? ` · code ••••${r.code.slice(-4)}` : ''}</p>
                </div>
                <Badge tone={r.status === 'delivered' ? 'pos' : 'warn'} dot>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review & confirm modal */}
      <Modal open={!!selected} onClose={() => !working && setSelected(null)} size="sm"
        footer={
          selected ? (
            <Button block icon={<CheckCheck size={15} strokeWidth={2} />} disabled={working || balance < selected.cost} onClick={() => void redeem(selected)}>
              {working ? 'Redeeming…' : balance < selected.cost ? 'Not enough credits' : `Agree and redeem · ${selected.cost} cc`}
            </Button>
          ) : undefined
        }
      >
        {selected && (
          <div className="-m-5 overflow-hidden rounded-2xl">
            <div className="relative">
              <button onClick={() => !working && setSelected(null)} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur">×</button>
              <div className="relative h-44 w-full overflow-hidden bg-ink-100 dark:bg-[rgb(28,28,28)]">
                {selected.image_url && <img src={selected.image_url} alt={selected.title} className="h-full w-full object-cover" />}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
            <div className="p-5">
              <p className="text-lg font-extrabold">{selected.title}</p>
              {selected.description && <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-300">{selected.description}</p>}
              <div className="mt-4 space-y-2">
                <ReviewRow label="Pay today" value={`${selected.cost} cc`} bold />
                <ReviewRow label="Balance after" value={`${Math.max(Math.round(balance - selected.cost), 0)} cc`} mono />
                <ReviewRow label="Issued" value="Voucher code, instantly" />
              </div>
              <p className="mt-4 text-2xs leading-relaxed text-ink-400">
                Redemptions are final — credits are spent at the moment of purchase and the voucher code becomes yours.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Success */}
      <Modal open={!!result} onClose={() => setResult(null)} size="sm">
        {result && (
          <div className="py-2 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }} className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30">
              <CheckCheck size={30} strokeWidth={2} />
            </motion.div>
            <p className="text-lg font-extrabold">Redeemed!</p>
            <p className="mt-1 text-sm text-ink-400">{result.title} · −{Math.round(result.cost).toLocaleString('en')} cc</p>
            <p className="mt-4 text-2xs font-bold uppercase tracking-wider text-ink-400">Your voucher code</p>
            <div className="mx-auto mt-2 flex max-w-xs items-center gap-2 rounded-xl border border-line bg-ink-50 px-4 py-3 dark:bg-[rgb(26,26,26)]">
              <p className="num flex-1 select-all break-all text-left text-sm font-black tracking-wide">{result.code}</p>
              <CopyCodeBtn text={result.code} />
            </div>
            <Button variant="secondary" className="mt-5" block onClick={() => setResult(null)}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function CopyCodeBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className={`shrink-0 rounded-lg p-2 transition-colors ${copied ? 'bg-posBg text-pos' : 'bg-surface text-ink-400 ring-1 ring-line hover:text-ink'}`}
      title="Copy code"
    >
      {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={1.75} />}
    </button>
  )
}

function ReviewRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
      <span className="text-xs text-ink-500 dark:text-ink-300">{label}</span>
      <span className={`${bold ? 'text-sm font-extrabold' : 'text-sm font-semibold'} ${mono ? 'num' : ''}`}>{value}</span>
    </div>
  )
}

function MiniStat({ tone, label, value, icon }: { tone: string; label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gradient-to-br p-[1px]" style={{ backgroundImage: `linear-gradient(135deg, ${tone}55, transparent 60%)` }}>
      <div className="rounded-[11px] bg-surface px-3 py-2">
        <p className="flex items-center gap-1 text-2xs font-bold" style={{ color: tone }}>{icon} {label}</p>
        <p className="num mt-0.5 text-lg font-extrabold" style={{ color: tone }}>{value}</p>
      </div>
    </div>
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
