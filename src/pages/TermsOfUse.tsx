import { Link } from 'react-router-dom'

const lastUpdated = '2026-04-10'

export default function TermsOfUse() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm text-muted-foreground">Staffcheck - Timrapportering</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Användarvillkor</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Dessa villkor reglerar hur appen får användas av personal och administrativ personal inom
            tennisklubben. Appen tillhandahålls tekniskt av Brehaut Consulting åt klubben; din användning
            regleras främst i förhållande till klubben som arbetsgivare eller uppdragsgivare.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Senast uppdaterad: {lastUpdated}</p>
        </header>

        <section className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">1. Syfte med appen</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Appen används för rapportering och administration av arbetade timmar samt intern planering i
              klubben. Leverantören (Brehaut Consulting) tillhandahåller plattformen enligt avtal med klubben
              och får behandla personuppgifter enligt integritetspolicyn och GDPR som personuppgiftsbiträde åt
              klubben.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">2. Kontoansvar</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Du ansvarar för att dina inloggningsuppgifter hanteras säkert.</li>
              <li>Du får inte dela konto med andra personer.</li>
              <li>Misstänkt obehörig inloggning ska rapporteras till administratör omedelbart.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">3. Korrekt rapportering</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Du ansvarar för att uppgifter du registrerar är korrekta och uppdaterade. Felaktig rapportering
              kan behöva justeras av administratör.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">4. Otillåten användning</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Det är inte tillåtet att försöka komma åt andras konton eller data utan behörighet.</li>
              <li>Det är inte tillåtet att ladda upp skadlig kod eller sabotera systemets funktion.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">5. Tillgång och ändringar</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Klubben kan uppdatera funktioner, behörigheter och villkor för att uppfylla verksamhetsbehov,
              säkerhetskrav eller rättsliga krav.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">6. Dataskydd</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Behandling av personuppgifter sker enligt vår integritetspolicy och GDPR. Genom att använda appen
              bekräftar du att du har tagit del av dessa villkor.
            </p>
          </div>
        </section>

        <div className="mt-6 text-sm">
          <Link className="font-medium text-primary hover:underline" to="/privacy">
            Läs integritetspolicy
          </Link>
        </div>
      </div>
    </main>
  )
}
