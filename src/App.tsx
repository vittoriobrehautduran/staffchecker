import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import ProtectedLayout from '@/components/Layout/ProtectedLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import VerifyEmail from '@/pages/VerifyEmail'
import Report from '@/pages/Report'
import Preview from '@/pages/Preview'
import Admin from '@/pages/Admin'
import Debug from '@/pages/Debug'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/debug" element={<Debug />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/report" element={<Report />} />
          <Route path="/preview" element={<Preview />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="/" element={<Navigate to="/report" replace />} />
      </Routes>
      <Toaster />
    </div>
  )
}

export default App
