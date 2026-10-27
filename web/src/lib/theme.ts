export type Theme = 'light' | 'dark'
const KEY = 'ad-cia-maria:theme'

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null
  if (saved) return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  localStorage.setItem(KEY, t)
}
