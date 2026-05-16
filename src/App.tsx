import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedLayout from '@/components/Layout/ProtectedLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import VerifyEmail from '@/pages/VerifyEmail'
import Dashboard from '@/pages/Dashboard'
import Report from '@/pages/Report'
import Preview from '@/pages/Preview'
import Admin from '@/pages/Admin'
import Debug from '@/pages/Debug'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import TermsOfUse from '@/pages/TermsOfUse'

// After OAuth or a fresh sign-in, land on dashboard without leaving /login in the back stack.
function PostAuthNavigation() {
  const { isSignedIn, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading || !isSignedIn) return

    const { pathname, search } = location
    const isOAuthCallback = search.includes('code=') || search.includes('state=')
    const shouldLeaveAuthShell =
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/verify-email' ||
      isOAuthCallback

    if (shouldLeaveAuthShell) {
      navigate('/dashboard', { replace: true })
    }
  }, [isLoading, isSignedIn, location.pathname, location.search, navigate])

  return null
}

function App() {
  return (
    <div className="min-h-screen bg-background">
      <PostAuthNavigation />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/debug" element={<Debug />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfUse />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/report" element={<Report />} />
          <Route path="/preview" element={<Preview />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </div>
  )
}

export default App
