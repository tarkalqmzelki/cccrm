/**
 * LiquidGlassFilter — the displacement-map lens that powers the
 * bottom-nav glass, adapted from the technique behind
 * liquid-glass-studio (Apple-style rim refraction):
 *
 * An SVG map encodes per-axis gradients in the R/G channels, masked so
 * ONLY a rim band around the shape deviates from neutral 0.5. Fed to
 * feDisplacementMap through `backdrop-filter: url(#…)`, the live page
 * behind the pill visibly bends at the edges — real refraction, not
 * frosted blur. Chromium applies it; other engines ignore the url()
 * layer and keep the blur/saturate fallback declared before it.
 */
export function LiquidGlassFilter({ id = 'lq-lens', width = 480, height = 132, radius = 32 }: { id?: string; width?: number; height?: number; radius?: number }) {
  const rim = 26 // width of the refracting rim band

  const map = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>
  <defs>
    <linearGradient id='gx' x1='0' y1='0' x2='1' y2='0'>
      <stop offset='0' stop-color='rgb(0,128,0)'/>
      <stop offset='1' stop-color='rgb(255,128,0)'/>
    </linearGradient>
    <linearGradient id='gy' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='rgb(0,0,0)'/>
      <stop offset='1' stop-color='rgb(0,255,0)'/>
    </linearGradient>
  </defs>
  <g style='isolation:isolate'>
    <rect width='${width}' height='${height}' fill='url(#gy)'/>
    <rect width='${width}' height='${height}' fill='url(#gx)' style='mix-blend-mode:lighter'/>
    <rect x='${rim}' y='${rim}' width='${width - rim * 2}' height='${height - rim * 2}' rx='${Math.max(radius - 12, 0)}' fill='rgb(128,128,0)'/>
  </g>
</svg>`

  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(map.replace(/\n\s*/g, ''))}`

  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
      <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={uri} x="0" y="0" width={width} height={height} result="map" preserveAspectRatio="none" />
        <feGaussianBlur in="map" stdDeviation="3" result="softmap" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softmap"
          scale={90}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  )
}

/** Feature gate: Chromium honours url() filters in backdrop-filter. */
export function supportsLensFilter(): boolean {
  try {
    return typeof CSS !== 'undefined' && !!CSS.supports?.('backdrop-filter', 'url(#lq-lens)')
  } catch {
    return false
  }
}
