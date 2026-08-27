import { useEffect } from 'react'
import { db } from '../lib/db'
import type { DesignSettings } from '../lib/types'

const FALLBACK = "'Inter', 'Geist', system-ui, sans-serif"

/** Applies the platform-wide custom font + letter-spacing to :root. */
export function applyTypography(s: DesignSettings) {
  const root = document.documentElement
  if (s.font_url) {
    const face = new FontFace('CalistaCustom', `url(${s.font_url})`)
    face
      .load()
      .then((f) => {
        document.fonts.add(f)
        root.style.setProperty('--app-font', `'CalistaCustom', ${FALLBACK}`)
      })
      .catch(() => root.style.removeProperty('--app-font'))
  } else {
    root.style.removeProperty('--app-font')
  }
  root.style.setProperty('--app-ls', `${s.font_letter_spacing ?? 0}em`)
}

/** Mounted once in App — loads design settings and applies typography
 *  to every user of the platform (printable documents excluded via CSS). */
export function FontLoader() {
  useEffect(() => {
    let cancelled = false
    db.getDesignSettings().then((s) => {
      if (!cancelled) applyTypography(s)
    })
    return () => { cancelled = true }
  }, [])
  return null
}
