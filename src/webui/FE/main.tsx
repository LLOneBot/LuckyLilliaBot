import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { setGlassSource } from './utils/glassRuntime'
import GlassDebug from './components/common/GlassDebug'
import './index.css'

// Apply the theme class before first paint. Without this the dark background
// gradient swaps in after hydration and the whole page flashes light.
// themeStore persists only `mode`, so resolve `auto` against the OS here.
const savedTheme = localStorage.getItem('llbot-theme')
try {
  const mode = savedTheme ? JSON.parse(savedTheme)?.state?.mode : null
  const isDark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (isDark) {
    document.documentElement.classList.add('dark')
  }
} catch {
  // Unparseable storage: fall through to the light default
}

// Dev hook, same as styleguide.tsx: lets a test swap or disable the wallpaper
// source the glass runtime copies from.
if (import.meta.env.DEV) {
  ;(window as unknown as { __glass: unknown }).__glass = { setGlassSource }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {new URLSearchParams(window.location.search).has('glassdebug') && <GlassDebug />}
  </React.StrictMode>,
)
