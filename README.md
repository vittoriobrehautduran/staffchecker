# Staff Checker

En applikation för att rapportera arbetade timmar för tennisklubbens anställda.

## Arkitektur

Appen använder:
- **Frontend**: AWS Amplify (React + Vite)
- **Backend**: AWS Lambda functions via API Gateway
- **Databas**: Neon PostgreSQL
- **Autentisering**: Better Auth

## Utveckling

### Första gången

1. Installera beroenden:
```bash
npm install
```

2. Skapa `.env.local` fil med dina miljövariabler:
```env
# API Gateway URL (för lokal utveckling, använd din API Gateway URL)
VITE_API_BASE_URL=https://xxxxx.execute-api.region.amazonaws.com/prod

# Databas
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# AWS SES för e-post
AWS_SES_REGION=eu-north-1
AWS_SES_ACCESS_KEY_ID=...
AWS_SES_SECRET_ACCESS_KEY=...
BOSS_EMAIL_ADDRESS=boss@example.com

# Better Auth secret (generera med: openssl rand -base64 32)
BETTER_AUTH_SECRET=...
```

**Viktigt för DATABASE_URL:**
- Kopiera endast connection string från Neon (utan `psql` prefix eller citattecken)
- Format: `postgresql://user:password@host/database?sslmode=require`
- Exempel: `postgresql://neondb_owner:password@ep-xxx.aws.neon.tech/neondb?sslmode=require`

3. För lokal utveckling (endast frontend):
```bash
npm run dev
```

**OBS:** För full funktionalitet behöver du köra Lambda-funktionerna lokalt eller använda din API Gateway URL i `VITE_API_BASE_URL`.

## Bygga för produktion

```bash
npm run build
```

## Deployment

### Frontend (AWS Amplify)

1. Gå till [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Klicka "New app" → "Host web app"
3. Anslut ditt GitHub repository
4. Build-inställningar är redan konfigurerade i `amplify.yml`
5. Sätt miljövariabler:
   - `VITE_API_BASE_URL`: Din API Gateway URL
6. Deploy

### Backend (AWS Lambda)

Alla Lambda-funktioner finns i `lambda/` mappen. Se `AWS_MIGRATION.md` för detaljerade instruktioner om hur du:
- Skapar Lambda-funktioner
- Konfigurerar API Gateway
- Sätter miljövariabler i Lambda

**Viktiga miljövariabler för Lambda:**
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` (din Amplify frontend URL)
- `AWS_SES_REGION`
- `AWS_SES_ACCESS_KEY_ID`
- `AWS_SES_SECRET_ACCESS_KEY`
- `BOSS_EMAIL_ADDRESS`

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
