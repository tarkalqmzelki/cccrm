import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useCountUp } from '../leaderboard/useCountUp'
import { colorAtCircle } from './gaugeColors'

/**
 * Radial tick-bar gauge (Apple-style): 48 rounded radial bars around a
 * clean center, colors sweeping coral → slate → teal → green around
 * the circle. Score counts up dead-center. The whole gauge breathes
 * with a gentle pulsating scale. No shadows/borders.
 */
export function LeadScoreGauge({
  score,
  label = 'Lead Score',
  size = 280,
  bars = 48,
  barWidth = 4,
  barLength = 24,
  barGap = 4,
  pulsate = true,
}: {
  /** 0–100 */
  score: number
  label?: string
  size?: number
  bars?: number
  barWidth?: number
  barLength?: number
  barGap?: number
  /** Gentle breathing animation (respects reduced-motion). */
  pulsate?: boolean
}) {
  const cx = size / 2
  const outerR = cx - 8
  const innerR = outerR - barLength

  const animated = useCountUp(score, 1.4)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      className="relative select-none"
      style={{ width: size, height: size }}
      animate={pulsate ? { scale: [1, 1.04, 1] } : undefined}
      transition={pulsate ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(score)}`}>
        {Array.from({ length: bars }, (_, i) => {
          const t = i / bars
          const angleDeg = t * 360 - 90 // 0 = top
          const angle = (angleDeg * Math.PI) / 180
          const color = colorAtCircle(t)
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          const x1 = cx + innerR * cos
          const y1 = cx + innerR * sin
          const x2 = cx + (innerR + barLength) * cos
          const y2 = cx + (innerR + barLength) * sin
          return (
            <motion.line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={barWidth}
              strokeLinecap="round"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={mounted ? { opacity: [1, 0.72, 1], scale: 1 } : {}}
              transition={{
                opacity: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: (i / bars) * 1.2 },
                scale: { duration: 0.4, delay: i * (0.9 / bars), ease: [0.22, 1, 0.36, 1] },
              }}
              style={{ transformOrigin: `${x1}px ${y1}px` }}
            />
          )
        })}
      </svg>
      {/* Clean center */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="num leading-none text-ink-500 dark:text-white"
          style={{
            fontSize: size * 0.186,
            fontWeight: 300,
            letterSpacing: '-0.01em',
            transform: 'translateY(-14%)',
          }}
        >
          {Math.round(animated)}
        </span>
        <span
          className="text-ink-400 dark:text-white/90"
          style={{ fontSize: Math.max(size * 0.057, 11), fontWeight: 400, marginTop: size * 0.02 }}
        >
          {label}
        </span>
      </div>
    </motion.div>
  )
}
