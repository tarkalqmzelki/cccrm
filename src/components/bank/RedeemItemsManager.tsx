import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2, Gift, Star, PackageX } from 'lucide-react'
import { useAsync } from '../../lib/hooks/useAsync'
import { db } from '../../lib/db'
import type { RedeemItem } from '../../lib/types'
import { Button } from '../ui/Button'
import { Input, Field, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../../context/ToastContext'

/** Admin manager for the redeem shop — items with voucher-code vaults. */
export function RedeemItemsManager() {
  const { push } = useToast()
  const itemsQ = useAsync(async () => db.listRedeemItems(), [])
  const items = itemsQ.data || []
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RedeemItem | null>(null)

  async function remove(it: RedeemItem) {
    if (!confirm(`Delete "${it.title}" from the shop?`)) return
    try {
      await db.deleteRedeemItem(it.id)
      push({ tone: 'success', title: 'Item deleted' })
      itemsQ.reload()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not delete', desc: e?.message })
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          Shop items members buy with CC Credits. Paste one voucher code per line — a code is handed out automatically on redeem.
        </p>
        <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => { setEditing(null); setFormOpen(true) }}>New item</Button>
      </div>

      {itemsQ.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Gift size={22} strokeWidth={1.5} />} title="The shop is empty" desc="Create redeemable items or gift cards — stock comes from the voucher codes you paste." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it, i) => {
            const codesLeft = it.codes.split('\n').filter((x) => x.trim()).length
            return (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-2xl border border-line bg-surface"
              >
                <div className="relative h-32 w-full overflow-hidden bg-ink-100 dark:bg-[rgb(28,28,28)]">
                  {it.image_url && <img src={it.image_url} alt={it.title} className="h-full w-full object-cover" />}
                  <div className="absolute left-2 top-2 flex gap-1">
                    {it.featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-bold text-amber-300 backdrop-blur">
                        <Star size={9} strokeWidth={2.5} className="fill-amber-300" /> Featured
                      </span>
                    )}
                    {!it.active && <span className="rounded-full bg-black/60 px-2 py-0.5 text-2xs font-bold text-white/80 backdrop-blur">Hidden</span>}
                    {(it.stock === 0 || (codesLeft === 0)) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-2xs font-bold text-white backdrop-blur"><PackageX size={9} strokeWidth={2.25} /> Sold out</span>
                    )}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">{it.title}</p>
                    <Badge tone="warn">{it.cost} cc</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-2xs text-ink-400">{it.description || 'No description.'}</p>
                  <p className="num mt-1.5 text-2xs text-ink-400">
                    {codesLeft} code{codesLeft === 1 ? '' : 's'} left{it.stock >= 0 ? ` · stock ${Math.max(it.stock, 0)}` : ''}
                  </p>
                  <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
                    <Button variant="ghost" size="sm" icon={<Pencil size={13} strokeWidth={1.75} />} onClick={() => { setEditing(it); setFormOpen(true) }}>Edit</Button>
                    <Button variant="ghost" size="sm" className="ml-auto text-neg hover:bg-negBg" icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={() => remove(it)}>Delete</Button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <ItemFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDone={() => { setFormOpen(false); itemsQ.reload() }}
      />
    </div>
  )
}

function ItemFormModal({ open, onClose, editing, onDone }: {
  open: boolean; onClose: () => void; editing: RedeemItem | null; onDone: () => void
}) {
  const { push } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [cost, setCost] = useState(50)
  const [stock, setStock] = useState(-1)
  const [featured, setFeatured] = useState(false)
  const [active, setActive] = useState(true)
  const [codes, setCodes] = useState('')
  const [saving, setSaving] = useState(false)

  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    setWasOpen(true)
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setImageUrl(editing?.image_url ?? '')
    setCost(editing?.cost ?? 50)
    setStock(editing?.stock ?? -1)
    setFeatured(editing?.featured ?? false)
    setActive(editing?.active ?? true)
    setCodes(editing?.codes ?? '')
  }
  if (!open && wasOpen) setWasOpen(false)

  async function save() {
    if (!title.trim()) { push({ tone: 'error', title: 'Title is required' }); return }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl.trim(),
        cost: Math.max(0, cost),
        stock: Math.trunc(stock),
        featured,
        active,
        codes,
      }
      if (editing) {
        await db.updateRedeemItem(editing.id, payload)
        push({ tone: 'success', title: 'Item updated' })
      } else {
        await db.createRedeemItem(payload)
        push({ tone: 'success', title: 'Item created' })
      }
      onDone()
    } catch (e: any) {
      push({ tone: 'error', title: 'Could not save', desc: e?.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? 'Edit shop item' : 'New shop item'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{editing ? 'Save changes' : 'Create item'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Amazon €25 Gift Card" /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What the member gets." /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Image URL" hint="Brand/card artwork"><Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></Field>
          <Field label="Cost (CC credits)" required><Input type="number" min={0} step="0.01" className="num" value={cost} onChange={(e) => setCost(Number(e.target.value))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock" hint="-1 = unlimited">
            <Input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} className="num" />
          </Field>
          <Field label="Visibility flags">
            <div className="flex h-11 items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-[rgb(10,10,10)]" /> Featured</label>
              <label className="flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[rgb(10,10,10)]" /> Live</label>
            </div>
          </Field>
        </div>
        <Field label="Voucher codes" hint="One per line — each redeem hands out the next unused code. Empty list = sold out.">
          <Textarea value={codes} onChange={(e) => setCodes(e.target.value)} rows={5} placeholder={'CODE-AB12-CD34\nCODE-EF56-GH78'} className="font-mono text-xs" />
        </Field>
      </div>
    </Modal>
  )
}
