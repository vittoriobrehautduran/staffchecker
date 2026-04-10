import { Link } from 'react-router-dom'

const lastUpdated = '2026-04-10'

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm text-muted-foreground">Staffcheck - Timrapportering</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Integritetspolicy (GDPR)</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Denna policy förklarar vilka personuppgifter vi behandlar i appen, varför vi gör det och vilka
            rättigheter du har enligt GDPR.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Senast uppdaterad: {lastUpdated}</p>
        </header>

        <section className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">1. Personuppgiftsansvarig</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tennisklubben är personuppgiftsansvarig för behandling av personuppgifter i Staffcheck. Kontakt:
              klubbstyrelsen eller utsedd administrativ kontaktperson.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">2. Vilka uppgifter vi behandlar</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Grunduppgifter: namn, e-postadress, roll och kontoinformation.</li>
              <li>Arbetsuppgifter: inrapporterade timmar, datum, arbetspass och kommentarer.</li>
              <li>Tekniska uppgifter: inloggningsloggar, tidsstämplar och systemhändelser för säkerhet.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">3. Ändamål och laglig grund</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Administrera personal- och timrapportering (avtal och berättigat intresse).</li>
              <li>Hantera bokföring och underlag till lön/ersättning (rättslig förpliktelse).</li>
              <li>Skydda konton och förebygga missbruk i systemet (berättigat intresse).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">4. Lagringstid</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Vi sparar endast uppgifter så länge det behövs för ändamålet eller enligt lagkrav. Exempel:
              bokföringsunderlag sparas enligt gällande bokföringsregler, medan inaktuella konton gallras eller
              anonymiseras när de inte längre behövs.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">5. Delning av uppgifter</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Uppgifter delas endast med leverantörer som behövs för drift av systemet (t.ex. hosting, e-post
              eller databastjänster) och då med personuppgiftsbiträdesavtal (DPA).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">6. Dina rättigheter</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Få information om vilka uppgifter vi har om dig (registerutdrag).</li>
              <li>Begära rättelse av felaktiga uppgifter.</li>
              <li>Begära radering eller begränsning när lagstiftning tillåter det.</li>
              <li>Invända mot viss behandling som bygger på berättigat intresse.</li>
              <li>Lämna klagomål till Integritetsskyddsmyndigheten (IMY).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">7. Säkerhet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Vi använder behörighetsstyrning, krypterad överföring (HTTPS), loggning av viktiga händelser och
              kontinuerliga uppdateringar för att skydda personuppgifter.
            </p>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link className="font-medium text-primary hover:underline" to="/terms">
            Läs användarvillkor
          </Link>
          <Link className="font-medium text-primary hover:underline" to="/login">
            Till inloggning
          </Link>
        </div>
      </div>
    </main>
  )
}
