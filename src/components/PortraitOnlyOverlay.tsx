import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCw } from 'lucide-react'

/**
 * Phones refuse to stay portrait — if the user hasn't locked rotation at
 * the OS level, the app rotates into landscape and the layout breaks.
 * Tablets are fine in landscape (more screen real estate).
 *
 * Strategy:
 *  1. The PWA manifest declares `"orientation": "portrait"` so the
 *     installed app launches portrait and most PWAs won't auto-rotate.
 *  2. In installed-PWA mode, attempt `screen.orientation.lock('portrait')`
 *     which actually prevents rotation at the OS level.  This throws
 *     outside installed PWAs, so we swallow the error.
 *  3. Fallback: if the device still ends up in landscape AND it's a
 *     phone-sized viewport (smaller dimension < 600px), render a full-
 *     screen overlay asking the user to rotate back.  Tablets are left
 *     alone — they're usable in either orientation.
 */
export function PortraitOnlyOverlay() {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    // Try the OS-level orientation lock.  Only works inside an installed
    // PWA (display-mode: standalone).  Outside that, the promise rejects
    // and we fall back to the CSS overlay.
    const sw = screen as Screen & {
      orientation?: { lock?: (o: string) => Promise<void> }
    }
    if (sw.orientation?.lock) {
      sw.orientation.lock('portrait').then(() => setLocked(true)).catch(() => {/* ignore */})
    }

    function unlock() {
      try {
        const sw = screen as Screen & {
          orientation?: { unlock?: () => void }
        }
        sw.orientation?.unlock?.()
      } catch { /* ignore */ }
    }
    return () => { if (locked) unlock() }
  }, [locked])

  // Render the rotate-back overlay when on a phone in landscape.
  const [showRotate, setShowRotate] = useState(false)

  useEffect(() => {
    function check() {
      // smaller screen dimension — phones are < 600px on the short side,
      // tablets are >= 600px.  Use the visualViewport when available
      // because it accounts for browser chrome on mobile.
      const vw = window.visualViewport?.width ?? window.innerWidth
      const vh = window.visualViewport?.height ?? window.innerHeight
      const smaller = Math.min(vw, vh)
      const isPhone = smaller < 600
      // Landscape: width > height (strict, so a square device isn't flagged).
      const isLandscape = vw > vh
      setShowRotate(isPhone && isLandscape)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    if (typeof screen !== 'undefined' && (screen as any).orientation) {
      (screen as any).orientation.addEventListener?.('change', check)
    }
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
      const so = (screen as any).orientation
      if (so?.removeEventListener) so.removeEventListener('change', check)
    }
  }, [])

  if (!showRotate) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-4 bg-ink-900 px-8 text-center text-white"
      role="alert"
      aria-live="assertive"
    >
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10">
        <RotateCw size={28} strokeWidth={1.75} className="text-white animate-pulse" />
      </div>
      <p className="text-lg font-semibold">Rotate your device</p>
      <p className="max-w-xs text-sm text-white/60 leading-relaxed">
        Calista Concept is designed for portrait mode on phones. Please rotate
        your device back upright to continue. Tablets can stay in any orientation.
      </p>
    </div>,
    document.body,
  )
}
