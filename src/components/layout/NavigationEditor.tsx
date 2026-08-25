import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, LayoutGrid, Check, RotateCcw, X } from 'lucide-react'
import { NAV, type NavItem } from './nav'
import { loadNavSlots, saveNavSlots, MAX_SLOTS } from './navSlots'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'

type DragEvt = globalThis.MouseEvent | globalThis.TouchEvent | globalThis.PointerEvent

function clientPoint(e: DragEvt): { x: number; y: number } {
  if ('clientX' in e && typeof e.clientX === 'number') return { x: e.clientX, y: (e.clientY as number) }
  const te = e as TouchEvent
  const t = te.changedTouches?.[0] || te.touches?.[0]
  return t ? { x: t.clientX, y: t.clientY } : { x: -9999, y: -9999 }
}

/**
 * "Edit navigation" — mobile-first slot configurator. Drag any item
 * onto one of the 4 slots (kanban-style pointer drag with drop-zone
 * hit-testing), or tap an item then tap a slot. Dropping an item that
 * already lives in another slot swaps the two.
 */
export function NavigationEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const available = useMemo(
    () => (user ? NAV.filter((n) => !n.roles || n.roles.includes(user.role)) : []),
    [user?.id],
  )

  const [slots, setSlots] = useState<string[]>(() => loadNavSlots(available))
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const dragItem = useRef<string | null>(null)
  const slotEls = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    if (open) setSlots(loadNavSlots(available))
  }, [open])

  function commit(next: string[]) {
    setSlots(next)
    saveNavSlots(next)
  }

  function assign(slotIdx: number, to: string) {
    const next = [...slots]
    const existingIdx = next.indexOf(to)
    if (existingIdx >= 0 && existingIdx !== slotIdx) {
      // swap
      next[existingIdx] = next[slotIdx]
    }
    next[slotIdx] = to
    commit(next)
    setSelectedItem(null)
  }

  function clearSlot(slotIdx: number) {
    // Refill from unused items so slots never end up empty.
    const next = [...slots]
    const removed = next[slotIdx]
    const used = new Set(next.filter((_, i) => i !== slotIdx))
    const refill = available.find((a) => !used.has(a.to))
    next[slotIdx] = refill ? refill.to : removed
    commit(next)
  }

  function itemFor(to: string | undefined): NavItem | undefined {
    return available.find((n) => n.to === to)
  }

  /* ---- pointer-drag plumbing (same feel as the Kanban) ---- */
  function onDragStart(to: string) {
    dragItem.current = to
    slotEls.current.clear()
  }
  function slotFromPoint(x: number, y: number): number | null {
    for (const [idx, el] of slotEls.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return idx
    }
    return null
  }
  function onDragMove(e: DragEvt) {
    const p = clientPoint(e)
    setDragOverSlot(slotFromPoint(p.x, p.y))
  }
  function onDragEnd(e: DragEvt) {
    const p = clientPoint(e)
    const target = slotFromPoint(p.x, p.y)
    const to = dragItem.current
    dragItem.current = null
    setDragOverSlot(null)
    if (target != null && to) assign(target, to)
  }

  const unusedItems = available.filter((n) => !slots.includes(n.to))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={<span className="flex items-center gap-2"><LayoutGrid size={17} strokeWidth={1.75} /> Edit navigation</span>}
      desc={`Drag an icon onto a slot — or tap an icon, then tap a slot. ${MAX_SLOTS} slots appear in the bottom bar.`}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw size={14} strokeWidth={1.75} />} onClick={() => commit(available.slice(0, MAX_SLOTS).map((n) => n.to))}>Reset</Button>
          <Button onClick={onClose} icon={<Check size={15} strokeWidth={1.75} />}>Done</Button>
        </>
      }
    >
      {/* Slots */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: MAX_SLOTS }, (_, i) => {
          const item = itemFor(slots[i])
          const isTarget = dragOverSlot === i
          const isSelectedHere = selectedItem != null
          return (
            <div
              key={i}
              ref={(el) => { if (el) slotEls.current.set(i, el); else slotEls.current.delete(i) }}
              onClick={() => { if (isSelectedHere && selectedItem) assign(i, selectedItem) }}
              className={`relative flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-1 text-center transition-all ${
                isTarget
                  ? 'scale-105 border-info bg-infoBg/50 shadow-[0_0_0_4px_rgba(59,130,246,0.10)]'
                  : isSelectedHere
                    ? 'border-info/40 bg-infoBg/20'
                    : 'border-line bg-ink-50/50 dark:bg-[rgb(26,26,26)]'
              }`}
            >
              <span className="num absolute left-1.5 top-1 text-[9px] font-black text-ink-300">{i + 1}</span>
              {item ? (
                <>
                  <item.icon size={20} strokeWidth={2} className="mt-1 text-ink dark:text-white" />
                  <span className="w-full truncate px-1 text-[9px] font-semibold leading-tight text-ink-500 dark:text-white/60">{item.label}</span>
                  {!isSelectedHere && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearSlot(i) }}
                      title="Replace"
                      className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-ink-400 shadow-sm ring-1 ring-line transition-colors hover:text-neg"
                    >
                      <X size={11} strokeWidth={2.25} />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-2xs text-ink-300">Empty</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Palette */}
      <p className="mb-2 mt-6 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
        <GripVertical size={12} strokeWidth={2} /> Available pages — drag me up
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {available.map((n) => {
          const inSlot = slots.indexOf(n.to)
          const isSelected = selectedItem === n.to
          return (
            <motion.div
              key={n.to}
              drag
              dragSnapToOrigin
              dragMomentum={false}
              whileDrag={{ scale: 1.08, zIndex: 400, boxShadow: '0 16px 36px -10px rgba(0,0,0,0.35)' }}
              onDragStart={() => onDragStart(n.to)}
              onDrag={(e) => onDragMove(e as DragEvt)}
              onDragEnd={(e) => onDragEnd(e as DragEvt)}
              style={{ touchAction: 'pan-y' }}
              onClick={() => setSelectedItem(isSelected ? null : n.to)}
              className={`relative flex cursor-grab select-none flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors active:cursor-grabbing ${
                isSelected
                  ? 'border-info bg-infoBg/50 ring-2 ring-info/30'
                  : inSlot >= 0
                    ? 'border-pos/30 bg-posBg/40 dark:bg-transparent'
                    : 'border-line bg-surface hover:border-ink-200'
              }`}
              title={inSlot >= 0 ? `In slot ${inSlot + 1}` : 'Drag to a slot'}
            >
              <GripVertical size={12} strokeWidth={1.75} className="absolute left-1 top-1 text-ink-200 dark:text-white/20" />
              <n.icon size={22} strokeWidth={2} className="text-ink dark:text-white" />
              <span className="w-full truncate text-[10px] font-semibold text-ink-600 dark:text-white/70">{n.label}</span>
              {inSlot >= 0 && <span className="num text-[8px] font-bold uppercase text-pos">slot {inSlot + 1}</span>}
            </motion.div>
          )
        })}
        {unusedItems.length === 0 && available.length > 0 && (
          <p className="col-span-full py-2 text-center text-2xs text-ink-300">Every page is placed — drag one off its slot by dropping another icon there.</p>
        )}
      </div>
    </Modal>
  )
}
