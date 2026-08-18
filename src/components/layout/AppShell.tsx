import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileNav } from './MobileNav'
import { NotificationPromptModal } from '../NotificationPromptModal'

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileNav />
      {/* First-login notification subscribe prompt — pops once per
          device on a fresh sign-in so the user is asked to opt into
          push. After they answer (or dismiss), it stays dismissed and
          they manage push from Settings like before. */}
      <NotificationPromptModal />
    </div>
  )
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl">{children}</div>
}
