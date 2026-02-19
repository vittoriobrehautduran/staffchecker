# Troubleshooting: Migration från Netlify till AWS Lambda/Amplify

## Problem: Appen försöker fortfarande använda Netlify Functions

Om du ser `404`-fel för `/.netlify/functions/...` i konsolen, betyder det att appen inte hittar din API Gateway URL.

### Steg 1: Kontrollera miljövariabler i AWS Amplify

1. Gå till [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Välj din app
3. Gå till **App settings** → **Environment variables**
4. Kontrollera att följande variabel finns:
   - **Namn**: `VITE_API_BASE_URL`
   - **Värde**: Din API Gateway URL (t.ex. `https://xxxxx.execute-api.region.amazonaws.com/prod`)
   - **Branch**: Välj rätt branch (vanligtvis `main` eller `master`)

**VIKTIGT**: 
- Variabeln måste börja med `VITE_` för att Vite ska inkludera den i bygget
- Efter att du lagt till/ändrat variabeln, måste du **rebuilda appen**

### Steg 2: Rebuilda appen i Amplify

1. I Amplify Console, gå till din app
2. Klicka på **Redeploy this version** eller gör en ny commit/push till GitHub
3. Vänta tills bygget är klart

### Steg 3: Kontrollera att API Gateway är korrekt konfigurerad

Kontrollera att du har skapat följande routes i API Gateway:

- `/auth` → `auth` Lambda function
- `/auth-personnummer-login` → `auth-personnummer-login` Lambda function  
- `/create-user-better-auth` → `create-user-better-auth` Lambda function
- `/get-entries` → `get-entries` Lambda function
- `/create-entry` → `create-entry` Lambda function
- `/update-entry` → `update-entry` Lambda function
- `/delete-entry` → `delete-entry` Lambda function
- `/get-report` → `get-report` Lambda function
- `/submit-report` → `submit-report` Lambda function

### Steg 4: Kontrollera Lambda-miljövariabler

Varje Lambda-funktion behöver följande miljövariabler:

- `DATABASE_URL` - Din Neon databas-URL
- `BETTER_AUTH_SECRET` - Generera med: `openssl rand -base64 32`
- `BETTER_AUTH_URL` - Din Amplify frontend URL (t.ex. `https://yourapp.amplifyapp.com`)
- `SES_REGION` - t.ex. `eu-north-1`
- `AWS_SES_ACCESS_KEY_ID` - Ditt AWS access key
- `AWS_SES_SECRET_ACCESS_KEY` - Ditt AWS secret key
- `BOSS_EMAIL_ADDRESS` - E-postadress för rapporter

### Steg 5: Testa lokalt

För att testa lokalt, skapa en `.env.local` fil i projektroten:

```env
VITE_API_BASE_URL=https://xxxxx.execute-api.region.amazonaws.com/prod
```

Sedan kör:
```bash
npm run build
npm run preview
```

Eller för utveckling:
```bash
npm run dev
```

### Steg 6: Kontrollera browser console

Öppna browser console (F12) och leta efter:
- Felmeddelanden om `VITE_API_BASE_URL`
- Vilken URL som faktiskt används för API-anrop
- CORS-fel (kan betyda att API Gateway inte är korrekt konfigurerad)

### Vanliga problem

#### Problem: "VITE_API_BASE_URL måste vara satt"
**Lösning**: Sätt miljövariabeln i Amplify och rebuilda

#### Problem: CORS-fel
**Lösning**: Kontrollera att API Gateway har CORS aktiverat och att Lambda-funktionerna returnerar `Access-Control-Allow-Origin: *` header

#### Problem: 404-fel för alla endpoints
**Lösning**: Kontrollera att API Gateway-routes är korrekt konfigurerade och pekar på rätt Lambda-funktioner

#### Problem: "Better Auth handler error"
**Lösning**: Kontrollera att `BETTER_AUTH_SECRET` är satt i Lambda-miljövariabler

### Debugging tips

1. **Kontrollera build logs i Amplify**: Se om `VITE_API_BASE_URL` faktiskt inkluderas i bygget
2. **Kontrollera browser network tab**: Se vilka URL:er som faktiskt anropas
3. **Kontrollera Lambda logs**: Se om funktionerna får requests och vad som händer
4. **Testa API Gateway direkt**: Använd curl eller Postman för att testa API Gateway endpoints direkt

### Exempel på korrekt konfiguration

**Amplify Environment Variables:**
```
VITE_API_BASE_URL=https://abc123.execute-api.eu-north-1.amazonaws.com/prod
```

**Lambda Environment Variables (för auth-funktionen):**
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=https://yourapp.amplifyapp.com
SES_REGION=eu-north-1
AWS_SES_ACCESS_KEY_ID=your-key
AWS_SES_SECRET_ACCESS_KEY=your-secret
BOSS_EMAIL_ADDRESS=boss@example.com
```

**API Gateway URL:**
```
https://abc123.execute-api.eu-north-1.amazonaws.com/prod
```

**API Gateway Routes:**
```
/auth → auth Lambda
/auth-personnummer-login → auth-personnummer-login Lambda
/create-user-better-auth → create-user-better-auth Lambda
... (resten av funktionerna)
```

