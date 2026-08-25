import type { CSSProperties, ReactNode } from 'react'

/**
 * Running gradient border — a slowly rotating conic gradient behind a
 * 1px inset surface, so the stroke appears to travel around the card.
 *
 * The rotation is a pure CSS animation (`--mb-speed` custom property)
 * rather than framer-motion, so parent re-renders — like countdown
 * timers ticking every second — never restart the sweep.
 */
export function MotionBorder({
  children,
  colors,
  className = '',
  radius = 'rounded-2xl',
  speed = 6,
  padding = 1,
}: {
  children: ReactNode
  /** 2+ colors for the conic sweep; first color repeats at the end. */
  colors: string[]
  className?: string
  radius?: string
  /** Seconds per full revolution. */
  speed?: number
  padding?: number
}) {
  const sweep = [...colors, colors[0]].join(', ')
  return (
    <div className={`relative overflow-hidden ${radius} ${className}`}>
      {/* Rotating conic sweep — CSS-driven */}
      <div
        aria-hidden
        className="pointer-events-none absolute mb-sweep"
        style={{
          '--mb-speed': `${speed}s`,
          left: '-60%',
          top: '-60%',
          width: '220%',
          height: '220%',
          background: `conic-gradient(from 0deg, ${sweep})`,
        } as CSSProperties}
      />
      {/* Inner surface */}
      <div className={`absolute bg-surface ${radius}`} style={{ inset: padding }} />
      {/* Content */}
      <div className="relative" style={{ margin: padding }}>
        {children}
      </div>
    </div>
  )
}
