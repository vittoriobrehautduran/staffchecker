import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar, CircleHelp, ClipboardList, Eye, FileText, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Shield, Users, X } from 'lucide-react'
import { SettingsDialog } from './SettingsDialog'

type AppSidebarProps = {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  desktopCollapsed: boolean
  onDesktopCollapsedToggle: () => void
}

// Left rail navigation: teal accent bar on the active item (Netlify-style).
function sidebarItemClass(active: boolean, collapsed: boolean) {
  return cn(
    'relative flex items-center gap-3 rounded-r-lg py-2.5 pl-3 pr-2 text-sm font-medium transition-colors',
    'border-l-[3px] border-transparent',
    collapsed && 'md:justify-center md:gap-0 md:px-2',
    active
      ? 'border-primary bg-primary/10 text-foreground'
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
  )
}

export function AppSidebar({
  mobileOpen,
  onMobileOpenChange,
  desktopCollapsed,
  onDesktopCollapsedToggle,
}: AppSidebarProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSupportOpen, setIsSupportOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  const supportRootRef = useRef<HTMLDivElement>(null)
  const iconRail = desktopCollapsed && isDesktop

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    onMobileOpenChange(false)
  }, [location.pathname, onMobileOpenChange])

  useEffect(() => {
    setIsSupportOpen(false)
  }, [desktopCollapsed])

  // Close support on outside tap/click. Deferred so the same gesture that opened it does not close it.
  useEffect(() => {
    if (!isSupportOpen) return

    const onOutside = (e: Event) => {
      const root = supportRootRef.current
      const target = e.target
      if (!(target instanceof Node) || !root?.contains(target)) {
        setIsSupportOpen(false)
      }
    }

    const timeoutId = window.setTimeout(() => {
      document.addEventListener('mousedown', onOutside)
      document.addEventListener('touchstart', onOutside, { capture: true, passive: true })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside, { capture: true })
    }
  }, [isSupportOpen])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navLabelClass = desktopCollapsed ? 'md:sr-only' : undefined

  return (
    <aside
      id="app-sidebar"
      className={cn(
        'fixed left-0 top-0 z-50 flex h-dvh max-h-dvh flex-col overflow-visible border-y-0 border-l-0 border-r border-border bg-card shadow-sm',
        'w-56 transition-[width,transform] duration-200 ease-out',
        desktopCollapsed && 'md:w-16',
        'rounded-r-xl md:rounded-r-2xl',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        !mobileOpen && 'pointer-events-none md:pointer-events-auto'
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-border px-3 md:px-4',
          desktopCollapsed && 'md:h-auto md:flex-col md:gap-2 md:px-2 md:py-3'
        )}
      >
        <img
          src="/logo.jpg"
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-border"
        />
        <div className={cn('min-w-0 flex-1', desktopCollapsed && 'md:hidden')}>
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">Staffcheck</p>
          <p className="truncate text-[11px] text-muted-foreground">Timrapportering</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden shrink-0 md:inline-flex"
          aria-pressed={desktopCollapsed}
          aria-label={desktopCollapsed ? 'Visa sidomeny' : 'Fäll ihop sidomeny'}
          onClick={onDesktopCollapsedToggle}
        >
          {desktopCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          aria-label="Stäng meny"
          onClick={() => onMobileOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-visible overflow-y-auto p-2 pt-4"
        aria-label="Huvudnavigering"
      >
        <NavLink
          to="/dashboard"
          end
          title={iconRail ? 'Översikt' : undefined}
          className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
        >
          <LayoutDashboard className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span className={navLabelClass}>Översikt</span>
        </NavLink>
        <NavLink
          to="/report"
          end
          title={iconRail ? 'Kalender' : undefined}
          className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
        >
          <Calendar className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span className={navLabelClass}>Kalender</span>
        </NavLink>
        <NavLink
          to="/preview"
          title={iconRail ? 'Förhandsvisa' : undefined}
          className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
        >
          <Eye className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span className={navLabelClass}>Förhandsvisa</span>
        </NavLink>
        {user?.hasClubAccess && (
          <NavLink
            to="/club"
            title={iconRail ? (user.hasClubBossAccess ? 'Klubbschema' : 'Närvaro') : undefined}
            className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
            data-testid="nav-club"
          >
            <Users className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={navLabelClass}>
              {user.hasClubBossAccess ? 'Klubbschema' : 'Närvaro'}
            </span>
          </NavLink>
        )}
        {user?.hasEmployeeReportsAccess && (
          <NavLink
            to="/employee-reports"
            title={iconRail ? 'Personal' : undefined}
            className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
          >
            <ClipboardList className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={navLabelClass}>Personal</span>
          </NavLink>
        )}
        {user?.isAdmin && (
          <NavLink
            to="/admin"
            title={iconRail ? 'Admin' : undefined}
            className={({ isActive }) => sidebarItemClass(isActive, desktopCollapsed)}
          >
            <Shield className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={navLabelClass}>Admin</span>
          </NavLink>
        )}

        <div ref={supportRootRef} className="relative mt-auto">
          <button
            type="button"
            className={cn(
              'relative flex w-full items-center gap-2.5 rounded-r-lg border-l-[3px] border-transparent py-2 pl-3 pr-2 text-left text-[11px] font-medium leading-tight text-muted-foreground transition-colors',
              'hover:bg-muted/50 hover:text-foreground',
              desktopCollapsed && 'md:justify-center md:gap-0 md:px-2',
              isSupportOpen && 'bg-muted/40 text-foreground'
            )}
            title={iconRail ? 'Support' : undefined}
            aria-expanded={isSupportOpen}
            aria-controls="sidebar-support-panel"
            id="sidebar-support-trigger"
            onClick={(e) => {
              e.stopPropagation()
              setIsSupportOpen((prev) => !prev)
            }}
          >
            <CircleHelp className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <span className={navLabelClass}>Support</span>
          </button>

          {isSupportOpen && (
            <div
              className={cn(
                'absolute z-[60]',
                iconRail
                  ? 'bottom-0 left-full ml-2 w-56'
                  : 'bottom-full left-0 right-0 pb-1'
              )}
            >
              <div
                id="sidebar-support-panel"
                role="region"
                aria-labelledby="sidebar-support-trigger"
                className="max-h-[min(40vh,18rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-snug text-popover-foreground shadow-lg"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Support</p>
                <p className="mt-1.5">
                  Om du stöter på problem, kontakta oss via:
                </p>
                <a
                  href="mailto:contact@brehautconsulting.com"
                  className="mt-1.5 block break-all font-medium text-primary underline underline-offset-2 hover:opacity-90"
                >
                  contact@brehautconsulting.com
                </a>
                <p className="mt-1.5">
                  eller ring{' '}
                  <a
                    href="tel:+46736463045"
                    className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
                  >
                    0736463045
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={iconRail ? user?.name || 'Konto' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50',
                desktopCollapsed && 'md:justify-center md:px-1'
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className={cn('min-w-0 flex-1', desktopCollapsed && 'md:hidden')}>
                <p className="truncate text-sm font-medium text-foreground">{user?.name || 'Användare'}</p>
                <p className="truncate text-xs text-muted-foreground">Konto</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={iconRail ? 'right' : 'top'}
            className="w-56"
          >
            <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Inställningar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                <FileText className="mr-2 h-4 w-4" />
                Integritetspolicy
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                <FileText className="mr-2 h-4 w-4" />
                Användarvillkor
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logga ut
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </aside>
  )
}
