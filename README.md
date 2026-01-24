# Tennis Club Timrapport

En applikation för att rapportera arbetade timmar för tennisklubbens anställda.

## Utveckling

### Första gången

1. Installera beroenden:
```bash
npm install
```

2. Skapa `.env.local` fil med dina miljövariabler:
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
AWS_SES_REGION=eu-north-1
AWS_SES_ACCESS_KEY_ID=...
AWS_SES_SECRET_ACCESS_KEY=...
BOSS_EMAIL_ADDRESS=boss@example.com
```

**Viktigt för DATABASE_URL:**
- Kopiera endast connection string från Neon (utan `psql` prefix eller citattecken)
- Format: `postgresql://user:password@host/database?sslmode=require`
- Exempel: `postgresql://neondb_owner:password@ep-xxx.aws.neon.tech/neondb?sslmode=require`

3. För lokal utveckling med API-funktioner, använd:
```bash
npm run dev:netlify
```

Detta startar både Vite dev server och Netlify Functions lokalt.

### Alternativ: Endast frontend (utan API)

Om du bara vill testa frontend utan API-funktioner:
```bash
npm run dev
```

**OBS:** Registrering och inloggning kräver Netlify Functions, så använd `npm run dev:netlify` för full funktionalitet.

## Bygga för produktion

```bash
npm run build
```

## Deployment

Appen är konfigurerad för Netlify. Efter push till GitHub, deployas automatiskt.

## Databas

**VIKTIGT:** Du måste skapa tabellerna i din Neon-databas innan appen fungerar!

### Steg för att skapa tabeller:

1. Gå till [Neon Console](https://console.neon.tech)
2. Välj ditt projekt
3. Klicka på "SQL Editor"
4. Öppna filen `database/schema.sql` i detta projekt
5. Kopiera allt innehåll och klistra in i SQL Editor
6. Klicka på "Run"

Se `database/README.md` för mer detaljerade instruktioner.

Efter att tabellerna är skapade, bör registrering fungera!
