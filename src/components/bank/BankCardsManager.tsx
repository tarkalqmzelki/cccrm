import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Plus, Pencil, Trash2, Snowflake, ArrowDownToLine, ArrowUpFromLine, ListOrdered, Wallet } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { BankCard, BankTransaction, BankTxKind, Profile } from '../../lib/types'
import {
  bankCardBalance, cardGradient, maskCardNumber,
  BANK_SPEND_CATEGORIES, BANK_SPEND_CATEGORY_META,
  BANK_TOPUP_CATEGORIES, BANK_TOPUP_CATEGORY_META,
  CARD_GRADIENTS,
} from '../../lib/types'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { DateTimePicker } from '../ui/DateTimePicker'
import { SegmentedControl } from '../ui/SegmentedControl'
import { ProfileCombobox } from '../marketplace/ProfileCombobox'
import { useToast } from '../../context/ToastContext'
import { eur, eurFull, dateShort } from '../../lib/format'

/** Points formatter — card ledgers are denominated in points, not euros. */
const pts = (n: number) => `${Math.round(n).toLocaleString('en')} pts`

/**
 * Admin control room for member bank cards — issue fully-manual virtual
 * cards, record categorized top-ups/spends, freeze, inspect.
 */
export function BankCardsManager({ adminId }: { adminId: string }) {
  const { push } = useToast()
  const cardsQ = useAsync(async () => db.listBankCards(), [])
  const txQ = useAsync(async () => db.listBankTransactions(), [])
  const profilesQ = useAsync(async () => db.listProfiles(), [])
  const cards = cardsQ.data || []
  const txs = txQ.data || []
  const profiles = (profilesQ.data || []).filter((p) => p.role !== 'admin')

  const txsByCard = useMemo(() => {
    const m: Record<string, BankTransaction[]> = {}
    txs.forEach((t) => { (m[t.card_id] ??= []).push(t) })
    return m
  }, [txs])

  const totalBalance = cards.reduce((s, c) => s + bankCardBalance(c, txsByCard[c.id] || []), 0)
  const frozenCount = cards.filter((c) => c.frozen).length
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const spentThisMonth = txs
    .filter((t) => t.kind === 'spend' && new Date(t.occurred_at).getTime() >= monthStart.getTime())
    .reduce((s, t) => s + t.amount, 0)

  const [createOpen, setCreateOpen] = useState(false)
  const [editCard, setEditCard] = useState<BankCard | null>(null)
  const [txCard, setTxCard] = useState<BankCard | null>(null)

  async function toggleFreeze(c: BankCard) {
    try {
      await db.updateBankCard(c.id, { frozen: !c.frozen })
      push({ tone: 'success', title: c.frozen ? 'Card unfrozen' : 'Card frozen' })
      cardsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not update', desc: e?.message })
    }
  }

  async function removeCard(c: BankCard) {
    if (!confirm(`Delete the card for ${c.holder_name || 'member'}? All its transactions go with it.`)) return
    try {
      await db.deleteBankCard(c.id)
      push({ tone: 'success', title: 'Card deleted' })
      cardsQ.reload(); txQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">Issue fully-manual virtual cards to members. Balance moves only through the ledger you record.</p>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setCreateOpen(true)}>Issue card</Button>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Cards issued" value={String(cards.length)} icon={<CreditCard size={14} strokeWidth={2} />} tone="#f59e0b" />
        <MiniStat label="Total balance" value={pts(totalBalance)} icon={<Wallet size={14} strokeWidth={2} />} tone="#fbbf24" />
        <MiniStat label="Spent this month" value={pts(spentThisMonth)} icon={<ArrowUpFromLine size={14} strokeWidth={2} />} tone="#fb923c" />
        <MiniStat label="Frozen" value={String(frozenCount)} icon={<Snowflake size={14} strokeWidth={2} />} tone="#38bdf8" />
      </div>

      {cardsQ.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      ) : cards.length === 0 ? (
        <EmptyState icon={<CreditCard size={22} strokeWidth={1.5} />} title="No cards issued" desc="Issue the first virtual card to a member — they'll see it instantly on their Bank page." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => {
            const g = cardGradient(c.gradient)
            const bal = bankCardBalance(c, txsByCard[c.id] || [])
            const holder = profiles.find((p) => p.id === c.user_id)?.full_name || c.holder_name || 'Member'
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-2xl border border-line"
              >
                {/* card visual header */}
                <div className="relative h-36 p-4 text-white" style={{ background: `linear-gradient(140deg, ${g.from}, ${g.to})` }}>
                  <div aria-hidden className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/70">Calista Bank</p>
                      <p className="mt-0.5 text-sm font-bold">{holder}</p>
                    </div>
                    {c.frozen && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-2xs font-bold backdrop-blur">
                        <Snowflake size={10} strokeWidth={2.5} /> Frozen
                      </span>
                    )}
                  </div>
                  <p className="num mt-5 text-sm font-semibold tracking-[0.14em] text-white/90">{maskCardNumber(c.card_number)}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="num text-2xs text-white/70">{c.expiry || '—'} · CVV {c.cvv ? '•••' : '—'}</span>
                    <span className="text-2xs font-black uppercase italic tracking-wider text-white/85">{c.brand}</span>
                  </div>
                </div>

                {/* balance + actions */}
                <div className="bg-surface p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">Available</p>
                      <p className="num text-xl font-extrabold">{pts(bal)}</p>
                    </div>
                    <Badge tone={c.frozen ? 'info' : 'pos'} dot>{c.frozen ? 'Frozen' : 'Active'}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
                    <Button variant="ghost" size="sm" icon={<ArrowDownToLine size={13} strokeWidth={1.75} />} onClick={() => setTxCard(c)}>Ledger</Button>
                    <Button variant="ghost" size="sm" icon={<Pencil size={13} strokeWidth={1.75} />} onClick={() => setEditCard(c)}>Edit</Button>
                    <Button variant="ghost" size="sm" icon={<Snowflake size={13} strokeWidth={1.75} />} onClick={() => toggleFreeze(c)}>
                      {c.frozen ? 'Unfreeze' : 'Freeze'}
                    </Button>
                    <Button variant="ghost" size="sm" className="ml-auto text-neg hover:bg-negBg" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => removeCard(c)}>Delete</Button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create / edit */}
      <CardFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        editing={null}
        profiles={profiles}
        adminId={adminId}
        onDone={() => { setCreateOpen(false); cardsQ.reload() }}
      />
      <CardFormModal
        open={!!editCard}
        onClose={() => setEditCard(null)}
        editing={editCard}
        profiles={profiles}
        adminId={adminId}
        onDone={() => { setEditCard(null); cardsQ.reload() }}
      />

      {/* Ledger modal */}
      <LedgerModal
        open={!!txCard}
        card={txCard}
        txs={txCard ? txsByCard[txCard.id] || [] : []}
        onClose={() => setTxCard(null)}
        onChanged={() => { txQ.reload(); cardsQ.reload() }}
        adminId={adminId}
      />
    </div>
  )
}

function MiniStat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="liquid-tile">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(150deg, ${tone}30 0%, transparent 52%), radial-gradient(120% 90% at 100% 100%, ${tone}1c 0%, transparent 62%)` }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="relative px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-2xs text-ink-400">{label}</p>
          <span style={{ color: tone }}>{icon}</span>
        </div>
        <p className="num mt-1 text-lg font-bold" style={{ color: tone }}>{value}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Create / edit card                                                  */
/* ------------------------------------------------------------------ */
function CardFormModal({
  open, onClose, editing, profiles, adminId, onDone,
}: {
  open: boolean
  onClose: () => void
  editing: BankCard | null
  profiles: Profile[]
  adminId: string
  onDone: () => void
}) {
  const { push } = useToast()
  const [userId, setUserId] = useState<string | null>(null)
  const [holder, setHolder] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [brand, setBrand] = useState('visa')
  const [gradient, setGradient] = useState('aurora')
  const [initial, setInitial] = useState(0)
  const [saving, setSaving] = useState(false)

  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    setWasOpen(true)
    setUserId(editing?.user_id ?? null)
    setHolder(editing?.holder_name ?? '')
    setNumber(editing?.card_number ?? '')
    setExpiry(editing?.expiry ?? '')
    setCvv(editing?.cvv ?? '')
    setBrand(editing?.brand ?? 'visa')
    setGradient(editing?.gradient ?? 'aurora')
    setInitial(editing?.initial_balance ?? 0)
  }
  if (!open && wasOpen) setWasOpen(false)

  const g = cardGradient(gradient)

  async function save() {
    if (!userId) { push({ tone: 'error', title: 'Pick a member' }); return }
    if (!number.trim()) { push({ tone: 'error', title: 'Card number is required' }); return }
    setSaving(true)
    try {
      const payload = {
        user_id: userId,
        holder_name: holder.trim(),
        card_number: number.trim(),
        expiry: expiry.trim(),
        cvv: cvv.trim(),
        brand,
        gradient,
        initial_balance: Number(initial) || 0,
      }
      if (editing) {
        await db.updateBankCard(editing.id, payload)
        push({ tone: 'success', title: 'Card updated' })
      } else {
        await db.createBankCard(payload, adminId)
        push({ tone: 'success', title: 'Card issued', desc: 'The member sees it on their Bank page instantly.' })
      }
      onDone()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? 'Edit card' : 'Issue bank card'}
      desc="Fully manual details — enter them exactly as you want the member to see them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{editing ? 'Save changes' : 'Issue card'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Member">
          <ProfileCombobox profiles={profiles} value={userId} onChange={setUserId} allowClear={false} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Holder name"><Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="As printed on card" /></Field>
          <Field label="Card number" required><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="4242 4242 4242 4242" className="num" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Expiry"><Input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="12/28" className="num" /></Field>
          <Field label="CVV"><Input value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="•••" className="num" /></Field>
          <Field label="Brand">
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface px-3 text-sm">
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">Amex</option>
            </select>
          </Field>
        </div>
        <Field label="Initial balance (€)" hint="Ledger starts from here — top-ups and spends move it.">
          <Input type="number" step="0.01" value={initial} onChange={(e) => setInitial(Number(e.target.value))} className="num" />
        </Field>
        <Field label="Card design">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CARD_GRADIENTS).map(([key, cg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGradient(key)}
                className={`h-12 w-20 overflow-hidden rounded-lg border-2 transition-all ${gradient === key ? 'border-ink scale-105 dark:border-white' : 'border-line hover:scale-105'}`}
                style={{ background: `linear-gradient(140deg, ${cg.from}, ${cg.to})` }}
                title={cg.name}
              />
            ))}
          </div>
        </Field>
        {/* Live preview */}
        <div className="relative h-32 overflow-hidden rounded-xl p-4 text-white" style={{ background: `linear-gradient(140deg, ${g.from}, ${g.to})` }}>
          <div aria-hidden className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
          <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/70">Calista Bank</p>
          <p className="mt-0.5 text-sm font-bold">{holder || 'Holder name'}</p>
          <p className="num mt-4 text-sm font-semibold tracking-[0.14em] text-white/90">{number ? maskCardNumber(number) : '•••• •••• •••• ••••'}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="num text-2xs text-white/70">{expiry || 'MM/YY'}</span>
            <span className="text-2xs font-black uppercase italic tracking-wider text-white/85">{brand}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Ledger modal — record top-ups/spends + history                      */
/* ------------------------------------------------------------------ */
function LedgerModal({
  open, card, txs, onClose, onChanged, adminId,
}: {
  open: boolean
  card: BankCard | null
  txs: BankTransaction[]
  onClose: () => void
  onChanged: () => void
  adminId: string
}) {
  const { push } = useToast()
  const [kind, setKind] = useState<BankTxKind>('topup')
  const [category, setCategory] = useState('payout')
  const [amount, setAmount] = useState<number>(0)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setKind('topup'); setCategory('payout'); setAmount(0); setNote(''); setDate('') }
  }, [open, card?.id])

  const balance = card ? bankCardBalance(card, txs) : 0

  async function add() {
    if (!card) return
    if (!(amount > 0)) { push({ tone: 'error', title: 'Amount must be positive' }); return }
    setSaving(true)
    try {
      await db.createBankTransaction({
        card_id: card.id,
        kind,
        category,
        amount: Number(amount),
        note: note.trim(),
        occurred_at: date ? new Date(date).toISOString() : undefined,
      }, adminId)
      push({ tone: 'success', title: `${kind === 'topup' ? 'Top-up' : 'Spend'} recorded` })
      setAmount(0); setNote('')
      onChanged()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not record', desc: e?.message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: BankTransaction) {
    if (!confirm('Delete this transaction?')) return
    try {
      await db.deleteBankTransaction(t.id)
      onChanged()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Card ledger" desc={card ? `${card.holder_name || 'Card'} •••• ${(card.card_number || '').slice(-4)} · balance updates live` : ''}>
      {card && (
        <div className="space-y-4">
          {/* Balance banner */}
          <div className="rounded-xl bg-gradient-to-br from-amber-400/20 to-transparent p-[1px]">
            <div className="flex items-center justify-between rounded-[11px] bg-surface px-4 py-3">
              <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Current balance</p>
              <p className="num text-xl font-extrabold text-amber-500 dark:text-amber-400">{pts(balance)}</p>
            </div>
          </div>

          {/* Add entry */}
          <div className="rounded-xl border border-line p-3">
            <SegmentedControl
              value={kind}
              onChange={(v) => { setKind(v); setCategory(v === 'topup' ? 'payout' : 'other') }}
              options={[
                { value: 'topup', label: 'Top-up' },
                { value: 'spend', label: 'Spend' },
              ]}
              columns={2}
              size="sm"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Amount (pts)" hint="Points — converted to CC Credits by the member">
                <Input type="number" min={0} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} className="num" />
              </Field>
              <Field label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface px-3 text-sm">
                  {(kind === 'topup' ? BANK_TOPUP_CATEGORIES : BANK_SPEND_CATEGORIES).map((cKey) => (
                    <option key={cKey} value={cKey}>
                      {kind === 'topup' ? BANK_TOPUP_CATEGORY_META[cKey as BankTopupCategoryKeys].label : BANK_SPEND_CATEGORY_META[cKey as SpendKeys].label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
              <Field label="Date"><DateTimePicker value={date} onChange={setDate} dateOnly /></Field>
            </div>
            <Button block className="mt-3" onClick={add} disabled={saving} icon={kind === 'topup' ? <ArrowDownToLine size={14} strokeWidth={1.75} /> : <ArrowUpFromLine size={14} strokeWidth={1.75} />}>
              Record {kind}
            </Button>
          </div>

          {/* History */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
              <ListOrdered size={12} strokeWidth={2} /> History · {txs.length}
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {[...txs].reverse().map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${t.kind === 'topup' ? 'bg-posBg text-pos' : 'bg-warnBg text-warn'}`}>
                    {t.kind === 'topup' ? <ArrowDownToLine size={13} strokeWidth={2} /> : <ArrowUpFromLine size={13} strokeWidth={2} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize">
                      {t.kind === 'topup' ? BANK_TOPUP_CATEGORY_META[t.category as BankTopupCategoryKeys]?.label ?? t.category : BANK_SPEND_CATEGORY_META[t.category as SpendKeys]?.label ?? t.category}
                    </p>
                    <p className="truncate text-2xs text-ink-400 num">{dateShort(t.occurred_at)}{t.note ? ` · ${t.note}` : ''}</p>
                  </div>
                  <p className={`num shrink-0 text-sm font-bold ${t.kind === 'topup' ? 'text-pos' : 'text-warn'}`}>
                    {t.kind === 'topup' ? '+' : '−'}{pts(t.amount)}
                  </p>
                  <button onClick={() => remove(t)} title="Delete" className="shrink-0 rounded-lg p-1.5 text-ink-300 transition-colors hover:bg-negBg hover:text-neg">
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              {txs.length === 0 && <p className="py-4 text-center text-2xs text-ink-300">No transactions yet.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

type BankTopupCategoryKeys = keyof typeof BANK_TOPUP_CATEGORY_META
type SpendKeys = keyof typeof BANK_SPEND_CATEGORY_META
