/* =====================================================================
 * GAUGE PALETTE — shared Apple-style spectrum used by the Lead Score
 * gauge and the calendar heat overlay.
 * Coral/pink → slate gray-blue → cyan/teal → light green, smoothly
 * interpolated around the circle / across the intensity scale.
 * ===================================================================== */

export const GAUGE_CORAL = '#F28C8C'
export const GAUGE_SLATE = '#CBD5E1'
export const GAUGE_TEAL = '#52C7C9'
export const GAUGE_GREEN = '#B9E87A'

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Anchor points around the circle (t ∈ [0,1), 0 = top, clockwise). */
const CIRCLE_ANCHORS: Array<{ t: number; hex: string }> = [
  { t: 0.0, hex: GAUGE_SLATE }, // top — blends back from coral side
  { t: 0.125, hex: GAUGE_GREEN }, // upper-right
  { t: 0.375, hex: GAUGE_TEAL }, // bottom-right
  { t: 0.625, hex: GAUGE_SLATE }, // bottom-left
  { t: 0.75, hex: GAUGE_CORAL }, // left
  { t: 1.0, hex: GAUGE_SLATE }, // wraps toward top-left/top
]

/** Smooth color at position t around the gauge ring. */
export function colorAtCircle(t: number): string {
  const x = ((t % 1) + 1) % 1
  let a = CIRCLE_ANCHORS[0]
  let b = CIRCLE_ANCHORS[CIRCLE_ANCHORS.length - 1]
  for (let i = 0; i < CIRCLE_ANCHORS.length - 1; i++) {
    if (x >= CIRCLE_ANCHORS[i].t && x <= CIRCLE_ANCHORS[i + 1].t) {
      a = CIRCLE_ANCHORS[i]
      b = CIRCLE_ANCHORS[i + 1]
      break
    }
  }
  const span = b.t - a.t || 1
  const f = (x - a.t) / span
  const ca = hexToRgb(a.hex)
  const cb = hexToRgb(b.hex)
  return rgbToHex([
    lerp(ca[0], cb[0], f),
    lerp(ca[1], cb[1], f),
    lerp(ca[2], cb[2], f),
  ])
}

/**
 * Intensity scale (calendar heat overlay): low activity warms coral,
 * mid cools through slate/teal, high lands on light green.
 */
const SCALE_ANCHORS: Array<{ t: number; hex: string }> = [
  { t: 0.0, hex: GAUGE_SLATE },
  { t: 0.35, hex: GAUGE_TEAL },
  { t: 0.7, hex: GAUGE_GREEN },
  { t: 1.0, hex: GAUGE_GREEN },
]

export function colorForIntensity(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  let a = SCALE_ANCHORS[0]
  let b = SCALE_ANCHORS[SCALE_ANCHORS.length - 1]
  for (let i = 0; i < SCALE_ANCHORS.length - 1; i++) {
    if (x >= SCALE_ANCHORS[i].t && x <= SCALE_ANCHORS[i + 1].t) {
      a = SCALE_ANCHORS[i]
      b = SCALE_ANCHORS[i + 1]
      break
    }
  }
  const span = b.t - a.t || 1
  const f = (x - a.t) / span
  const ca = hexToRgb(a.hex)
  const cb = hexToRgb(b.hex)
  return rgbToHex([
    lerp(ca[0], cb[0], f),
    lerp(ca[1], cb[1], f),
    lerp(ca[2], cb[2], f),
  ])
}
