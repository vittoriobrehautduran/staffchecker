import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingOverlay } from '@/components/ui/loading-spinner'
import { Button } from '@/components/ui/button'
import { AppSidebar } from './AppSidebar'
import { Menu } from 'lucide-react'

// Signed-in shell: collapsible drawer on small screens, fixed sidebar from md up.
export default function ProtectedLayout() {
  const { isSignedIn, isLoading } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  useEffect(() => {
    if (!mobileNavOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileNav()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen, closeMobileNav])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (isLoading) {
    return <LoadingOverlay message="Laddar..." />
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground md:h-screen md:max-h-screen md:overflow-hidden">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Stäng meny"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobileNav}
        />
      )}

      <AppSidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />

      {/* Sidebar is fixed; this column scrolls while the rail stays put (md+). */}
      <div className="flex min-h-screen min-w-0 flex-col md:ml-56 md:h-screen md:min-h-0 md:overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            aria-label="Öppna meny"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold tracking-tight text-foreground">Staffcheck</span>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
