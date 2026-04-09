import { useEffect, useState } from 'react'
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
import { Calendar, Eye, LogOut, Settings, Shield, X } from 'lucide-react'
import { SettingsDialog } from './SettingsDialog'

type AppSidebarProps = {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}

// Left rail navigation: teal accent bar on the active item (Netlify-style).
function sidebarItemClass(active: boolean) {
  return cn(
    'relative flex items-center gap-3 rounded-r-lg py-2.5 pl-3 pr-2 text-sm font-medium transition-colors',
    'border-l-[3px] border-transparent',
    active
      ? 'border-primary bg-primary/10 text-foreground'
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
  )
}

export function AppSidebar({ mobileOpen, onMobileOpenChange }: AppSidebarProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    onMobileOpenChange(false)
  }, [location.pathname, onMobileOpenChange])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <aside
      id="app-sidebar"
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen max-h-dvh w-56 flex-col overflow-hidden border-y-0 border-l-0 border-r border-border bg-card shadow-sm',
        'rounded-r-xl md:rounded-r-2xl',
        'transition-transform duration-200 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        !mobileOpen && 'pointer-events-none md:pointer-events-auto'
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-3 md:px-4">
        <img
          src="/logo.jpg"
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">Staffcheck</p>
          <p className="truncate text-[11px] text-muted-foreground">Timrapportering</p>
        </div>
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
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2 pt-4"
        aria-label="Huvudnavigering"
      >
        <NavLink to="/report" end className={({ isActive }) => sidebarItemClass(isActive)}>
          <Calendar className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span>Kalender</span>
        </NavLink>
        <NavLink to="/preview" className={({ isActive }) => sidebarItemClass(isActive)}>
          <Eye className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          <span>Förhandsvisa</span>
        </NavLink>
        {user?.isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => sidebarItemClass(isActive)}>
            <Shield className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user?.name || 'Användare'}</p>
                <p className="truncate text-xs text-muted-foreground">Konto</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Inställningar
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
