# Staffcheck

En applikation för att rapportera arbetade timmar för tennisklubbens anställda.

## Arkitektur

Appen använder:
- **Frontend**: AWS Amplify (React + Vite)
- **Backend**: AWS Lambda functions via API Gateway
- **Databas**: Neon PostgreSQL
- **Autentisering**: AWS Cognito

## Personuppgifter och säkerhet (GDPR / biträde)

För underbiträden, var data lagras, autentisering, loggar och kända tekniska luckor — se **[docs/personuppgifter-och-sakerhet.md](docs/personuppgifter-och-sakerhet.md)**. Uppdatera den när arkitektur eller leverantörer ändras.

För **staging** med annan mottagare vid inskickad rapport: **[docs/staging-rapport-e-post.md](docs/staging-rapport-e-post.md)** (`VITE_REPORT_SUBMIT_PATH`, Lambda `submit-report-staging`, API Gateway).

**Dedikerad staging API Gateway** (samma rutter som produktion, men `timrapport-staging-*`-Lambdas där de finns): sätt i Amplify **staging** (eller `.env.local`)  
`VITE_API_BASE_URL=https://l910tb5ik1.execute-api.eu-north-1.amazonaws.com/prod`  
Vissa rutter (t.ex. `/auth/{proxy+}`, webauthn, vissa registrerings-endpoints) pekar fortfarande på ARNs från den gamla klonen om motsvarande Lambda saknas i kontot — då fungerar de inte förrän de pekas om eller deployas som `timrapport-staging-*`. För att återskapa API:t från produktion: `python3 scripts/clone-staging-apigateway.py` (kräver AWS CLI).

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
SES_REGION=eu-north-1
AWS_SES_ACCESS_KEY_ID=...
AWS_SES_SECRET_ACCESS_KEY=...
BOSS_EMAIL_ADDRESS=boss@example.com
# Verifierad avsändare i SES (t.ex. noreply@dindomän.se). Sedan EMAIL_BACKUP om den är satt, annars användarens mejl.
REPORT_EMAIL_FROM=noreply@example.com
EMAIL_BACKUP=backup-sender@example.com
```

**Viktigt för DATABASE_URL:**
- Kopiera endast connection string från Neon (utan `psql` prefix eller citattecken)
- Format: `postgresql://user:password@host/database?sslmode=require`
- Exempel: `postgresql://neondb_owner:password@ep-xxx.aws.neon.tech/neondb?sslmode=require`

3. För lokal utveckling:
```bash
npm run dev
```

**Lokal utveckling med AWS Lambda:**
- Frontend körs lokalt på `http://localhost:5173`
- Backend (Lambda) körs på AWS API Gateway — webbläsaren anropar **inte** Neon direkt
- **`npm run dev` använder Neon staging som standard** via staging-API (`VITE_API_BASE_URL_STAGING` i `.env.development`, se `vite.config.ts`)
- För att mot **produktion**-API lokalt: lägg i `.env.local`:
  ```env
  VITE_USE_PROD_API=true
  VITE_API_BASE_URL=https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod
  ```
- `DATABASE_URL_STAGING` i `.env.local` behövs för `npm run set-lambda-env:staging`, inte för Vite

**OBS:** 
- Du kan inte köra Lambda-funktionerna lokalt enkelt (kräver AWS SAM eller Docker)
- För lokal utveckling, använd din API Gateway URL så att alla anrop går till AWS
- Se till att `VITE_API_BASE_URL` är en fullständig URL som börjar med `https://`

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

Alla Lambda-funktioner finns i `lambda/` mappen.
- Skapar Lambda-funktioner
- Konfigurerar API Gateway
- Sätter miljövariabler i Lambda

**Viktiga miljövariabler för Lambda:**
- `DATABASE_URL`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_REGION` (valfritt, annars används `AWS_REGION`)
- `SES_REGION`
- `AWS_SES_ACCESS_KEY_ID`
- `AWS_SES_SECRET_ACCESS_KEY`
- `BOSS_EMAIL_ADDRESS`
- `REPORT_EMAIL_FROM` (valfritt)
- `EMAIL_BACKUP` (valfritt; From om `REPORT_EMAIL_FROM` saknas)
- Utan båda: From = användarens mejl

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
