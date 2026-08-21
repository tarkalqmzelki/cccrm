import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { LocaleProvider } from './context/LocaleContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <NotificationsProvider>
          <LocaleProvider>
            <App />
          </LocaleProvider>
        </NotificationsProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
)

/* Register the service worker in production only — powers offline app shell
 * and Web Push notifications on phones. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}
