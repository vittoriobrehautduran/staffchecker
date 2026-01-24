import { useAuth, useUser, SignOutButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut, Calendar, Eye } from 'lucide-react'

export function Header() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()

  if (!isSignedIn) {
    return null
  }

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-primary">Tennis Club Timrapport</h1>
            <nav className="hidden md:flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/report')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Kalender
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/preview')}
              >
                <Eye className="h-4 w-4 mr-2" />
                Förhandsvisa
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.firstName} {user?.lastName}
            </span>
            <SignOutButton>
              <Button variant="ghost" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Logga ut
              </Button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </header>
  )
}

