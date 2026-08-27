import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCreditBalance } from '../lib/hooks/useCreditBalance'
import { useAuth } from '../context/AuthContext'

/** Gold coin bearing the white platform logo (falls back to a CC glyph). */
export function CreditsCoin({ size = 22, logo }: { size?: number; logo?: string }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(140deg, #fbbf24, #b45309)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 6px rgba(180,83,9,0.45)',
      }}
    >
      {logo ? (
        <img src={logo} alt="" className="h-full w-full object-contain p-[15%]" />
      ) : (
        <span
          className="font-black text-amber-50"
          style={{ fontSize: Math.max(size * 0.34, 8), letterSpacing: '-0.02em' }}
        >
          CC
        </span>
      )}
    </span>
  )
}

/** Compact clickable credit pill for the desktop top bar. */
export function CreditsPill() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { balance, loading } = useCreditBalance()
  if (!user || user.role === 'admin' || loading) return null
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => navigate('/bank')}
      title="Your CC Credits"
      className="hidden items-center gap-1.5 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-100/70 to-transparent px-2.5 py-1.5 transition-transform hover:scale-[1.03] dark:border-amber-400/20 dark:from-amber-400/10 lg:inline-flex"
    >
      <CreditsCoin size={18} />
      <span className="num text-sm font-extrabold text-amber-600 dark:text-amber-400">
        {Math.round(balance).toLocaleString('en')}
      </span>
    </motion.button>
  )
}
