import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { LogOut, Calendar, Eye, Clock } from 'lucide-react'

export function Header() {
  const { isSignedIn, user, signOut } = useAuth()
  const navigate = useNavigate()

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
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Staff Checker
              </h1>
            </div>
            <nav className="hidden md:flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              >
                Dashboard
              </Button>
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
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {user?.name || 'Användare'}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Logga ut</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
