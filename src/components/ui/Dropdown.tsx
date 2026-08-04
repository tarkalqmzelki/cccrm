import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export interface MenuItem {
  label?: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

export function Dropdown({
  trigger,
  items,
  align = 'right',
  width = 220,
  dropUp = false,
}: {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  width?: number
  dropUp?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 w-full">
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropUp ? 4 : -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ width, [align]: 0 }}
            className={`absolute z-[120] ${dropUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'} glass-strong rounded-xl shadow-glass p-1.5`}
          >
            {items.map((item, i) =>
              item.divider ? (
                <div key={i} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return
                    setOpen(false)
                    item.onClick?.()
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                    item.danger
                      ? 'text-neg hover:bg-negBg'
                      : 'text-ink hover:bg-ink-100'
                  }`}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  {item.label}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function DropdownTrigger({ label, icon }: { label: ReactNode; icon?: ReactNode }) {
  return (
    <>
      {label}
      <ChevronDown size={15} strokeWidth={1.75} className="text-ink-400" />
      {icon}
    </>
  )
}
