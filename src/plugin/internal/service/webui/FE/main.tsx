import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { setGlassSource } from './utils/glassRuntime'
import GlassDebug from './components/common/GlassDebug'
import { installSharedModules, startBuiltinClients } from './plugin-host'
import { registerCorePages } from './core'
import './index.css'

installSharedModules()
registerCorePages()
startBuiltinClients()

// A page loaded before the bot updated still asks for chunks of the old build, which are gone: load the new build
// instead of failing, but at most once a minute, so that a chunk failing for any other reason cannot loop
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('llbot-chunk-reload') ?? 0)
  if (Date.now() - last < 60_000) return
  sessionStorage.setItem('llbot-chunk-reload', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

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
