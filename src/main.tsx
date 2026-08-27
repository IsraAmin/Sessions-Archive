import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './profile-pwa.css'
import './app-v2.css'
import './app-v2-extras.css'
import './refinements.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL
    void navigator.serviceWorker.register(`${baseUrl}sw.js`, {
      scope: baseUrl,
      updateViaCache: 'none',
    }).then((registration) => {
      void registration.update()
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
