import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingOverlay } from '@/components/ui/loading-spinner'
import { Button } from '@/components/ui/button'
import { AppSidebar } from './AppSidebar'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const DESKTOP_SIDEBAR_COLLAPSED_KEY = 'staffcheck-sidebar-collapsed'

function readDesktopSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

// Signed-in shell: drawer on small screens, full or icon rail from md up.
export default function ProtectedLayout() {
  const { isSignedIn, isLoading } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(readDesktopSidebarCollapsed)

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  const toggleDesktopCollapsed = useCallback(() => {
    setDesktopCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // Private mode still toggles for this visit.
      }
      return next
    })
  }, [])

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
    // Document scrolls on all sizes. Avoid md:h-screen + overflow-hidden —
    // that nested scrollport fights Android Chrome when the URL bar shows/hides
    // (especially tablet landscape on the närvaro page).
    // min-h-svh (not dvh): dvh resizes mid-scroll as Chrome chrome hides, which
    // can drop the touch gesture on MediaTek 90Hz tablets (Acer ATB1225E).
    <div
      data-testid="app-shell"
      className="relative min-h-svh bg-background text-foreground"
    >
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Stäng meny"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobileNav}
        />
      )}

      <AppSidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        desktopCollapsed={desktopCollapsed}
        onDesktopCollapsedToggle={toggleDesktopCollapsed}
      />

      {/* Sidebar is fixed; the page (document) scrolls while the rail stays put. */}
      <div
        data-testid="app-main-column"
        className={cn(
          'flex min-h-svh min-w-0 flex-col touch-pan-y',
          'md:transition-[margin] md:duration-200 md:ease-out',
          desktopCollapsed ? 'md:ml-16' : 'md:ml-56'
        )}
      >
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
