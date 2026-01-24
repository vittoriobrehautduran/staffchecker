import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SetupMessage() {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (clerkKey && clerkKey !== 'pk_test_placeholder') {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Konfiguration krävs</CardTitle>
          <CardDescription>
            Du behöver konfigurera miljövariabler för att använda appen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Steg 1: Skapa Clerk-konto</h3>
            <p className="text-sm text-muted-foreground mb-2">
              1. Gå till{' '}
              <a
                href="https://dashboard.clerk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                https://dashboard.clerk.com
              </a>
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              2. Skapa ett nytt projekt
            </p>
            <p className="text-sm text-muted-foreground">
              3. Kopiera din Publishable Key
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Steg 2: Uppdatera .env.local</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Öppna filen <code className="bg-muted px-1 rounded">.env.local</code> i projektets rotmapp
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Ersätt <code className="bg-muted px-1 rounded">pk_test_placeholder</code> med din riktiga Clerk Publishable Key
            </p>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_din_riktiga_nyckel_här
            </pre>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Steg 3: Starta om utvecklingsservern</h3>
            <p className="text-sm text-muted-foreground">
              Stoppa servern (Ctrl+C) och kör <code className="bg-muted px-1 rounded">npm run dev</code> igen
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

