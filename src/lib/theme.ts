export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cccrm-theme'

/** Read the user's saved theme. Falls back to the OS preference. */
export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* private mode */ }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

/** Apply a theme to the document + update the meta theme-color. */
export function setTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }

  // Update the meta theme-color so the PWA / browser chrome matches.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#FAFAFA')
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/** Initialise on app load — call from main.tsx or an inline script. */
export function initTheme() {
  setTheme(getTheme())
}
