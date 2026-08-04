import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'

export interface CtxItem {
  label?: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

interface CtxState {
  x: number
  y: number
  items: CtxItem[]
}

let openFn: ((s: CtxState | null) => void) | null = null

export function openContextMenu(e: MouseEvent | ReactMouseEvent, items: CtxItem[]) {
  e.preventDefault()
  e.stopPropagation()
  const w = window.innerWidth
  const h = window.innerHeight
  const x = Math.min(e.clientX, w - 240)
  const y = Math.min(e.clientY, h - items.length * 38 - 20)
  openFn?.({ x, y, items })
}

export function ContextMenuHost() {
  const [state, setState] = useState<CtxState | null>(null)
  useEffect(() => {
    openFn = setState
    return () => {
      openFn = null
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const close = () => setState(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', (e) => {
      // allow nested context menus: only close if clicking the base layer
      setState(null)
      // do not preventDefault here
      void e
    }, { once: true })
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [state])

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: state.x, top: state.y }}
          className="fixed z-[180] w-56 glass-strong rounded-xl shadow-glass p-1.5 origin-top-left"
          onClick={(e) => e.stopPropagation()}
        >
          {state.items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  setState(null)
                  item.onClick?.()
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                  item.danger ? 'text-neg hover:bg-negBg' : 'text-ink hover:bg-ink-100'
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
  )
}
