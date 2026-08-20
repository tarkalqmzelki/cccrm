import { useState, useEffect } from 'react'
import { getTheme, type Theme } from '../lib/theme'
import { db } from '../lib/db'
import type { DesignSettings } from '../lib/types'
import { DEFAULT_DESIGN_SETTINGS } from '../lib/types'

const DEFAULT_LOGO = 'https://kappa.lol/FAHnNi'

/**
 * Theme-aware logo. Reads the light/dark logo URLs from the
 * `design_settings` table (loaded once on mount); picks the right
 * URL based on the current theme. Falls back to the default
 * Calista logo when unset. Re-renders when the theme changes so
 * the right logo appears instantly when the user toggles.
 *
 * Used in: Sidebar Brand (top-left), Login page, printed documents.
 */
export function Logo({
  className = 'h-8 w-auto',
}: {
  className?: string
}) {
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_DESIGN_SETTINGS)

  // Load design settings once
  useEffect(() => {
    db.getDesignSettings().then(setSettings).catch(() => {})
  }, [])

  // Poll for theme changes (the ThemeToggle mutates the DOM directly,
  // so we poll the .dark class on a 300ms interval — lightweight).
  useEffect(() => {
    const check = () => {
      const t = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      setThemeState(t as Theme)
    }
    const interval = setInterval(check, 300)
    return () => clearInterval(interval)
  }, [])

  const url = theme === 'dark' && settings.logo_url_dark
    ? settings.logo_url_dark
    : theme === 'light' && settings.logo_url_light
      ? settings.logo_url_light
      : DEFAULT_LOGO

  return <img src={url} alt="Calista Concept" className={className} />
}
