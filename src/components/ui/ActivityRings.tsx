import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export interface RingSpec {
  /** Completion 0–100 */
  value: number
  label: string
  /** Gradient stop colors [from, to] */
  colors: [string, string]
}

/**
 * Apple-watch-style concentric activity rings with conic-gradient
 * strokes, spring draw-in and a soft breathing glow.
 */
export function ActivityRings({
  rings,
  size = 168,
  thickness = 13,
  gap = 5,
  delay = 0,
  children,
}: {
  rings: RingSpec[]
  size?: number
  thickness?: number
  gap?: number
  delay?: number
  children?: ReactNode
}) {
  const cx = size / 2

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          {rings.map((r, i) => (
            <linearGradient key={i} id={`ring-grad-${i}-${r.label.replace(/\W/g, '')}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={r.colors[0]} />
              <stop offset="100%" stopColor={r.colors[1]} />
            </linearGradient>
          ))}
        </defs>
        {rings.map((r, i) => {
          const radius = cx - thickness / 2 - i * (thickness + gap)
          const circumference = 2 * Math.PI * radius
          const pct = Math.max(0, Math.min(100, r.value))
          const gradId = `ring-grad-${i}-${r.label.replace(/\W/g, '')}`
          return (
            <g key={i}>
              {/* Track */}
              <circle cx={cx} cy={cx} r={radius} fill="none" strokeWidth={thickness} className="stroke-ink-100 dark:stroke-[rgb(31,31,31)]" />
              {/* Breathing glow */}
              <motion.circle
                cx={cx}
                cy={cx}
                r={radius}
                fill="none"
                stroke={r.colors[0]}
                strokeWidth={thickness}
                strokeLinecap="round"
                opacity={0.18}
                animate={{ opacity: [0.08, 0.22, 0.08] }}
                transition={{ duration: 3, repeat: Infinity, delay: delay + i * 0.35 }}
                style={{ filter: `blur(3px)` }}
              />
              {/* Value arc */}
              <motion.circle
                cx={cx}
                cy={cx}
                r={radius}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
                transition={{ duration: 1.3, delay: delay + 0.2 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
              />
            </g>
          )
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  )
}

/** Ring + caption stack used in stat cards. */
export function RingStat({ ring, delay = 0 }: { ring: RingSpec & { sub?: string }; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-2"
    >
      <ActivityRings rings={[{ value: ring.value, label: ring.label, colors: ring.colors }]} size={104} thickness={10}>
        <span className="num text-sm font-extrabold">{Math.round(ring.value)}%</span>
      </ActivityRings>
      <div className="text-center">
        <p className="text-2xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-300">{ring.label}</p>
        {ring.sub && <p className="text-[10px] text-ink-400 num">{ring.sub}</p>}
      </div>
    </motion.div>
  )
}
