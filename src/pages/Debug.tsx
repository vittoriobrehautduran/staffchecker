import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function Debug() {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [localStorageData, setLocalStorageData] = useState<Record<string, string>>({})

  useEffect(() => {
    // Load all debug info from localStorage
    const signInResponse = localStorage.getItem('debug-signin-response')
    const signInFinal = localStorage.getItem('debug-signin-final')
    const sessionToken = localStorage.getItem('better-auth-session-token')
    
    // Get all localStorage items
    const allStorage: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        allStorage[key] = localStorage.getItem(key) || ''
      }
    }

    setLocalStorageData(allStorage)
    
    try {
      setDebugInfo({
        signInResponse: signInResponse ? JSON.parse(signInResponse) : null,
        signInFinal: signInFinal ? JSON.parse(signInFinal) : null,
        sessionToken: sessionToken ? {
          length: sessionToken.length,
          preview: sessionToken.substring(0, 30) + '...',
          isFullToken: sessionToken.length > 50,
        } : null,
      })
    } catch (e) {
      console.error('Error parsing debug info:', e)
    }
  }, [])

  const clearDebug = () => {
    localStorage.removeItem('debug-signin-response')
    localStorage.removeItem('debug-signin-final')
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>🔍 Debug Information</CardTitle>
            <CardDescription>
              Temporary debug page to diagnose mobile Safari authentication issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={clearDebug} variant="outline">
                Clear Debug Data
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline">
                Refresh
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">SignIn Response Debug</h3>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-64">
                  {JSON.stringify(debugInfo?.signInResponse, null, 2) || 'No data found'}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">SignIn Final Debug</h3>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-64">
                  {JSON.stringify(debugInfo?.signInFinal, null, 2) || 'No data found'}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Session Token Status</h3>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto">
                  {JSON.stringify(debugInfo?.sessionToken, null, 2) || 'No token found'}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">All LocalStorage Items</h3>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                  {JSON.stringify(localStorageData, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">User Agent</h3>
                <pre className="bg-muted p-4 rounded-md text-xs">
                  {navigator.userAgent}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Cookies</h3>
                <pre className="bg-muted p-4 rounded-md text-xs">
                  {document.cookie || 'No cookies found'}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

