import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  desc?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Backdrop opacity. Default 'normal' (30%). Use 'strong' (60%) for
   *  nested modals so the parent modal's white border doesn't show
   *  through as faint corner lines. */
  backdrop?: 'normal' | 'strong'
  /** Extra classes for the outermost wrapper. Use 'no-print' to keep a
   *  modal from showing up in the printed output (e.g. a preview modal
   *  that's portaled to document.body and therefore escapes the
   *  #root { display: none } print rule). */
  className?: string
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }

const backdropClass = {
  normal: 'bg-ink-900/30',
  strong: 'bg-ink-900/60',
}

export function Modal({ open, onClose, title, desc, children, footer, size = 'md', backdrop = 'normal', className = '' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6 ${className}`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`absolute inset-0 ${backdropClass[backdrop]}`}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full ${sizes[size]} glass-strong rounded-t-2xl sm:rounded-2xl shadow-glass max-h-[92dvh] flex flex-col`}
          >
            {(title || desc) && (
              <div className="flex items-start justify-between gap-4 px-5 pt-5">
                <div>
                  {title && <h2 className="text-lg font-semibold leading-tight">{title}</h2>}
                  {desc && <p className="mt-1 text-sm text-ink-400">{desc}</p>}
                </div>
                <button onClick={onClose} className="text-ink-300 hover:text-ink-600 transition-colors -mr-1 -mt-1 p-1">
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-5 py-5 flex-1">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-5 pb-5 pt-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
