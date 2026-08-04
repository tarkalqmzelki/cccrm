import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { uuid } from '../lib/uuid'

type Tone = 'success' | 'error' | 'info'
interface Toast { id: string; title: string; tone: Tone; desc?: string }

const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uuid()
    setToasts((x) => [...x, { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4000)
  }, [])
  const remove = (id: string) => setToasts((x) => x.filter((y) => y.id !== id))

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+8px)] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-glass"
            >
              {t.tone === 'success' && <CheckCircle2 size={18} className="mt-0.5 text-pos" strokeWidth={1.75} />}
              {t.tone === 'error' && <AlertCircle size={18} className="mt-0.5 text-neg" strokeWidth={1.75} />}
              {t.tone === 'info' && <Info size={18} className="mt-0.5 text-info" strokeWidth={1.75} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{t.title}</p>
                {t.desc && <p className="mt-0.5 text-2xs text-ink-400">{t.desc}</p>}
              </div>
              <button onClick={() => remove(t.id)} className="text-ink-300 hover:text-ink-600 transition-colors">
                <X size={15} strokeWidth={1.75} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be inside ToastProvider')
  return c
}
