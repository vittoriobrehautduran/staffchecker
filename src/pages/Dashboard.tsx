import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()

  if (!isSignedIn) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-7xl">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              Välkommen! Här kan du hantera dina timrapporter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => navigate('/report')} className="w-full sm:w-auto">
                  Gå till kalender
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/preview')} 
                  className="w-full sm:w-auto"
                >
                  Förhandsvisa rapport
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

