import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Calendar, Eye, Settings } from 'lucide-react'
import { SettingsDialog } from './SettingsDialog'

export function Header() {
  const { isSignedIn, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  if (!isSignedIn) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-gray-900/60 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <img 
                src="/logo.jpg" 
                alt="Spånga TBK Logo" 
                className="h-10 w-10 object-contain"
              />
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Staff Checker
              </h1>
            </div>
            <nav className="hidden md:flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/report')}
                className="hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Kalender
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/preview')}
                className="hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Eye className="h-4 w-4 mr-2" />
                Förhandsvisa
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.name || 'Användare'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Inställningar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 dark:text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </div>
      </div>
    </header>
  )
}
